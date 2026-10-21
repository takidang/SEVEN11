using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Models.Shop;

/// <summary>
/// Một món trên kệ đầu trang chủ, kèm giá trong khung flash sale và giá thường (gạch đi).
/// <see cref="Facings"/> &gt; 1: khung giờ chỉ có một món ảnh sạch nên bày nhiều mặt hàng của món đó sau
/// một nhãn giá, như kệ thật.
/// </summary>
public sealed record ShelfItem(Product Product, int SalePrice, int Price, int Facings = 1);

/// <summary>
/// Thẻ thành viên bằng nhựa (_TierCard): có <see cref="Name"/> là thẻ của khách (tên, số điện thoại, mã vạch),
/// không có thì là thẻ mẫu của hạng với một dòng <see cref="Note"/>.
/// </summary>
public sealed record TierCardModel(MemberTier Tier, string? Name = null, string? Phone = null, string? Note = null, string? Css = null);

/// <summary>Ô "Gợi ý cho bạn" dẫn vào một danh mục.</summary>
public sealed record Collection(string Title, string Href, string[] PhotoIds, bool Tall = false);

public sealed class HomeModel
{
    public required IReadOnlyList<FlashSlot> Slots { get; init; }
    public FlashSlot? Featured { get; init; }
    /// <summary>Khung giờ đang chọn ở mục Flash Sale (mặc định: khung nổi bật).</summary>
    public FlashSlot? Selected { get; init; }
    /// <summary>Kệ đầu trang: tối đa ba món ảnh tách nền sạch của khung nổi bật.</summary>
    public required List<ShelfItem> Shelf { get; init; }
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
