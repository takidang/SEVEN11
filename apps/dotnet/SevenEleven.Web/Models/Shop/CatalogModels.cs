using SevenEleven.Core.Models;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Models.Shop;

public sealed class CategoryModel
{
    public required Category Category { get; init; }
    public Subcategory? Subcategory { get; init; }
    /// <summary>Khoá sắp xếp (pho-bien, gia-tang, ...).</summary>
    public required string Sort { get; init; }
    public required int Total { get; init; }
    /// <summary>Mỗi nhóm hàng một khối (chỉ nhóm có hàng), hoặc một khối khi đang chọn nhóm.</summary>
    public required List<(Subcategory Sub, List<Product> Products)> Sections { get; init; }

    public static readonly (string Key, string Label)[] Sorts =
    [
        ("pho-bien", "Phổ biến"),
        ("gia-tang", "Giá thấp → cao"),
        ("gia-giam", "Giá cao → thấp"),
        ("giam-gia", "Đang giảm giá"),
        ("moi-nhat", "Mới nhất"),
    ];

    public static string SortLabel(string key) => Sorts.FirstOrDefault(s => s.Key == key).Label ?? "Phổ biến";
}

/// <summary>Một ưu đãi đang áp cho sản phẩm (khối "Ưu đãi áp dụng").</summary>
public sealed record ProductOffer(string Key, string Icon, string Tone, string Title, string Detail, string? Code = null, string? ActionLabel = null, string? ActionHref = null);

public sealed class ProductModel
{
    public required Product Product { get; init; }
    public Category? Category { get; init; }
    public Subcategory? Subcategory { get; init; }
    public required DisplayPrice Display { get; init; }
    public required DateTime Now { get; init; }
    public Store? Store { get; init; }
    public StockLevel? Stock { get; init; }
    public required int InCart { get; init; }
    /// <summary>Trạng thái hàng tại cửa hàng phục vụ: ok · low · out.</summary>
    public required string StockState { get; init; }
    public required int Available { get; init; }
    public required int Max { get; init; }
    /// <summary>Lý do không thêm được vào giỏ, null khi thêm được.</summary>
    public string? Blocker { get; init; }
    /// <summary>Mua X tặng Y đang chạy cho sản phẩm (nếu có).</summary>
    public Promotion? Bundle { get; init; }
    public required List<ProductOffer> Offers { get; init; }
    public required List<Product> Related { get; init; }
    public required bool AgeConfirmed { get; init; }
    /// <summary>Mở sẵn hộp thoại 18+ (khi trình duyệt tắt JavaScript).</summary>
    public bool AskAge { get; init; }
    public int AskAgeQuantity { get; init; } = 1;
}

/// <summary>Trang tìm kiếm (/tim-kiem?q=&amp;sapxep=).</summary>
public sealed partial class SearchModel
{
    public required string Query { get; init; }
    public required string Sort { get; init; }
    public required List<Product> Results { get; init; }
    public List<(string Href, string Label)> Groups { get; init; } = [];
    /// <summary>"Đang giảm giá" khi chưa gõ gì hoặc không có kết quả.</summary>
    public List<Product> Deals { get; init; } = [];

    public static readonly (string Key, string Label)[] Sorts = [("phu-hop", "Phù hợp nhất"), .. CategoryModel.Sorts];
    public static readonly string[] Popular = ["trà sữa", "mì ly", "bia", "sữa chua", "snack", "bánh mì"];
    public static string SortLabel(string key) => Sorts.FirstOrDefault(s => s.Key == key).Label ?? "Phù hợp nhất";

    [System.Text.RegularExpressions.GeneratedRegex("[^a-z0-9]+")]
    private static partial System.Text.RegularExpressions.Regex NonWord();

    /// <summary>Các từ không dấu, chữ thường của một chuỗi ("Mì Ly Samyang" → mi, ly, samyang).</summary>
    public static string[] WordsOf(string text) => NonWord().Split(SevenEleven.Core.Services.Text.Fold(text)).Where(w => w.Length > 0).ToArray();

    /// <summary>Mọi từ tìm đều là một từ trọn vẹn (từ dài từ 3 chữ có thể khớp phần đầu một từ).</summary>
    public static bool MatchesWords(string[] words, string[] terms) =>
        terms.All(t => words.Any(w => w == t || (t.Length >= 3 && w.StartsWith(t, StringComparison.Ordinal))));
}
