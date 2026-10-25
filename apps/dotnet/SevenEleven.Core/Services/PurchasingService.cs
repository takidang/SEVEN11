using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public record PurchaseResult(bool Ok, PurchaseOrder? Order, string? Error)
{
    public static PurchaseResult Fail(string error) => new(false, null, error);
}

/// <summary>
/// Nhập hàng, chuyển từ các action phiếu nhập của stores/db.ts. Phiếu đi Nháp → Đã đặt hàng →
/// Đã nhập kho. Chỉ phiếu nháp mới sửa được dòng hàng; nhận hàng thì cộng tồn kho và tạo lô cho
/// hàng có hạn dùng. Nhà cung cấp giao thiếu thì nhận nhiều đợt (phiếu ở trạng thái Đang nhận hàng);
/// không giao nữa thì Kết thúc phiếu với số đã nhận.
/// </summary>
public class PurchasingService(AppDbContext db)
{
    /// <summary>Thứ tự hiển thị các trạng thái (khác thứ tự số lưu trong cơ sở dữ liệu).</summary>
    public static readonly PurchaseOrderStatus[] StatusOrder =
    [
        PurchaseOrderStatus.Draft, PurchaseOrderStatus.Ordered, PurchaseOrderStatus.PartiallyReceived,
        PurchaseOrderStatus.Received, PurchaseOrderStatus.Closed, PurchaseOrderStatus.Cancelled,
    ];

    /// <summary>Phiếu còn chờ nhà cung cấp giao hàng (chưa nhận gì hoặc mới nhận một phần).</summary>
    public static bool AwaitingDelivery(PurchaseOrderStatus s) => s is PurchaseOrderStatus.Ordered or PurchaseOrderStatus.PartiallyReceived;

    /// <summary>Nhà cung cấp hẹn giao sau một ngày.</summary>
    public const int LeadTimeHours = 24;

    /// <summary>Mặt hàng sắp hết thì đặt đủ cho khoảng ba lần mức tối thiểu, làm tròn theo thùng 6.</summary>
    public static int SuggestedQuantity(int quantity, int minQuantity)
    {
        var need = Math.Max(12, minQuantity * 3 - Math.Max(0, quantity));
        return (need + 5) / 6 * 6;
    }

    public static string[] CategoriesOf(Supplier supplier) => PricingService.Split(supplier.CategoryIds);

    /// <summary>Tạo phiếu nháp, điền sẵn những mặt hàng của nhà cung cấp này đang hết hoặc sắp hết ở cửa hàng.</summary>
    public async Task<PurchaseResult> CreateDraftAsync(string supplierId, string storeId, string createdBy, string? note)
    {
        var supplier = await db.Suppliers.FindAsync(supplierId);
        if (supplier is null || supplier.Status != SupplierStatus.Active) return PurchaseResult.Fail("Nhà cung cấp không còn hợp tác");
        var store = await db.Stores.FindAsync(storeId);
        if (store is null || store.Status == StoreStatus.Closed) return PurchaseResult.Fail("Cửa hàng không nhận hàng");

        var order = new PurchaseOrder
        {
            Id = $"po-{Guid.NewGuid():N}"[..11],
            Code = await NextCodeAsync(),
            SupplierId = supplier.Id,
            StoreId = store.Id,
            Status = PurchaseOrderStatus.Draft,
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            CreatedBy = createdBy,
            CreatedAt = DateTime.Now,
        };
        order.Items.AddRange(await SuggestionsAsync(supplier, store.Id));
        order.Total = order.Items.Sum(i => i.Quantity * i.CostPrice);
        db.PurchaseOrders.Add(order);
        await db.SaveChangesAsync();
        return new PurchaseResult(true, order, null);
    }

    /// <summary>Thêm các mặt hàng sắp hết còn thiếu trong phiếu nháp.</summary>
    public async Task<int> AddSuggestionsAsync(string orderId)
    {
        var order = await LoadDraftAsync(orderId);
        if (order?.Supplier is null) return 0;
        var have = order.Items.Select(i => i.ProductId).ToHashSet();
        var added = (await SuggestionsAsync(order.Supplier, order.StoreId)).Where(i => !have.Contains(i.ProductId)).ToList();
        order.Items.AddRange(added);
        await SaveTotalAsync(order);
        return added.Count;
    }

    public async Task<PurchaseResult> AddItemAsync(string orderId, string productId, int quantity)
    {
        var order = await LoadDraftAsync(orderId);
        if (order?.Supplier is null) return PurchaseResult.Fail("Chỉ sửa được phiếu nháp");
        var product = await db.Products.FindAsync(productId);
        if (product is null || !CategoriesOf(order.Supplier).Contains(product.CategoryId))
            return PurchaseResult.Fail("Nhà cung cấp này không giao mặt hàng đó");
        if (quantity <= 0) return PurchaseResult.Fail("Số lượng phải lớn hơn 0");

        var line = order.Items.FirstOrDefault(i => i.ProductId == productId);
        if (line is null) order.Items.Add(NewLine(product, quantity));
        else line.Quantity += quantity;
        await SaveTotalAsync(order);
        return new PurchaseResult(true, order, null);
    }

    /// <summary>Đổi số lượng một dòng; về 0 là bỏ dòng đó.</summary>
    public async Task SetItemQuantityAsync(string orderId, int itemId, int quantity)
    {
        var order = await LoadDraftAsync(orderId);
        var line = order?.Items.FirstOrDefault(i => i.Id == itemId);
        if (order is null || line is null) return;
        if (quantity <= 0)
        {
            order.Items.Remove(line);
            db.PurchaseOrderItems.Remove(line);
        }
        else
        {
            line.Quantity = quantity;
        }
        await SaveTotalAsync(order);
    }

    /// <summary>Gửi phiếu cho nhà cung cấp.</summary>
    public async Task<PurchaseResult> PlaceAsync(string orderId)
    {
        var order = await LoadDraftAsync(orderId);
        if (order is null) return PurchaseResult.Fail("Chỉ gửi được phiếu nháp");
        if (order.Items.Count == 0) return PurchaseResult.Fail("Phiếu chưa có mặt hàng nào");
        order.Status = PurchaseOrderStatus.Ordered;
        order.ExpectedAt = DateTime.Now.AddHours(LeadTimeHours);
        await db.SaveChangesAsync();
        return new PurchaseResult(true, order, null);
    }

    /// <summary>Nhận đủ toàn bộ phần còn thiếu của phiếu trong một lần.</summary>
    public Task<PurchaseResult> ReceiveAsync(string orderId, string? by = null) => ReceiveAsync(orderId, null, by);

    /// <summary>
    /// Nhận một đợt hàng: <paramref name="quantities"/> là số nhận đợt này của từng dòng (mã dòng → số
    /// lượng), null là nhận đủ phần còn thiếu. Cộng tồn kho, ghi nhật ký kho; hàng có hạn dùng thì tạo lô
    /// riêng cho đợt này, hạn tính từ hôm nhận. Nhận đủ mọi dòng thì phiếu sang Đã nhập kho, chưa đủ thì
    /// Đang nhận hàng. Không nhận quá số đặt.
    /// </summary>
    public async Task<PurchaseResult> ReceiveAsync(string orderId, IReadOnlyDictionary<int, int>? quantities, string? by)
    {
        // Khoá trước khi đọc trạng thái phiếu: bấm "Nhận hàng" hai lần (hai máy) chỉ cộng kho một lần.
        await using var tx = await db.Database.BeginTransactionAsync();
        var order = await db.PurchaseOrders.Include(p => p.Items).ThenInclude(i => i.Product).FirstOrDefaultAsync(p => p.Id == orderId);
        if (order is null || !AwaitingDelivery(order.Status)) return PurchaseResult.Fail("Phiếu này không ở trạng thái chờ nhận hàng");

        var plan = new List<(PurchaseOrderItem Item, int Quantity)>();
        foreach (var item in order.Items)
        {
            var quantity = quantities is null ? item.Remaining : quantities.GetValueOrDefault(item.Id);
            if (quantity < 0) return PurchaseResult.Fail("Số lượng nhận không được âm");
            if (quantity > item.Remaining)
                return PurchaseResult.Fail($"{item.Product?.Name}: chỉ còn thiếu {item.Remaining}, không nhận quá số đã đặt");
            if (quantity > 0) plan.Add((item, quantity));
        }
        if (plan.Count == 0) return PurchaseResult.Fail("Nhập số lượng nhận cho ít nhất một mặt hàng");

        var now = DateTime.Now;
        // Đợt thứ mấy: đếm các lần nhận trước của phiếu trong nhật ký kho (mỗi đợt ghi cùng một thời điểm).
        var round = await db.StockMovements.Where(m => m.Ref == order.Code && m.Kind == StockMovementKind.Receive)
            .Select(m => m.At).Distinct().CountAsync() + 1;
        var ids = plan.Select(x => x.Item.ProductId).ToList();
        var stock = await db.StockLevels.Where(s => s.StoreId == order.StoreId && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        foreach (var (item, quantity) in plan)
        {
            if (!stock.TryGetValue(item.ProductId, out var level))
            {
                level = new StockLevel { StoreId = order.StoreId, ProductId = item.ProductId, MinQuantity = 6 };
                db.StockLevels.Add(level);
                stock[item.ProductId] = level;
            }
            level.Quantity += quantity;
            item.ReceivedQuantity += quantity;
            db.StockMovements.Add(new StockMovement
            {
                StoreId = order.StoreId, ProductId = item.ProductId, At = now, Delta = quantity, QuantityAfter = level.Quantity,
                Kind = StockMovementKind.Receive, Ref = order.Code, By = by,
            });

            if (item.Product?.ShelfLifeDays is int days)
            {
                var lot = item.LotCode ?? $"{order.Code}-{item.Product.Sku}";
                db.InventoryBatches.Add(new InventoryBatch
                {
                    StoreId = order.StoreId,
                    ProductId = item.ProductId,
                    LotCode = round > 1 ? $"{lot}-D{round}" : lot,
                    Quantity = quantity,
                    ReceivedAt = now,
                    ExpiresAt = now.Date.AddDays(days).AddHours(23).AddMinutes(59),
                });
            }
        }
        order.Status = order.Items.All(i => i.Remaining == 0) ? PurchaseOrderStatus.Received : PurchaseOrderStatus.PartiallyReceived;
        order.ReceivedAt = now;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new PurchaseResult(true, order, null);
    }

    /// <summary>
    /// Kết thúc phiếu đang nhận dở khi nhà cung cấp không giao phần còn thiếu nữa: chốt theo số đã nhận
    /// (tiền hàng tính lại theo số thực nhận), ghi lý do và người kết thúc. Phiếu chưa nhận gì thì dùng Huỷ.
    /// </summary>
    public async Task<PurchaseResult> CloseAsync(string orderId, string? reason, string? by)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var order = await db.PurchaseOrders.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == orderId);
        if (order is null) return PurchaseResult.Fail("Không tìm thấy phiếu");
        if (order.Status == PurchaseOrderStatus.Ordered) return PurchaseResult.Fail("Phiếu chưa nhận đợt nào, hãy dùng Huỷ phiếu");
        if (order.Status != PurchaseOrderStatus.PartiallyReceived) return PurchaseResult.Fail("Chỉ kết thúc được phiếu đang nhận hàng dở");
        var why = reason?.Trim() ?? "";
        if (why.Length < 3) return PurchaseResult.Fail("Nhập lý do kết thúc phiếu, ví dụ: nhà cung cấp hết hàng");
        if (why.Length > 200) return PurchaseResult.Fail("Lý do tối đa 200 ký tự");

        order.Status = PurchaseOrderStatus.Closed;
        order.ClosedReason = why;
        order.ClosedBy = by;
        order.ReceivedAt = DateTime.Now;
        order.Total = order.Items.Sum(i => i.ReceivedQuantity * i.CostPrice);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new PurchaseResult(true, order, null);
    }

    public async Task<PurchaseResult> CancelAsync(string orderId)
    {
        var order = await db.PurchaseOrders.FindAsync(orderId);
        if (order?.Status == PurchaseOrderStatus.PartiallyReceived)
            return PurchaseResult.Fail("Phiếu đã nhận một phần hàng nên không huỷ được, hãy dùng Kết thúc phiếu");
        if (order is null || order.Status is not (PurchaseOrderStatus.Draft or PurchaseOrderStatus.Ordered))
            return PurchaseResult.Fail("Phiếu đã nhập kho hoặc đã huỷ thì không huỷ được nữa");
        order.Status = PurchaseOrderStatus.Cancelled;
        await db.SaveChangesAsync();
        return new PurchaseResult(true, order, null);
    }

    private async Task<List<PurchaseOrderItem>> SuggestionsAsync(Supplier supplier, string storeId)
    {
        var categories = CategoriesOf(supplier);
        var low = await db.StockLevels
            .Include(s => s.Product)
            .Where(s => s.StoreId == storeId && s.Product!.IsActive && categories.Contains(s.Product.CategoryId) && s.Quantity <= s.MinQuantity)
            .OrderBy(s => s.Quantity)
            .Take(20)
            .ToListAsync();
        return low.Select(s => NewLine(s.Product!, SuggestedQuantity(s.Quantity, s.MinQuantity))).ToList();
    }

    private static PurchaseOrderItem NewLine(Product product, int quantity) =>
        new() { ProductId = product.Id, Quantity = quantity, CostPrice = product.CostPrice };

    private async Task<PurchaseOrder?> LoadDraftAsync(string orderId)
    {
        var order = await db.PurchaseOrders.Include(p => p.Items).Include(p => p.Supplier).FirstOrDefaultAsync(p => p.Id == orderId);
        return order?.Status == PurchaseOrderStatus.Draft ? order : null;
    }

    private async Task SaveTotalAsync(PurchaseOrder order)
    {
        order.Total = order.Items.Sum(i => i.Quantity * i.CostPrice);
        await db.SaveChangesAsync();
    }

    /// <summary>Mã phiếu PN + 5 chữ số, nối tiếp số lớn nhất đang có.</summary>
    private async Task<string> NextCodeAsync()
    {
        var last = await db.PurchaseOrders.MaxAsync(p => (string?)p.Code);
        var seq = last is null ? 0 : int.Parse(last[2..]);
        return $"PN{seq + 1:00000}";
    }
}
