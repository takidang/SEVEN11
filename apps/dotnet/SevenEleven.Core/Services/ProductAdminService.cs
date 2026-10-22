using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>Dữ liệu form sản phẩm, để dạng chữ cho đúng từng câu báo lỗi của bản Next.js.</summary>
public class ProductInput
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public string? CategoryId { get; set; }
    public string? SubcategoryId { get; set; }
    public string? Brand { get; set; }
    public string? Origin { get; set; } = "Việt Nam";
    public string? Unit { get; set; } = "cái";
    public string? ShelfLifeDays { get; set; }
    public string? Price { get; set; }
    public string? CompareAtPrice { get; set; }
    public string? CostPrice { get; set; }
    public string? Sku { get; set; }
    public string? Barcode { get; set; }
    public string? Image { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsNew { get; set; } = true;
    public bool AgeRestricted { get; set; }

    public static ProductInput From(Product p) => new()
    {
        Id = p.Id, Name = p.Name, CategoryId = p.CategoryId, SubcategoryId = p.SubcategoryId, Brand = p.Brand, Origin = p.Origin,
        Unit = p.Unit, ShelfLifeDays = p.ShelfLifeDays?.ToString(), Price = p.Price.ToString(), CompareAtPrice = p.CompareAtPrice?.ToString(),
        CostPrice = p.CostPrice.ToString(), Sku = p.Sku, Barcode = p.Barcode, Image = p.Image, IsActive = p.IsActive, IsNew = p.IsNew,
        AgeRestricted = p.AgeRestricted,
    };
}

/// <summary>
/// Thêm, sửa, ngừng bán sản phẩm, chuyển từ san-pham/product-form.tsx. Sản phẩm mới có ngay dòng tồn
/// kho 0 (định mức 6) ở mọi cửa hàng; sửa sản phẩm không đụng tới tồn kho.
/// </summary>
public partial class ProductAdminService(AppDbContext db)
{
    public static readonly string[] Units = ["cái", "ly", "lon", "chai", "hộp", "gói", "túi", "lốc", "thùng", "vỉ", "combo", "phần"];

    [GeneratedRegex(@"^\d{13}$")] private static partial Regex BarcodePattern();
    [GeneratedRegex(@"^[A-Za-z0-9-]{4,20}$")] private static partial Regex SkuPattern();
    [GeneratedRegex(@"^https?://\S+$")] private static partial Regex UrlPattern();
    [GeneratedRegex(@"^7E(\d+)$", RegexOptions.IgnoreCase)] private static partial Regex OurSku();

    /// <summary>Mã SKU gợi ý: 7E + số lớn nhất đang có + 1 (tối thiểu 7E10001).</summary>
    public async Task<string> SuggestSkuAsync()
    {
        var skus = await db.Products.Select(p => p.Sku).ToListAsync();
        var max = skus.Select(s => OurSku().Match(s)).Where(m => m.Success).Select(m => long.Parse(m.Groups[1].Value)).DefaultIfEmpty(10_000).Max();
        return $"7E{Math.Max(10_000, max) + 1}";
    }

    /// <summary>Mã vạch EAN-13 đầu 893 (Việt Nam) + 9 số ngẫu nhiên + số kiểm tra.</summary>
    public static string NewBarcode()
    {
        var body = "893" + Text.Random(9, "0123456789");
        return body + Ean13CheckDigit(body);
    }

    public static int Ean13CheckDigit(string twelveDigits)
    {
        var sum = 0;
        for (var i = 0; i < 12; i++) sum += (twelveDigits[i] - '0') * (i % 2 == 0 ? 1 : 3);
        return (10 - sum % 10) % 10;
    }

    /// <summary>
    /// Thêm hoặc sửa sản phẩm. Đổi giá bán hay giá vốn thì ghi một dòng lịch sử giá kèm người đổi
    /// (<paramref name="actor"/>); sản phẩm mới ghi giá ban đầu.
    /// </summary>
    public async Task<SaveResult<Product>> SaveAsync(ProductInput input, Actor? actor = null, DateTime? now = null)
    {
        var errors = new FormErrors();
        var name = input.Name?.Trim() ?? "";
        if (name.Length < 3) errors.Set(nameof(input.Name), "Tên sản phẩm cần ít nhất 3 ký tự");
        else if (name.Length > 120) errors.Set(nameof(input.Name), "Tên tối đa 120 ký tự");

        var category = Text.IsBlank(input.CategoryId) ? null : await db.Categories.Include(c => c.Subcategories).FirstOrDefaultAsync(c => c.Id == input.CategoryId);
        if (category is null) errors.Set(nameof(input.CategoryId), "Chọn danh mục");
        var subcategory = category?.Subcategories.FirstOrDefault(s => s.Id == input.SubcategoryId);
        if (subcategory is null) errors.Set(nameof(input.SubcategoryId), "Chọn nhóm hàng");
        if (Text.IsBlank(input.Brand)) errors.Set(nameof(input.Brand), "Nhập thương hiệu");
        if (Text.IsBlank(input.Origin)) errors.Set(nameof(input.Origin), "Nhập xuất xứ");
        if (!Units.Contains(input.Unit)) errors.Set(nameof(input.Unit), "Chọn đơn vị tính");

        var barcode = input.Barcode?.Trim() ?? "";
        if (!BarcodePattern().IsMatch(barcode)) errors.Set(nameof(input.Barcode), "Mã vạch gồm đúng 13 chữ số");
        var sku = input.Sku?.Trim() ?? "";
        if (!SkuPattern().IsMatch(sku)) errors.Set(nameof(input.Sku), "SKU gồm 4–20 ký tự chữ, số hoặc dấu gạch ngang");

        var price = Text.ParseInt(input.Price);
        if (price is null) errors.Set(nameof(input.Price), "Nhập giá bán (số nguyên, đơn vị đồng)");
        else if (price <= 0) errors.Set(nameof(input.Price), "Giá bán phải lớn hơn 0");
        int? compareAt = null;
        if (!Text.IsBlank(input.CompareAtPrice))
        {
            compareAt = Text.ParseInt(input.CompareAtPrice);
            if (compareAt is null) errors.Set(nameof(input.CompareAtPrice), "Chỉ nhập số");
            else if (price is int p && compareAt <= p) errors.Set(nameof(input.CompareAtPrice), "Giá gốc phải lớn hơn giá bán (hoặc để trống)");
        }
        var cost = Text.ParseInt(input.CostPrice);
        if (cost is null) errors.Set(nameof(input.CostPrice), "Nhập giá vốn (số nguyên, đơn vị đồng)");
        int? shelf = null;
        if (!Text.IsBlank(input.ShelfLifeDays))
        {
            shelf = Text.ParseInt(input.ShelfLifeDays);
            if (shelf is null) errors.Set(nameof(input.ShelfLifeDays), "Chỉ nhập số ngày");
            else if (shelf < 1) errors.Set(nameof(input.ShelfLifeDays), "Hạn dùng tối thiểu 1 ngày");
        }
        var image = input.Image?.Trim() ?? "";
        if (image.Length > 0 && !UrlPattern().IsMatch(image) && !ProductImages.IsUploaded(image))
            errors.Set(nameof(input.Image), "Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://");

        if (errors.Count == 0)
        {
            var upper = sku.ToUpperInvariant();
            if (await db.Products.AnyAsync(p => p.Id != input.Id && p.Sku.ToUpper() == upper))
                errors.Set(nameof(input.Sku), "SKU này đã được dùng cho sản phẩm khác");
            var sameBarcode = await db.Products.FirstOrDefaultAsync(p => p.Id != input.Id && p.Barcode == barcode);
            if (sameBarcode is not null) errors.Set(nameof(input.Barcode), $"Mã vạch đã dùng cho “{sameBarcode.Name}”");
        }
        if (errors.Count > 0) return SaveResult<Product>.Fail(errors);

        var product = input.Id is null ? null : await db.Products.FindAsync(input.Id);
        var isNew = product is null;
        if (product is null)
        {
            product = new Product
            {
                Id = "p-" + Text.Random(8),
                Slug = await UniqueSlugAsync(Text.Slugify(name)),
                CreatedAt = DateTime.Now,
            };
            db.Products.Add(product);
        }
        var (oldPrice, oldCost) = (product.Price, product.CostPrice);
        product.Name = name;
        product.CategoryId = category!.Id;
        product.SubcategoryId = subcategory!.Id;
        product.Brand = input.Brand!.Trim();
        product.Origin = input.Origin!.Trim();
        product.Unit = input.Unit!;
        product.ShelfLifeDays = shelf;
        product.Price = price!.Value;
        product.CompareAtPrice = compareAt;
        product.CostPrice = cost!.Value;
        product.Sku = sku.ToUpperInvariant();
        product.Barcode = barcode;
        product.Image = image;
        product.IsActive = input.IsActive;
        product.IsNew = input.IsNew;
        product.AgeRestricted = input.AgeRestricted || category.AgeRestricted;

        if (isNew || oldPrice != product.Price || oldCost != product.CostPrice)
        {
            var employee = actor is null ? null : await db.Employees.FindAsync(actor.Id);
            db.PriceChanges.Add(new PriceChange
            {
                ProductId = product.Id,
                At = now ?? DateTime.Now,
                EmployeeId = employee?.Id,
                EmployeeName = employee?.FullName ?? "Hệ thống",
                OldPrice = isNew ? null : oldPrice,
                NewPrice = product.Price,
                OldCostPrice = isNew ? null : oldCost,
                NewCostPrice = product.CostPrice,
            });
        }

        if (isNew)
        {
            var storeIds = await db.Stores.Select(s => s.Id).ToListAsync();
            db.StockLevels.AddRange(storeIds.Select(id => new StockLevel { StoreId = id, ProductId = product.Id, Quantity = 0, MinQuantity = InventoryService.DefaultMinQuantity }));
        }
        await db.SaveChangesAsync();
        return new SaveResult<Product>(product, errors);
    }

    public async Task<Product?> SetActiveAsync(string id, bool active)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return null;
        product.IsActive = active;
        await db.SaveChangesAsync();
        return product;
    }

    private async Task<string> UniqueSlugAsync(string slug)
    {
        var taken = (await db.Products.Where(p => p.Slug == slug || p.Slug.StartsWith(slug + "-")).Select(p => p.Slug).ToListAsync()).ToHashSet();
        if (!taken.Contains(slug)) return slug;
        for (var i = 2; ; i++)
            if (!taken.Contains($"{slug}-{i}")) return $"{slug}-{i}";
    }
}
