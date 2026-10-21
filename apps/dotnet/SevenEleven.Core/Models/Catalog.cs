namespace SevenEleven.Core.Models;

/// <summary>Ngành hàng, ví dụ "Trà sữa & Trà trái cây".</summary>
public class Category
{
    public string Id { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>Ảnh biểu tượng lấy từ CDN.</summary>
    public string Icon { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsHot { get; set; }
    /// <summary>Đồ uống có cồn: phải xác nhận đủ 18 tuổi trước khi bán.</summary>
    public bool AgeRestricted { get; set; }

    public List<Subcategory> Subcategories { get; set; } = [];
    public List<Product> Products { get; set; } = [];
}

/// <summary>Nhóm hàng trong một ngành hàng, ví dụ "Trà sữa 7-Eleven".</summary>
public class Subcategory
{
    public string Id { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Name { get; set; } = "";

    public string CategoryId { get; set; } = "";
    public Category? Category { get; set; }
    public List<Product> Products { get; set; } = [];
}

public class Product
{
    public string Id { get; set; } = "";
    /// <summary>Mã nội bộ in trên tem giá.</summary>
    public string Sku { get; set; } = "";
    /// <summary>Mã vạch EAN-13 mà máy quét ở quầy đọc.</summary>
    public string Barcode { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Name { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Unit { get; set; } = "";
    public string Origin { get; set; } = "";
    public string Image { get; set; } = "";

    /// <summary>Giá bán. Tiền luôn là số nguyên VND.</summary>
    public int Price { get; set; }
    /// <summary>Giá gốc khi đang giảm, hiển thị gạch ngang.</summary>
    public int? CompareAtPrice { get; set; }
    /// <summary>Giá vốn, dùng để tính lợi nhuận gộp.</summary>
    public int CostPrice { get; set; }
    /// <summary>Hàng tươi: số ngày dùng được sau khi nhập. Null là hàng để lâu.</summary>
    public int? ShelfLifeDays { get; set; }

    public bool IsNew { get; set; }
    public bool AgeRestricted { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }

    public string CategoryId { get; set; } = "";
    public Category? Category { get; set; }
    public string SubcategoryId { get; set; } = "";
    public Subcategory? Subcategory { get; set; }

    public List<StockLevel> StockLevels { get; set; } = [];
}
