using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Kho hàng: tồn theo cửa hàng (gộp được cả chuỗi), điều chỉnh tồn có lý do, định mức tối thiểu, phiên
/// kiểm kê, lô hàng có hạn dùng và nhật ký biến động kho. Sửa số chỉ làm được khi đã chọn một cửa hàng.
/// </summary>
[Authorize(AuthenticationSchemes = StaffAuth.Scheme, Roles = Roles.Managers)]
public class StockController(AppDbContext db, InventoryService inventory) : AdminController(db)
{
    private const int PageSize = 40;

    public async Task<IActionResult> Index(string? q, string? cat, string? state, string? adjust, string? min, int page = 1)
    {
        var scope = ScopeStoreId;
        var categories = await Db.Categories.OrderBy(c => c.SortOrder).ToListAsync();
        var products = Db.Products.AsNoTracking().Where(p => p.IsActive);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            products = products.Where(p => EF.Functions.Like(p.Name, $"%{term}%") || p.Sku == term || p.Barcode == term);
        }
        if (!string.IsNullOrEmpty(cat)) products = products.Where(p => p.CategoryId == cat);

        var levels = Db.StockLevels.AsNoTracking().Where(s => products.Any(p => p.Id == s.ProductId));
        if (scope is not null) levels = levels.Where(s => s.StoreId == scope);
        var counts = new Dictionary<string, int>
        {
            ["out"] = await levels.CountAsync(s => s.Quantity <= 0),
            ["low"] = await levels.CountAsync(s => s.Quantity > 0 && s.Quantity <= s.MinQuantity),
        };
        var filtered = state switch
        {
            "out" => levels.Where(s => s.Quantity <= 0),
            "low" => levels.Where(s => s.Quantity > 0 && s.Quantity <= s.MinQuantity),
            _ => levels,
        };
        ViewData["Title"] = "Kho hàng";

        if (scope is null)
        {
            // Cả chuỗi: gộp theo mặt hàng, đếm bao nhiêu cửa hàng đang hết hoặc sắp hết.
            var grouped = filtered
                .Select(s => new { s.ProductId, s.Quantity, s.MinQuantity, Cost = (long)s.Quantity * s.Product!.CostPrice })
                .GroupBy(s => s.ProductId)
                .Select(g => new
                {
                    ProductId = g.Key,
                    Quantity = g.Sum(s => s.Quantity),
                    Out = g.Count(s => s.Quantity <= 0),
                    Low = g.Count(s => s.Quantity > 0 && s.Quantity <= s.MinQuantity),
                    Cost = g.Sum(s => s.Cost),
                });
            var total = await grouped.CountAsync();
            var pages = Math.Max(1, (int)Math.Ceiling(total / (double)PageSize));
            page = Math.Clamp(page, 1, pages);
            var rows = await grouped.OrderByDescending(g => g.Out).ThenByDescending(g => g.Low).ThenBy(g => g.ProductId)
                .Skip((page - 1) * PageSize).Take(PageSize).ToListAsync();
            var ids = rows.Select(r => r.ProductId).ToList();
            var map = await Db.Products.Include(p => p.Category).Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
            var chainRows = rows.Select(r => new ChainStockRow(map[r.ProductId], r.Quantity, r.Out, r.Low, r.Cost)).ToList();
            return View("Chain", new ChainStockModel(chainRows, categories, counts, total, page, pages, q, cat, state, await inventory.InventoryCostAsync(null)));
        }

        var storeTotal = await filtered.CountAsync();
        var storePages = Math.Max(1, (int)Math.Ceiling(storeTotal / (double)PageSize));
        page = Math.Clamp(page, 1, storePages);
        var list = await filtered.Include(s => s.Product).ThenInclude(p => p!.Category)
            .OrderBy(s => s.Quantity <= 0 ? 0 : s.Quantity <= s.MinQuantity ? 1 : 2).ThenBy(s => s.Product!.Name)
            .Skip((page - 1) * PageSize).Take(PageSize)
            .ToListAsync();
        StockLevel? selected = null;
        var selectedId = adjust ?? min;
        if (selectedId is not null)
            selected = await Db.StockLevels.AsNoTracking().Include(s => s.Product).FirstOrDefaultAsync(s => s.StoreId == scope && s.ProductId == selectedId);
        return View(new StoreStockModel(list, categories, counts, storeTotal, page, storePages, q, cat, state,
            await inventory.InventoryCostAsync(scope), selected, adjust is not null ? "adjust" : min is not null ? "min" : null,
            await Db.StocktakeCounts.CountAsync(c => c.StoreId == scope)));
    }

    /// <summary>Điều chỉnh tồn về số đếm thực tế, kèm lý do và ghi chú (ghi vào nhật ký kho).</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Adjust(string productId, string? quantity, string? reason, string? note, string? returnUrl)
    {
        if (ScopeStoreId is not string scope) return NeedStore(returnUrl);
        var product = await Db.Products.FindAsync(productId);
        if (product is null) return NotFound();
        var result = await inventory.AdjustAsync(scope, productId, Text.ParseInt(quantity), reason, note, Staff.Name);
        if (!result.Ok)
        {
            // Lỗi thì giữ nguyên khung điều chỉnh, số và lý do vừa nhập, báo lỗi ngay dưới ô.
            TempData["AdjustError"] = result.Error;
            TempData["AdjustQuantity"] = quantity;
            TempData["AdjustReason"] = reason;
            TempData["AdjustNote"] = note;
            return Redirect($"/Admin/Stock?adjust={Uri.EscapeDataString(productId)}");
        }
        Toast($"Đã điều chỉnh tồn: {result.Before} → {result.After} · {product.Name} · {reason}{(string.IsNullOrWhiteSpace(note) ? "" : $" · {note.Trim()}")}");
        return Back(returnUrl, "/Admin/Stock");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> SetMin(string productId, string? minQuantity, string? returnUrl)
    {
        if (ScopeStoreId is not string scope) return NeedStore(returnUrl);
        var result = await inventory.SetMinAsync(scope, productId, Text.ParseInt(minQuantity));
        if (!result.Ok)
        {
            TempData["MinError"] = result.Error;
            TempData["MinValue"] = minQuantity;
            return Redirect($"/Admin/Stock?min={Uri.EscapeDataString(productId)}");
        }
        if (result.Before != result.After) Toast($"Đã đổi định mức tối thiểu: {result.Before} → {result.After}");
        return Back(returnUrl, "/Admin/Stock");
    }

    // ------------------------------------------------------------------ kiểm kê

    public async Task<IActionResult> Stocktake(string? q, string? cat, string? view)
    {
        if (ScopeStoreId is not string scope)
        {
            ViewData["Title"] = "Kiểm kê";
            return View("PickStore");
        }
        var categories = await Db.Categories.OrderBy(c => c.SortOrder).ToListAsync();
        var products = await Db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Name).ToListAsync();
        var levels = await Db.StockLevels.AsNoTracking().Where(s => s.StoreId == scope).ToDictionaryAsync(s => s.ProductId, s => s.Quantity);
        var counted = await Db.StocktakeCounts.AsNoTracking().Where(c => c.StoreId == scope).ToDictionaryAsync(c => c.ProductId, c => c.Counted);
        var rows = products.Select(p => new StocktakeRow(p, levels.GetValueOrDefault(p.Id), counted.TryGetValue(p.Id, out var c) ? c : null)).ToList();
        var inCategory = rows.Where(r => string.IsNullOrEmpty(cat) || r.Product.CategoryId == cat).ToList();
        var shown = inCategory.Where(r =>
            (view != "chua-dem" || r.Counted is null) && (view != "lech" || (r.Counted is int x && x != r.System)) &&
            (string.IsNullOrWhiteSpace(q) || Text.MatchesAllWords(r.Product.Name, q) || r.Product.Sku.Equals(q.Trim(), StringComparison.OrdinalIgnoreCase) || r.Product.Barcode == q.Trim()))
            .ToList();
        ViewData["Title"] = "Kiểm kê";
        return View(new StocktakeModel(shown, rows, inCategory, categories, q, cat, view));
    }

    /// <summary>Lưu số đếm của các ô vừa nhập (ô để trống thì bỏ qua, ô có chữ "x" thì xoá số đếm).</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> SaveCounts(Dictionary<string, string> counts, string? returnUrl)
    {
        if (ScopeStoreId is not string scope) return NeedStore(returnUrl);
        var saved = 0;
        foreach (var (productId, value) in counts)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            var number = Text.ParseInt(value);
            if (number is null || number > 99_999) continue;
            await inventory.SetCountAsync(scope, productId, number, Staff.Name);
            saved++;
        }
        Toast(saved > 0 ? $"Đã lưu số đếm {saved} mặt hàng" : "Chưa có số đếm nào mới");
        return Back(returnUrl, "/Admin/Stock/Stocktake");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> ResetCounts()
    {
        if (ScopeStoreId is not string scope) return NeedStore(null);
        await inventory.ResetCountsAsync(scope);
        Toast("Đã xoá số đếm, bắt đầu lại phiên kiểm kho");
        return RedirectToAction(nameof(Stocktake));
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> ApplyCounts()
    {
        if (ScopeStoreId is not string scope) return NeedStore(null);
        var r = await inventory.ApplyCountsAsync(scope, Staff.Name);
        if (r.Counted == 0) Error("Chưa đếm mặt hàng nào");
        else if (r.Over + r.Short == 0) Toast($"Kiểm kho hoàn tất, không có chênh lệch · {r.Counted} mặt hàng đã đếm đều khớp tồn hệ thống");
        else Toast($"Đã cân bằng kho {r.Over + r.Short} mặt hàng · Thừa +{r.OverUnits} · thiếu −{r.ShortUnits} · giá trị lệch {Money.Signed(r.ValueDifference)}");
        return RedirectToAction(nameof(Stocktake));
    }

    // ------------------------------------------------------------------ lô, nhật ký

    /// <summary>Lô hàng có hạn dùng, lô sắp hết hạn trước.</summary>
    public async Task<IActionResult> Batches(string? state)
    {
        var scope = ScopeStoreId;
        var now = DateTime.Now;
        var query = Db.InventoryBatches.AsNoTracking().Include(b => b.Product).Include(b => b.Store).Where(b => b.Quantity > 0);
        if (scope is not null) query = query.Where(b => b.StoreId == scope);
        var soon = now.AddHours(24);
        var counts = new Dictionary<string, int>
        {
            ["expired"] = await query.CountAsync(b => b.ExpiresAt <= now),
            ["expiring"] = await query.CountAsync(b => b.ExpiresAt > now && b.ExpiresAt < soon),
            ["all"] = await query.CountAsync(),
        };
        query = state switch
        {
            "expired" => query.Where(b => b.ExpiresAt <= now),
            "expiring" => query.Where(b => b.ExpiresAt < soon),
            _ => query,
        };
        var batches = await query.OrderBy(b => b.ExpiresAt).Take(200).ToListAsync();
        ViewData["Title"] = "Lô hàng & hạn dùng";
        return View(new BatchesModel(batches, counts, state, now, scope is null));
    }

    /// <summary>Xuất huỷ một lô: bỏ lô và trừ tồn kho tương ứng.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Discard(int id, string? returnUrl)
    {
        var batch = await inventory.DiscardBatchAsync(id, Staff.IsAdmin ? null : Staff.StoreId, Staff.Name);
        if (batch is null) return NotFound();
        Toast($"Đã xuất huỷ lô {batch.LotCode}: {batch.Quantity} × {batch.Product?.Name}");
        return Back(returnUrl, "/Admin/Stock/Batches");
    }

    /// <summary>Nhật ký biến động kho: mọi lần tồn thay đổi, ai làm, vì sao.</summary>
    public async Task<IActionResult> Movements(StockMovementKind? kind, string? q, int days = 7, int page = 1)
    {
        var scope = ScopeStoreId;
        var since = DateTime.Now.Date.AddDays(-Math.Clamp(days, 1, 90) + 1);
        var query = Db.StockMovements.AsNoTracking().Include(m => m.Product).Include(m => m.Store).Where(m => m.At >= since);
        if (scope is not null) query = query.Where(m => m.StoreId == scope);
        if (kind is StockMovementKind k) query = query.Where(m => m.Kind == k);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(m => EF.Functions.Like(m.Product!.Name, $"%{term}%") || m.Product!.Sku == term || m.Ref == term);
        }
        var total = await query.CountAsync();
        var pages = Math.Max(1, (int)Math.Ceiling(total / 50.0));
        page = Math.Clamp(page, 1, pages);
        var list = await query.OrderByDescending(m => m.At).ThenByDescending(m => m.Id).Skip((page - 1) * 50).Take(50).ToListAsync();
        ViewData["Title"] = "Nhật ký kho";
        return View(new MovementsModel(list, total, page, pages, kind, q, days, scope is null));
    }

    private IActionResult NeedStore(string? returnUrl)
    {
        Error("Chọn một cửa hàng ở góc trên để chỉnh tồn kho");
        return Back(returnUrl, "/Admin/Stock");
    }
}

public record StoreStockModel(
    List<StockLevel> Levels, List<Category> Categories, Dictionary<string, int> Counts, int Total, int Page, int Pages,
    string? Query, string? Category, string? State, long InventoryCost, StockLevel? Selected, string? Action, int CountedInSession);

public record ChainStockRow(Product Product, int Quantity, int StoresOut, int StoresLow, long Cost);

public record ChainStockModel(
    List<ChainStockRow> Rows, List<Category> Categories, Dictionary<string, int> Counts, int Total, int Page, int Pages,
    string? Query, string? Category, string? State, long InventoryCost);

public record BatchesModel(List<InventoryBatch> Batches, Dictionary<string, int> Counts, string? State, DateTime Now, bool IsChain);

public record StocktakeRow(Product Product, int System, int? Counted)
{
    public int? Difference => Counted - System;
}

public record StocktakeModel(List<StocktakeRow> Shown, List<StocktakeRow> All, List<StocktakeRow> InCategory, List<Category> Categories, string? Query, string? Category, string? View);

public record MovementsModel(List<StockMovement> Movements, int Total, int Page, int Pages, StockMovementKind? Kind, string? Query, int Days, bool IsChain);
