using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public record ReturnResult(bool Ok, OrderReturn? Return, string? Error)
{
    public static ReturnResult Fail(string error) => new(false, null, error);
}

/// <summary>Một dòng trả: số lượng và cách xử lý hàng trả về.</summary>
public record ReturnLine(int OrderItemId, int Quantity, ReturnDisposition Disposition);

/// <summary>
/// Trả hàng cho đơn đã hoàn thành trong 7 ngày. Tiền hoàn mỗi món = thành tiền của món (đã trừ khuyến mãi
/// theo món) trừ phần giảm giá chung của đơn (mã, ưu đãi hạng) chia theo tỉ lệ; phí giao không hoàn. Lần
/// trả cuối cùng hoàn nốt phần còn lại để tổng hoàn khớp đúng số khách đã trả. Hàng trả nhập lại kho hoặc
/// xuất huỷ; hàng có hạn dùng chỉ xuất huỷ. Đơn của thành viên bị trừ lại sao và chi tiêu xét hạng theo
/// phần hoàn (đồ có cồn không tính chi tiêu nên không trừ).
/// </summary>
public class ReturnService(AppDbContext db)
{
    public const int Days = 7;

    public static readonly string[] Reasons = ["Hàng lỗi, hỏng", "Giao sai hàng", "Hàng kém chất lượng, sắp hết hạn", "Khách đổi ý", "Khác"];

    public static string Label(ReturnDisposition d) => d == ReturnDisposition.Restock ? "Nhập lại kho" : "Xuất huỷ";

    /// <summary>Lúc đơn hoàn thành: bước "Hoàn thành" trong tiến trình (đơn tại quầy hoàn thành ngay lúc bán).</summary>
    public static DateTime CompletedAt(Order order) =>
        order.Timeline.Where(e => e.Status == OrderStatus.Completed).Select(e => (DateTime?)e.At).Max() ?? order.CreatedAt;

    /// <summary>Hạn chót nhận trả hàng.</summary>
    public static DateTime Deadline(Order order) => CompletedAt(order).AddDays(Days);

    /// <summary>Tiền khách thực trả cho hàng (không gồm phí giao): số tối đa có thể hoàn.</summary>
    public static int Refundable(Order order) => Math.Max(0, order.Total - order.ShippingFee);

    /// <summary>Tiền hoàn cho <paramref name="quantity"/> đơn vị của một dòng, theo tỉ lệ như mô tả ở đầu lớp.</summary>
    public static int RefundFor(Order order, OrderItem item, int quantity)
    {
        if (item.Quantity <= 0 || quantity <= 0) return 0;
        var lines = order.Items.Sum(i => (long)i.LineTotal);
        var share = (long)item.LineTotal * quantity / item.Quantity;
        var orderDiscount = Math.Max(0, order.Discount - order.Items.Sum(i => i.Discount));
        var discount = lines == 0 ? 0 : orderDiscount * share / lines;
        return (int)Math.Max(0, share - discount);
    }

    /// <summary>Đã trả bao nhiêu đơn vị của mỗi dòng (mã dòng → số lượng).</summary>
    public static Dictionary<int, int> Returned(IEnumerable<OrderReturn> returns) =>
        returns.SelectMany(r => r.Items).GroupBy(i => i.OrderItemId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));

    public async Task<ReturnResult> CreateAsync(string orderId, IEnumerable<ReturnLine> lines, string? reason, string? note, string by, DateTime now)
    {
        var why = reason?.Trim() ?? "";
        if (!Reasons.Contains(why)) return ReturnResult.Fail("Chọn lý do trả hàng");
        var text = note?.Trim();
        if (why == "Khác" && string.IsNullOrEmpty(text)) return ReturnResult.Fail("Lý do \"Khác\": ghi rõ trong ô ghi chú");
        if (text?.Length > 200) return ReturnResult.Fail("Ghi chú tối đa 200 ký tự");

        // Khoá trước khi đọc: hai quầy cùng nhận trả một đơn không hoàn tiền hai lần.
        await using var tx = await db.Database.BeginTransactionAsync();
        var order = await db.Orders.Include(o => o.Items).ThenInclude(i => i.Product).Include(o => o.Timeline)
            .AsSplitQuery().FirstOrDefaultAsync(o => o.Id == orderId);
        if (order is null) return ReturnResult.Fail("Không tìm thấy đơn hàng");
        if (order.Status != OrderStatus.Completed) return ReturnResult.Fail("Chỉ trả hàng cho đơn đã hoàn thành");
        if (now > Deadline(order)) return ReturnResult.Fail($"Đơn hoàn thành quá {Days} ngày (hạn trả {Deadline(order):HH:mm dd/MM/yyyy}), không nhận trả hàng");

        var previous = await db.OrderReturns.Include(r => r.Items).Where(r => r.OrderId == order.Id).ToListAsync();
        var returned = Returned(previous);
        var wanted = lines.Where(l => l.Quantity != 0).ToList();
        if (wanted.Count == 0) return ReturnResult.Fail("Nhập số lượng trả cho ít nhất một sản phẩm");
        var plan = new List<(OrderItem Item, int Quantity, ReturnDisposition How)>();
        foreach (var line in wanted)
        {
            var item = order.Items.FirstOrDefault(i => i.Id == line.OrderItemId);
            if (item is null) return ReturnResult.Fail("Có sản phẩm không thuộc đơn này");
            var left = item.Quantity - returned.GetValueOrDefault(item.Id);
            if (line.Quantity < 0) return ReturnResult.Fail("Số lượng trả không được âm");
            if (line.Quantity > left) return ReturnResult.Fail($"{item.Name}: chỉ còn {left} sản phẩm chưa trả");
            if (line.Disposition == ReturnDisposition.Restock && item.Product?.ShelfLifeDays is not null)
                return ReturnResult.Fail($"{item.Name}: hàng có hạn dùng không nhập lại kho, chọn Xuất huỷ");
            plan.Add((item, line.Quantity, line.Disposition));
        }

        var ret = new OrderReturn
        {
            Id = $"th-{Guid.NewGuid():N}"[..11],
            Code = await NextCodeAsync(),
            OrderId = order.Id,
            StoreId = order.StoreId,
            At = now,
            By = by,
            Reason = why,
            Note = string.IsNullOrEmpty(text) ? null : text,
        };
        foreach (var (item, quantity, how) in plan)
            ret.Items.Add(new OrderReturnItem
            {
                OrderItemId = item.Id, ProductId = item.ProductId, Name = item.Name, Quantity = quantity, Disposition = how,
                Refund = RefundFor(order, item, quantity),
            });

        // Trả hết đơn: hoàn nốt phần còn lại để tổng hoàn bằng đúng số khách đã trả (bỏ sai số làm tròn).
        var alreadyRefunded = previous.Sum(r => r.Refund);
        var allBack = order.Items.All(i => returned.GetValueOrDefault(i.Id) + plan.Where(p => p.Item.Id == i.Id).Sum(p => p.Quantity) == i.Quantity);
        if (allBack && ret.Items.Count > 0)
            ret.Items[^1].Refund += Refundable(order) - alreadyRefunded - ret.Items.Sum(i => i.Refund);
        ret.Refund = Math.Min(ret.Items.Sum(i => i.Refund), Refundable(order) - alreadyRefunded);

        // Kho: nhập lại thì cộng tồn; xuất huỷ thì tồn không đổi nhưng vẫn ghi nhật ký để tra được.
        var ids = plan.Select(p => p.Item.ProductId).Distinct().ToList();
        var levels = await db.StockLevels.Where(s => s.StoreId == order.StoreId && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        foreach (var (item, quantity, how) in plan)
        {
            if (!levels.TryGetValue(item.ProductId, out var level))
            {
                level = new StockLevel { StoreId = order.StoreId, ProductId = item.ProductId, MinQuantity = InventoryService.DefaultMinQuantity };
                db.StockLevels.Add(level);
                levels[item.ProductId] = level;
            }
            var delta = how == ReturnDisposition.Restock ? quantity : 0;
            level.Quantity += delta;
            db.StockMovements.Add(new StockMovement
            {
                StoreId = order.StoreId, ProductId = item.ProductId, At = now, Delta = delta, QuantityAfter = level.Quantity,
                Kind = how == ReturnDisposition.Restock ? StockMovementKind.ReturnRestock : StockMovementKind.ReturnDiscard,
                Ref = ret.Code, By = by, Reason = why,
                Note = how == ReturnDisposition.Restock ? $"Khách trả {quantity} từ đơn {order.Code}" : $"Khách trả {quantity} từ đơn {order.Code}, xuất huỷ",
            });
        }

        // Thành viên: trừ lại chi tiêu xét hạng và sao theo phần hoàn của hàng được tính chi tiêu.
        var customer = order.CustomerId is null ? null : await db.Customers.FindAsync(order.CustomerId);
        if (customer is not null)
        {
            customer.TotalSpent = Math.Max(0, customer.TotalSpent - ret.Refund);
            if (order.MemberSpend is int memberSpend)
            {
                var eligible = ret.Items.Where(i => !MembershipService.NonEligibleCategoryIds.Contains(
                    order.Items.First(x => x.Id == i.OrderItemId).Product?.CategoryId ?? "")).Sum(i => i.Refund);
                var spend = Math.Min(eligible, Math.Max(0, memberSpend - previous.Sum(r => r.SpendTaken)));
                if (spend > 0)
                {
                    var (stars, carry, taken) = StarService.TakeBack(customer.Stars, customer.StarCarry, spend, 0);
                    customer.Stars = stars;
                    customer.StarCarry = carry;
                    var lastDrop = (await db.TierChanges.Where(t => t.CustomerId == customer.Id).ToListAsync())
                        .Where(t => Array.IndexOf(MembershipService.Order, t.To) < Array.IndexOf(MembershipService.Order, t.From))
                        .MaxBy(t => t.At)?.At;
                    MembershipService.RemoveTierSpend(customer, spend, order.CreatedAt, lastDrop, now,
                        $"Trả hàng đơn {order.Code}, chi tiêu tích luỹ không còn đủ mốc");
                    ret.SpendTaken = spend;
                    ret.StarsTaken = taken;
                    if (taken > 0)
                    {
                        db.StarEntries.Add(new StarEntry
                        {
                            CustomerId = customer.Id, At = now, Delta = -taken, Kind = StarEntryKind.Refund,
                            Note = $"Trả hàng đơn {order.Code} ({ret.Code})", Ref = order.Code,
                        });
                    }
                }
            }
        }

        db.OrderReturns.Add(ret);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new ReturnResult(true, ret, null);
    }

    /// <summary>Mã phiếu TH + 5 chữ số, nối tiếp số lớn nhất đang có.</summary>
    private async Task<string> NextCodeAsync()
    {
        var last = await db.OrderReturns.MaxAsync(r => (string?)r.Code);
        var seq = last is null ? 0 : int.Parse(last[2..]);
        return $"TH{seq + 1:00000}";
    }
}
