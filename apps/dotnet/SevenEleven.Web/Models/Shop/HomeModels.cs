using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Models.Shop;

/// <summary>Ảnh đặt trên "đĩa" tròn của banner / ô gợi ý.</summary>
public sealed record ArtPhoto(string Key, string Src, string Alt, string Zoom);

/// <summary>Ô "Gợi ý cho bạn" dẫn vào một danh mục.</summary>
public sealed record Collection(string Title, string Href, string Tint, string[] PhotoIds, bool Tall = false);

public sealed class HomeModel
{
    public required IReadOnlyList<FlashSlot> Slots { get; init; }
    public FlashSlot? Featured { get; init; }
    /// <summary>Khung giờ đang chọn ở mục Flash Sale (mặc định: khung nổi bật).</summary>
    public FlashSlot? Selected { get; init; }
    public required List<ArtPhoto> BannerPhotos { get; init; }
    public Product? MemberCup { get; init; }
    public required List<(Collection Collection, List<Product> Photos)> Collections { get; init; }
    public required Dictionary<string, List<Product>> SlotProducts { get; init; }
    public required List<Product> NewProducts { get; init; }
    public required List<(Category Category, List<Product> Products)> CategoryRails { get; init; }
    public required IReadOnlyList<Category> Categories { get; init; }
    public DateTime Now { get; init; }
}

public sealed class PromotionsModel
{
    public required DateTime Now { get; init; }
    public required IReadOnlyList<FlashSlot> Slots { get; init; }
    public FlashSlot? Selected { get; init; }
    public required Dictionary<string, List<Product>> SlotProducts { get; init; }
    /// <summary>Mã đang chạy (hết hạn sớm trước) rồi mã sắp chạy.</summary>
    public required List<Promotion> Codes { get; init; }
    public required List<(Promotion Promotion, List<Product> Products)> Bundles { get; init; }
    public Promotion? MemberVoucher { get; init; }
    public Customer? Customer { get; init; }
    public required IReadOnlyList<Category> Categories { get; init; }
}

public sealed class MembershipModel
{
    public Customer? Customer { get; init; }
    public KeepStatus? Keep { get; init; }
    public required DateTime Now { get; init; }
    public required string DrinkCategoryNames { get; init; }
}
