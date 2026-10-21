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
/// hàng có hạn dùng.
/// </summary>
public class PurchasingService(AppDbContext db)
{
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

    /// <summary>
    /// Nhận hàng: cộng tồn kho từng mặt hàng; hàng có hạn dùng thì tạo lô, hạn tính từ hôm nhận.
    /// </summary>
    public async Task<PurchaseResult> ReceiveAsync(string orderId, string? by = null)
    {
        // Khoá trước khi đọc trạng thái phiếu: bấm "Nhận hàng" hai lần (hai máy) chỉ cộng kho một lần.
        await using var tx = await db.Database.BeginTransactionAsync();
        var order = await db.PurchaseOrders.Include(p => p.Items).ThenInclude(i => i.Product).FirstOrDefaultAsync(p => p.Id == orderId);
        if (order is null || order.Status != PurchaseOrderStatus.Ordered) return PurchaseResult.Fail("Phiếu này không ở trạng thái chờ nhận hàng");

        var now = DateTime.Now;
        var ids = order.Items.Select(i => i.ProductId).ToList();
        var stock = await db.StockLevels.Where(s => s.StoreId == order.StoreId && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        foreach (var item in order.Items)
        {
            if (!stock.TryGetValue(item.ProductId, out var level))
            {
                level = new StockLevel { StoreId = order.StoreId, ProductId = item.ProductId, MinQuantity = 6 };
                db.StockLevels.Add(level);
                stock[item.ProductId] = level;
            }
            level.Quantity += item.Quantity;
            db.StockMovements.Add(new StockMovement
            {
                StoreId = order.StoreId, ProductId = item.ProductId, At = now, Delta = item.Quantity, QuantityAfter = level.Quantity,
                Kind = StockMovementKind.Receive, Ref = order.Code, By = by,
            });

            if (item.Product?.ShelfLifeDays is int days)
            {
                db.InventoryBatches.Add(new InventoryBatch
                {
                    StoreId = order.StoreId,
                    ProductId = item.ProductId,
                    LotCode = item.LotCode ?? $"{order.Code}-{item.Product.Sku}",
                    Quantity = item.Quantity,
                    ReceivedAt = now,
                    ExpiresAt = now.Date.AddDays(days).AddHours(23).AddMinutes(59),
                });
            }
        }
        order.Status = PurchaseOrderStatus.Received;
        order.ReceivedAt = now;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new PurchaseResult(true, order, null);
    }

    public async Task<PurchaseResult> CancelAsync(string orderId)
    {
        var order = await db.PurchaseOrders.FindAsync(orderId);
        if (order is null || order.Status is PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled)
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
