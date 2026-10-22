using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Sản phẩm: danh mục dùng chung toàn chuỗi. Quản trị thêm/sửa/ngừng bán; quản lý chỉ xem.</summary>
public class ProductsController(AppDbContext db, ProductAdminService products) : AdminController(db)
{
    private const int PageSize = 20;

    public static readonly (string Key, string Label)[] Sorts =
    [
        ("moi", "Mới nhất"), ("ten", "Tên A–Z"), ("gia-tang", "Giá bán thấp → cao"), ("gia-giam", "Giá bán cao → thấp"),
        ("bien", "Biên lợi nhuận thấp → cao"), ("ton", "Tồn ít → nhiều"),
    ];

    public async Task<IActionResult> Index(string? q, string? cat, string? status, bool sale = false, string? sort = null, int page = 1)
    {
        var scope = ScopeStoreId;
        var categories = await Db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ToListAsync();
        var all = await Db.Products.AsNoTracking().Include(p => p.Category).Include(p => p.Subcategory).ToListAsync();
        var levels = Db.StockLevels.AsNoTracking();
        if (scope is not null) levels = levels.Where(s => s.StoreId == scope);
        var stock = (await levels.Select(s => new { s.ProductId, s.Quantity, s.MinQuantity, s.StoreId }).ToListAsync())
            .GroupBy(s => s.ProductId)
            .ToDictionary(g => g.Key, g => new ProductStock(
                g.Sum(s => s.Quantity),
                g.Count(s => s.Quantity <= 0),
                g.Count(s => s.Quantity > 0 && s.Quantity <= s.MinQuantity)));

        ProductStock StockOf(Product p) => stock.GetValueOrDefault(p.Id) ?? new ProductStock(0, 1, 0);
        var stats = new ProductStats(
            all.Count, categories.Count, all.Count(p => p.IsActive), all.Count(p => !p.IsActive),
            all.Count(p => p.IsActive && StockOf(p).Out == 0 && StockOf(p).Low > 0),
            all.Count(p => p.IsActive && StockOf(p).Out > 0));

        var filtered = all.Where(p =>
        {
            if (!string.IsNullOrEmpty(cat) && p.CategoryId != cat) return false;
            if (status == "dang-ban" && !p.IsActive) return false;
            if (status == "ngung-ban" && p.IsActive) return false;
            if (sale && !(p.CompareAtPrice > p.Price)) return false;
            if (string.IsNullOrWhiteSpace(q)) return true;
            var term = q.Trim();
            return Text.MatchesAllWords($"{p.Name} {p.Brand}", term)
                   || p.Sku.Contains(term, StringComparison.OrdinalIgnoreCase)
                   || p.Barcode.Contains(term);
        });
        double Margin(Product p) => p.Price > 0 ? (p.Price - p.CostPrice) / (double)p.Price : 0;
        filtered = sort switch
        {
            "ten" => filtered.OrderBy(p => Text.Fold(p.Name), StringComparer.Ordinal),
            "gia-tang" => filtered.OrderBy(p => p.Price),
            "gia-giam" => filtered.OrderByDescending(p => p.Price),
            "bien" => filtered.OrderBy(Margin),
            "ton" => filtered.OrderBy(p => StockOf(p).Quantity),
            _ => filtered.OrderByDescending(p => p.CreatedAt),
        };
        var list = filtered.ToList();
        var pages = Math.Max(1, (int)Math.Ceiling(list.Count / (double)PageSize));
        page = Math.Clamp(page, 1, pages);
        ViewData["Title"] = "Sản phẩm";
        return View(new ProductListModel(
            list.Skip((page - 1) * PageSize).Take(PageSize).Select(p => new ProductRow(p, StockOf(p), Margin(p))).ToList(),
            list.Count, all.Count, stats, categories, page, pages, q, cat, status, sale, sort ?? "moi",
            scope is null ? await Db.Stores.CountAsync() : 1));
    }

    /// <summary>Thêm (id trống) hoặc sửa sản phẩm; quản lý thấy bản chỉ xem.</summary>
    public async Task<IActionResult> Edit(string? id)
    {
        Product? product = null;
        if (id is not null)
        {
            product = await Db.Products.Include(p => p.Category).Include(p => p.Subcategory)
                .FirstOrDefaultAsync(p => p.Id == id || p.Sku == id || p.Barcode == id);
            if (product is null) return NotFound();
        }
        else if (!CanManage)
        {
            return RedirectToAction(nameof(Index));
        }
        var input = product is null ? new ProductInput { Sku = await products.SuggestSkuAsync() } : ProductInput.From(product);
        return await FormAsync(input, product, null);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Save(ProductInput input)
    {
        var result = await products.SaveAsync(input, new Actor(Staff.Id, Staff.Role, Staff.StoreId));
        if (!result.Ok)
        {
            var product = input.Id is null ? null : await Db.Products.Include(p => p.Category).FirstOrDefaultAsync(p => p.Id == input.Id);
            return await FormAsync(input, product, result.Errors);
        }
        Toast(input.Id is null
            ? $"Đã thêm sản phẩm mới: {result.Value!.Name} · {result.Value.Sku} — tồn kho ban đầu 0 ở mọi cửa hàng"
            : $"Đã lưu thay đổi sản phẩm: {result.Value!.Name}");
        return RedirectToAction(nameof(Index), new { q = result.Value.Sku });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Toggle(string id, bool active, string? returnUrl)
    {
        var product = await products.SetActiveAsync(id, active);
        if (product is null) return NotFound();
        Toast($"{(active ? "Đã mở bán sản phẩm" : "Đã ngừng bán sản phẩm")}: {product.Name}");
        return Back(returnUrl, "/Admin/Products");
    }

    private async Task<IActionResult> FormAsync(ProductInput input, Product? product, FormErrors? errors)
    {
        var categories = await Db.Categories.AsNoTracking().Include(c => c.Subcategories).OrderBy(c => c.SortOrder).ToListAsync();
        var stock = product is null ? [] : await Db.StockLevels.AsNoTracking().Include(s => s.Store)
            .Where(s => s.ProductId == product.Id).OrderBy(s => s.Store!.Code).ToListAsync();
        var history = product is null ? [] : await Db.PriceChanges.AsNoTracking()
            .Where(c => c.ProductId == product.Id).OrderByDescending(c => c.At).ThenByDescending(c => c.Id).ToListAsync();
        ViewData["Title"] = product is null ? "Thêm sản phẩm" : product.Name;
        return View("Edit", new ProductFormModel(input, product, categories, stock, errors ?? new FormErrors(), CanManage, history));
    }
}

public record ProductStock(int Quantity, int Out, int Low);

public record ProductStats(int Total, int Categories, int Active, int Inactive, int Low, int Out);

public record ProductRow(Product Product, ProductStock Stock, double Margin);

public record ProductListModel(
    List<ProductRow> Rows, int Filtered, int Total, ProductStats Stats, List<Category> Categories, int Page, int Pages,
    string? Query, string? Category, string? Status, bool Sale, string Sort, int StoreCount);

public record ProductFormModel(
    ProductInput Input, Product? Product, List<Category> Categories, List<StockLevel> Stock, FormErrors Errors, bool CanEdit,
    List<PriceChange> PriceHistory);
