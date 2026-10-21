using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public record DeliveryInput(string Recipient, string Phone, string Address, string? Note, double? DistanceKm);

public record PlaceOrderInput(
    SalesChannel Channel,
    string StoreId,
    IReadOnlyList<CartLine> Lines,
    PaymentMethod PaymentMethod,
    string? CustomerId,
    string? PromotionCode,
    DeliveryInput? Delivery,
    string? EmployeeId = null,
    int? CashReceived = null);

public record PlaceOrderResult(bool Ok, Order? Order, string? Error)
{
    public static PlaceOrderResult Fail(string error) => new(false, null, error);
}

/// <summary>
/// Đặt hàng, chuyển từ action placeOrder của stores/db.ts. Máy chủ tự tính giá lại từ đầu, không tin
/// con số trình duyệt gửi lên; trừ tồn kho; cộng chi tiêu hạng và sao vàng cho thành viên.
/// Mọi bước nằm trong một giao dịch nên đặt hàng hoặc thành công trọn vẹn, hoặc không đổi gì.
/// </summary>
public class OrderService(AppDbContext db)
{
    public async Task<PlaceOrderResult> PlaceAsync(PlaceOrderInput input)
    {
        var now = DateTime.Now;
        // Giữ khoá ghi từ trước khi đọc tồn (SQLite: BEGIN IMMEDIATE): kiểm đủ hàng rồi trừ là một bước
        // liền, hai quầy bấm cùng lúc mua những món cuối cùng không bán được quá số đang còn.
        await using var tx = await db.Database.BeginTransactionAsync();
        var store = await db.Stores.FindAsync(input.StoreId);
        if (store is null) return PlaceOrderResult.Fail("Không tìm thấy cửa hàng phục vụ");
        if (store.Status != StoreStatus.Active) return PlaceOrderResult.Fail("Cửa hàng phục vụ đang tạm ngưng nhận đơn");

        if (input.Delivery?.DistanceKm is double km && km > DeliveryService.RadiusKm)
            return PlaceOrderResult.Fail($"Địa chỉ cách cửa hàng {DeliveryService.FormatDistance(km)}, ngoài vùng giao {DeliveryService.RadiusKm:0} km");

        var ids = input.Lines.Select(l => l.ProductId).ToList();
        var products = await db.Products.Where(p => ids.Contains(p.Id) && p.IsActive).ToDictionaryAsync(p => p.Id);
        var promotions = await db.Promotions.ToListAsync();
        var customer = input.CustomerId is null ? null : await db.Customers.FindAsync(input.CustomerId);
        if (input.CustomerId is not null && customer is null) return PlaceOrderResult.Fail("Tài khoản thành viên không còn tồn tại, vui lòng đăng nhập lại");

        var delivery = input.Channel == SalesChannel.Online && input.Delivery is not null;
        var pricing = PricingService.PriceCart(input.Lines, products, promotions, input.Channel, customer, input.PromotionCode, delivery, now);
        if (pricing.Lines.Count == 0) return PlaceOrderResult.Fail("Giỏ hàng đang trống");
        if (!string.IsNullOrWhiteSpace(input.PromotionCode) && pricing.CodeError is not null) return PlaceOrderResult.Fail(pricing.CodeError);
        if (input.PaymentMethod == PaymentMethod.Cash && input.CashReceived < pricing.Total) return PlaceOrderResult.Fail("Tiền khách đưa chưa đủ");

        // Kiểm tra đủ hàng ở đúng cửa hàng phục vụ trước khi trừ.
        var stock = await db.StockLevels.Where(s => s.StoreId == store.Id && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        foreach (var line in pricing.Lines)
        {
            if (!stock.TryGetValue(line.Product.Id, out var level) || level.Quantity < line.Quantity)
                return PlaceOrderResult.Fail($"Cửa hàng {store.Code} không đủ hàng: {line.Product.Name}");
        }

        var cashier = input.EmployeeId is null ? null : await db.Employees.FindAsync(input.EmployeeId);

        var inStore = input.Channel == SalesChannel.InStore;
        var order = new Order
        {
            Id = $"od-{Guid.NewGuid():N}"[..14],
            Code = await NextCodeAsync(now),
            Channel = input.Channel,
            StoreId = store.Id,
            CustomerId = customer?.Id,
            EmployeeId = input.EmployeeId,
            Subtotal = pricing.Subtotal,
            Discount = pricing.DiscountTotal,
            ShippingFee = pricing.ShippingFee,
            Total = pricing.Total,
            PromotionCode = pricing.AppliedCode?.Code,
            PaymentMethod = input.PaymentMethod,
            // Tại quầy thu tiền ngay; online trả trước bằng thẻ/ví cũng tính là đã thu.
            PaymentStatus = inStore || input.PaymentMethod != PaymentMethod.Cod ? PaymentStatus.Paid : PaymentStatus.Unpaid,
            Status = inStore ? OrderStatus.Completed : OrderStatus.Pending,
            CashReceived = input.CashReceived,
            ChangeGiven = input.CashReceived is int cash ? cash - pricing.Total : null,
            CreatedAt = now,
            UpdatedAt = now,
            Items = pricing.Lines.Select(l => new OrderItem
            {
                ProductId = l.Product.Id,
                Name = l.Product.Name,
                UnitPrice = l.UnitPrice,
                Quantity = l.Quantity,
                Discount = l.LineDiscount,
                LineTotal = l.LineTotal,
                PromoLabel = l.PromoLabel,
            }).ToList(),
            Timeline = [new OrderEvent { Status = inStore ? OrderStatus.Completed : OrderStatus.Pending, At = now, By = cashier?.FullName }],
        };

        if (delivery && input.Delivery is { } d)
        {
            // Nhân viên của chính cửa hàng đó đi giao; chi phí nằm trong lương.
            var riders = await db.Employees.Where(e => e.StoreId == store.Id && e.Status == EmployeeStatus.Active).ToListAsync();
            var rider = riders.Count > 0 ? riders[Random.Shared.Next(riders.Count)] : null;
            order.Delivery = new DeliveryInfo
            {
                Recipient = d.Recipient,
                Phone = d.Phone,
                Address = d.Address,
                Note = d.Note,
                DistanceKm = d.DistanceKm,
                Eta = now.AddMinutes(DeliveryService.Minutes(d.DistanceKm)),
                ShipperId = rider?.Id,
                ShipperName = rider?.FullName,
                ShipperPhone = rider?.Phone,
            };
        }

        foreach (var line in pricing.Lines)
        {
            var level = stock[line.Product.Id];
            level.Quantity -= line.Quantity;
            await ConsumeBatchesAsync(store.Id, line.Product.Id, line.Quantity);
            db.StockMovements.Add(new StockMovement
            {
                StoreId = store.Id, ProductId = line.Product.Id, At = now, Delta = -line.Quantity, QuantityAfter = level.Quantity,
                Kind = StockMovementKind.Sale, Ref = order.Code, By = cashier?.FullName ?? (inStore ? null : "Đơn online"),
            });
        }

        if (customer is not null)
        {
            var (stars, carry) = StarService.Earn(customer.StarCarry, pricing.EligibleSpend);
            order.MemberSpend = pricing.EligibleSpend;
            order.StarsEarned = stars;
            customer.StarCarry = carry;
            customer.Stars += stars;
            customer.TotalSpent += pricing.Total;
            customer.OrderCount += 1;
            MembershipService.AddTierSpend(customer, pricing.EligibleSpend, now);
            if (stars > 0)
            {
                db.StarEntries.Add(new StarEntry
                {
                    CustomerId = customer.Id, At = now, Delta = stars, Kind = StarEntryKind.Earn,
                    Note = $"Tích sao từ đơn {order.Code}", Ref = order.Code,
                });
            }
        }

        if (pricing.AppliedCode is not null) pricing.AppliedCode.UsageCount += 1;

        db.Orders.Add(order);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new PlaceOrderResult(true, order, null);
    }

    /// <summary>
    /// Đẩy đơn sang bước kế tiếp, hoặc huỷ. Huỷ thì trả hàng về kho, trừ lại chi tiêu hạng và sao
    /// vàng của đơn, trả lại lượt dùng mã giảm giá; đơn đã thu tiền chuyển sang "đã hoàn tiền".
    /// Đơn giao thành công mà khách trả khi nhận hàng thì tính là đã thu tiền.
    /// </summary>
    public async Task<ChangeStatusResult> ChangeStatusAsync(string orderId, OrderStatus to, string? by, string? note)
    {
        // Đọc trạng thái trong cùng giao dịch với lúc ghi: hai người cùng bấm huỷ thì người sau thấy đơn
        // đã huỷ và không trả hàng, trả sao lần thứ hai.
        await using var tx = await db.Database.BeginTransactionAsync();
        var order = await db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == orderId);
        if (order is null) return ChangeStatusResult.Fail("Không tìm thấy đơn hàng");
        if (order.Status == to) return new(true, order, null);

        if (to == OrderStatus.Cancelled)
        {
            if (!OrderFlow.CanCancel(order.Status))
                return ChangeStatusResult.Fail($"Đơn đang ở bước \"{Labels.Status(order.Status)}\", không huỷ được nữa");
        }
        else if (OrderFlow.Next(order.Status) != to)
        {
            return ChangeStatusResult.Fail("Đơn vừa được người khác cập nhật, tải lại trang để xem bước mới nhất");
        }

        var now = DateTime.Now;
        order.Status = to;
        order.UpdatedAt = now;
        db.OrderEvents.Add(new OrderEvent { OrderId = order.Id, Status = to, At = now, By = by, Note = note });
        if (to == OrderStatus.Completed && order.PaymentStatus == PaymentStatus.Unpaid) order.PaymentStatus = PaymentStatus.Paid;

        if (to == OrderStatus.Cancelled)
        {
            if (order.PaymentStatus == PaymentStatus.Paid) order.PaymentStatus = PaymentStatus.Refunded;

            var ids = order.Items.Select(i => i.ProductId).ToList();
            var stock = await db.StockLevels.Where(s => s.StoreId == order.StoreId && ids.Contains(s.ProductId)).ToListAsync();
            foreach (var item in order.Items)
            {
                var level = stock.FirstOrDefault(s => s.ProductId == item.ProductId);
                if (level is null) continue;
                level.Quantity += item.Quantity;
                db.StockMovements.Add(new StockMovement
                {
                    StoreId = order.StoreId, ProductId = item.ProductId, At = now, Delta = item.Quantity, QuantityAfter = level.Quantity,
                    Kind = StockMovementKind.CancelReturn, Ref = order.Code, By = by, Note = note,
                });
            }

            if (order.PromotionCode is string code)
            {
                var promo = await db.Promotions.FirstOrDefaultAsync(p => p.Code == code);
                if (promo is not null && promo.UsageCount > 0) promo.UsageCount -= 1;
            }

            var customer = order.CustomerId is null ? null : await db.Customers.FindAsync(order.CustomerId);
            if (customer is not null)
            {
                customer.OrderCount = Math.Max(0, customer.OrderCount - 1);
                customer.TotalSpent = Math.Max(0, customer.TotalSpent - order.Total);
                if (order.MemberSpend is int spend)
                {
                    var (stars, carry, taken) = StarService.TakeBack(customer.Stars, customer.StarCarry, spend, order.StarsEarned ?? 0);
                    customer.Stars = stars;
                    customer.StarCarry = carry;
                    // Lần tụt hạng gần nhất: đơn đặt trước mốc đó không còn nằm trong chi tiêu xét hạng.
                    var lastDrop = (await db.TierChanges.Where(t => t.CustomerId == customer.Id).ToListAsync())
                        .Where(t => Array.IndexOf(MembershipService.Order, t.To) < Array.IndexOf(MembershipService.Order, t.From))
                        .MaxBy(t => t.At)?.At;
                    MembershipService.RemoveTierSpend(customer, spend, order.CreatedAt, lastDrop, now);
                    if (taken > 0)
                    {
                        db.StarEntries.Add(new StarEntry
                        {
                            CustomerId = customer.Id, At = now, Delta = -taken, Kind = StarEntryKind.Refund,
                            Note = $"Đơn {order.Code} bị huỷ", Ref = order.Code,
                        });
                    }
                }
            }
        }

        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new(true, order, null);
    }

    /// <summary>Lấy hàng ra khỏi các lô của cửa hàng, lô hết hạn sớm nhất trước (FIFO theo hạn dùng).</summary>
    private async Task ConsumeBatchesAsync(string storeId, string productId, int quantity)
    {
        var lots = await db.InventoryBatches
            .Where(b => b.StoreId == storeId && b.ProductId == productId && b.Quantity > 0)
            .OrderBy(b => b.ExpiresAt)
            .ToListAsync();
        var left = quantity;
        foreach (var lot in lots)
        {
            if (left <= 0) break;
            var take = Math.Min(lot.Quantity, left);
            lot.Quantity -= take;
            left -= take;
            if (lot.Quantity == 0) db.InventoryBatches.Remove(lot);
        }
    }

    /// <summary>Mã đơn dạng DH + yyMMdd + số thứ tự 4 chữ số trong ngày, ví dụ DH2610060001.</summary>
    private async Task<string> NextCodeAsync(DateTime now)
    {
        var prefix = $"DH{now:yyMMdd}";
        var last = await db.Orders.Where(o => o.Code.StartsWith(prefix)).MaxAsync(o => (string?)o.Code);
        var seq = last is null ? 0 : int.Parse(last[prefix.Length..]);
        return $"{prefix}{seq + 1:0000}";
    }
}

public record ChangeStatusResult(bool Ok, Order? Order, string? Error)
{
    public static ChangeStatusResult Fail(string error) => new(false, null, error);
}
