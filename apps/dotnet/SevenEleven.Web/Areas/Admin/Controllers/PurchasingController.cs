using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Phiếu nhập hàng: lập nháp, gửi nhà cung cấp, nhận hàng vào kho (một hoặc nhiều đợt), kết thúc phiếu thiếu hàng, huỷ.</summary>
[Authorize(AuthenticationSchemes = StaffAuth.Scheme, Roles = Roles.Managers)]
public class PurchasingController(AppDbContext db, PurchasingService purchasing) : AdminController(db)
{
    public async Task<IActionResult> Index(PurchaseOrderStatus? status)
    {
        var scope = ScopeStoreId;
        var query = Db.PurchaseOrders.AsNoTracking().Include(p => p.Supplier).Include(p => p.Store).Include(p => p.Items).AsQueryable();
        if (scope is not null) query = query.Where(p => p.StoreId == scope);
        var counts = await query.GroupBy(p => p.Status).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        if (status is PurchaseOrderStatus st) query = query.Where(p => p.Status == st);
        var list = await query.OrderByDescending(p => p.CreatedAt).Take(100).AsSplitQuery().ToListAsync();
        ViewData["Title"] = "Nhập hàng";
        return View(new PurchaseListModel(list, counts, status, DateTime.Now, scope is null));
    }

    public async Task<IActionResult> New()
    {
        ViewData["Title"] = "Lập phiếu nhập";
        return View(await NewModelAsync());
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(string supplierId, string? storeId, string? note)
    {
        var target = Staff.IsAdmin ? storeId ?? ScopeStoreId : Staff.StoreId;
        if (string.IsNullOrEmpty(target))
        {
            Error("Chọn cửa hàng nhận hàng");
            return RedirectToAction(nameof(New));
        }
        var result = await purchasing.CreateDraftAsync(supplierId, target, Staff.Id, note);
        if (!result.Ok)
        {
            Error(result.Error);
            return RedirectToAction(nameof(New));
        }
        Toast(result.Order!.Items.Count > 0
            ? $"Đã lập phiếu nháp {result.Order.Code}, điền sẵn {result.Order.Items.Count} mặt hàng đang hết hoặc sắp hết"
            : $"Đã lập phiếu nháp {result.Order.Code}. Cửa hàng chưa thiếu mặt hàng nào của nhà cung cấp này, thêm hàng bên dưới.");
        return RedirectToAction(nameof(Detail), new { id = result.Order.Id });
    }

    public async Task<IActionResult> Detail(string id)
    {
        var order = await LoadAsync(id);
        if (order is null) return NotFound();
        var categories = order.Supplier is null ? [] : PurchasingService.CategoriesOf(order.Supplier);
        var catalog = order.Status == PurchaseOrderStatus.Draft
            ? await Db.Products.Where(p => p.IsActive && categories.Contains(p.CategoryId)).OrderBy(p => p.Name).ToListAsync()
            : [];
        var ids = order.Items.Select(i => i.ProductId).ToList();
        var stock = await Db.StockLevels.Where(s => s.StoreId == order.StoreId && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        ViewBag.CreatedBy = (await Db.Employees.FindAsync(order.CreatedBy))?.FullName;
        // Các đợt nhận hàng: nhật ký kho của phiếu, mỗi đợt ghi cùng một thời điểm.
        var names = order.Items.ToDictionary(i => i.ProductId, i => i.Product?.Name ?? i.ProductId);
        var rounds = (await Db.StockMovements.AsNoTracking()
                .Where(m => m.StoreId == order.StoreId && m.Ref == order.Code && m.Kind == StockMovementKind.Receive).ToListAsync())
            .GroupBy(m => m.At).OrderBy(g => g.Key)
            .Select((g, n) => new ReceiptRound(n + 1, g.Key, g.First().By, g.Select(m => (names.GetValueOrDefault(m.ProductId, m.ProductId), m.Delta)).ToList()))
            .ToList();
        ViewData["Title"] = $"Phiếu {order.Code}";
        return View(new PurchaseDetailModel(order, catalog, stock, DateTime.Now, rounds));
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> AddItem(string id, string productId, int quantity)
    {
        if (await LoadAsync(id) is null) return NotFound();
        var result = await purchasing.AddItemAsync(id, productId, quantity);
        if (!result.Ok) Error(result.Error);
        return RedirectToAction(nameof(Detail), new { id });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> SetItem(string id, int itemId, int quantity)
    {
        if (await LoadAsync(id) is null) return NotFound();
        await purchasing.SetItemQuantityAsync(id, itemId, quantity);
        return RedirectToAction(nameof(Detail), new { id });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Suggest(string id)
    {
        if (await LoadAsync(id) is null) return NotFound();
        var added = await purchasing.AddSuggestionsAsync(id);
        Toast(added > 0 ? $"Đã thêm {added} mặt hàng đang hết hoặc sắp hết" : "Không còn mặt hàng nào thiếu của nhà cung cấp này");
        return RedirectToAction(nameof(Detail), new { id });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Place(string id)
    {
        if (await LoadAsync(id) is null) return NotFound();
        var result = await purchasing.PlaceAsync(id);
        if (result.Ok) Toast($"Đã gửi phiếu {result.Order!.Code} cho nhà cung cấp, hẹn giao {result.Order.ExpectedAt:HH:mm dd/MM}");
        else Error(result.Error);
        return RedirectToAction(nameof(Detail), new { id });
    }

    /// <summary>Nhận một đợt hàng: số nhận đợt này của từng dòng gửi lên dạng qty[mã dòng].</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Receive(string id, Dictionary<int, int>? qty)
    {
        if (await LoadAsync(id) is null) return NotFound();
        var result = await purchasing.ReceiveAsync(id, qty ?? [], Staff.Name);
        if (result.Ok)
        {
            var o = result.Order!;
            var got = qty?.Values.Where(v => v > 0).Sum() ?? 0;
            Toast(o.Status == PurchaseOrderStatus.Received
                ? $"Đã nhận {got} sản phẩm. Phiếu {o.Code} đã nhận đủ và nhập kho xong"
                : $"Đã nhận {got} sản phẩm vào kho. Phiếu {o.Code} còn thiếu {o.Items.Sum(i => i.Remaining)} sản phẩm, chờ đợt sau");
        }
        else Error(result.Error);
        return RedirectToAction(nameof(Detail), new { id });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Close(string id, string? reason)
    {
        if (await LoadAsync(id) is null) return NotFound();
        var result = await purchasing.CloseAsync(id, reason, Staff.Name);
        if (result.Ok)
        {
            var o = result.Order!;
            Toast($"Đã kết thúc phiếu {o.Code}: nhận {o.Items.Sum(i => i.ReceivedQuantity)}/{o.Items.Sum(i => i.Quantity)} sản phẩm, tiền hàng {Money.Format(o.Total)}");
        }
        else Error(result.Error);
        return RedirectToAction(nameof(Detail), new { id });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Cancel(string id)
    {
        if (await LoadAsync(id) is null) return NotFound();
        var result = await purchasing.CancelAsync(id);
        if (result.Ok) Toast($"Đã huỷ phiếu {result.Order!.Code}");
        else Error(result.Error);
        return RedirectToAction(nameof(Detail), new { id });
    }

    /// <summary>Phiếu trong phạm vi người đang đăng nhập được đụng tới.</summary>
    private async Task<PurchaseOrder?> LoadAsync(string id)
    {
        var order = await Db.PurchaseOrders
            .Include(p => p.Items).ThenInclude(i => i.Product)
            .Include(p => p.Supplier)
            .Include(p => p.Store)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Id == id);
        return order is not null && CanTouch(order.StoreId) ? order : null;
    }

    private async Task<NewPurchaseModel> NewModelAsync()
    {
        var suppliers = await Db.Suppliers.Where(s => s.Status == SupplierStatus.Active).OrderBy(s => s.Code).ToListAsync();
        var stores = await Db.Stores.Where(s => s.Status != StoreStatus.Closed).OrderBy(s => s.Code).ToListAsync();
        var categories = await Db.Categories.ToDictionaryAsync(c => c.Id, c => c.Name);
        var scope = ScopeStoreId;
        // Mỗi nhà cung cấp: bao nhiêu mặt hàng của họ đang hết hoặc sắp hết ở cửa hàng đang chọn.
        var shortages = new Dictionary<string, int>();
        if (scope is not null)
        {
            var low = await Db.StockLevels.Where(s => s.StoreId == scope && s.Product!.IsActive && s.Quantity <= s.MinQuantity)
                .Select(s => s.Product!.CategoryId).ToListAsync();
            foreach (var supplier in suppliers)
            {
                var cats = PurchasingService.CategoriesOf(supplier);
                shortages[supplier.Id] = low.Count(cats.Contains);
            }
        }
        return new NewPurchaseModel(suppliers, stores, categories, shortages, scope);
    }
}

public record PurchaseListModel(List<PurchaseOrder> Orders, Dictionary<PurchaseOrderStatus, int> Counts, PurchaseOrderStatus? Status, DateTime Now, bool IsChain);

public record PurchaseDetailModel(PurchaseOrder Order, List<Product> Catalog, Dictionary<string, StockLevel> Stock, DateTime Now, List<ReceiptRound> Rounds);

/// <summary>Một đợt nhận hàng của phiếu: đợt thứ mấy, lúc nào, ai nhận, từng mặt hàng nhận bao nhiêu.</summary>
public record ReceiptRound(int Number, DateTime At, string? By, List<(string Name, int Quantity)> Lines);

public record NewPurchaseModel(List<Supplier> Suppliers, List<Store> Stores, Dictionary<string, string> Categories, Dictionary<string, int> Shortages, string? StoreId);
