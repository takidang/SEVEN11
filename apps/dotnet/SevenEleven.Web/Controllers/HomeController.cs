using Microsoft.AspNetCore.Mvc;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;
using SevenEleven.Web.Models.Shop;

namespace SevenEleven.Web.Controllers;

/// <summary>Trang chủ, trang Flash sale &amp; khuyến mãi (/khuyen-mai) và Chương trình thành viên (/thanh-vien).</summary>
public class HomeController(AppDbContext db, ShopContext shop, CustomerAdminService customers) : ShopController(db)
{
    /// <summary>Ngành hàng có dải sản phẩm riêng ở trang chủ, theo thứ tự này.</summary>
    private static readonly string[] HomeRailCategoryIds = ["tra-sua", "mon-ngon", "cac-loai-banh", "do-an-vat", "san-pham-tu-sua", "do-uong-dong-chai"];
    private const int RailSize = 14;

    /// <summary>"Gợi ý cho bạn" — lối tắt vào danh mục, ảnh là các sản phẩm có ảnh tách nền sạch.</summary>
    private static readonly Collection[] Collections =
    [
        new("Trà sữa & cà phê", ShopUrls.Category("tra-sua"), "tint-orange", ["p0014", "p0010", "p0021"]),
        new("Món ngon nhà Bảy", ShopUrls.Category("mon-ngon"), "tint-brand", ["p0047", "p0031", "p0044"]),
        new("Bánh mì & toastie", ShopUrls.Category("cac-loai-banh"), "tint-sale", ["p0079", "p0070", "p0086"]),
        new("Snack ăn xế", ShopUrls.Category("do-an-vat"), "tint-red", ["p0114", "p0122", "p0113"]),
        new("Bia lạnh 24/7", ShopUrls.Category("do-uong-co-con", "bia"), "tint-info", ["p0224", "p0221", "p0223"], true),
        new("Sữa & sữa chua", ShopUrls.Category("san-pham-tu-sua"), "tint-fresh", ["p0146", "p0161", "p0162"], true),
        new("Nước giải khát", ShopUrls.Category("do-uong-dong-chai"), "tint-orange", ["p0187", "p0182", "p0197"], true),
        new("Chăm sóc cá nhân", ShopUrls.Category("cham-soc-ca-nhan"), "tint-surface", ["p0295", "p0301", "p0286"], true),
    ];

    public IActionResult Index(string? khung)
    {
        ViewData["Title"] = "Trang chủ";
        var products = shop.Products;
        var categories = shop.Categories;
        var slots = shop.FlashSlots;
        var featured = ShopPromos.Featured(slots);
        var selected = slots.FirstOrDefault(s => s.Promotion.Id == khung) ?? featured ?? slots.FirstOrDefault();

        var pool = featured is not null ? ShopPromos.PromotionProducts(featured.Promotion, products) : ShopPromos.Discounted(products).ToList();
        var byId = products.ToDictionary(p => p.Id);

        var model = new HomeModel
        {
            Now = shop.Now,
            Slots = slots,
            Featured = featured,
            Selected = selected,
            Shelf = PickShelf(featured, pool),
            Collections = Collections.Select(c => (c, c.PhotoIds.Select(byId.GetValueOrDefault).OfType<Product>().ToList())).ToList(),
            SlotProducts = slots.ToDictionary(s => s.Promotion.Id, s => ShopPromos.PromotionProducts(s.Promotion, products)),
            NewProducts = products.Where(p => p.IsNew).OrderByDescending(p => p.CreatedAt).Take(16).ToList(),
            CategoryRails = HomeRailCategoryIds
                .Select(id => categories.FirstOrDefault(c => c.Id == id))
                .OfType<Category>()
                .Select(c => (c, products.Where(p => p.CategoryId == c.Id).Take(RailSize).ToList()))
                .Where(r => r.Item2.Count > 0)
                .ToList(),
            Categories = categories,
        };
        return View(model);
    }

    /// <summary>
    /// Món bày trên kệ đầu trang: chỉ món có ảnh tách nền sạch, vì ảnh có khung đỏ hay tem "Giảm 50%" không
    /// đứng trên kệ được. Khung chỉ có một món như vậy thì bày ba mặt hàng của món đó sau một nhãn giá.
    /// </summary>
    private static List<ShelfItem> PickShelf(FlashSlot? slot, List<Product> pool)
    {
        var clean = pool.Where(p => ShopImages.CleanPhotoIds.Contains(p.Id)).Take(3).ToList();
        return clean.Select(p => new ShelfItem(
                p,
                slot is null ? p.Price : PricingService.FlashPrice(p.Price, slot.Promotion.Value),
                p.CompareAtPrice ?? p.Price,
                clean.Count == 1 ? 3 : 1))
            .ToList();
    }

    public IActionResult Promotions(string? khung)
    {
        ViewData["Title"] = "Flash sale & khuyến mãi";
        var now = shop.Now;
        var products = shop.Products;
        var slots = shop.FlashSlots;
        var selected = slots.FirstOrDefault(s => s.Promotion.Id == khung) ?? ShopPromos.Featured(slots) ?? slots.FirstOrDefault();

        // Voucher riêng (đổi từ sao vàng) thuộc về một thành viên: nằm trong tài khoản, không hiện ở đây.
        var online = shop.Promotions.Where(p => !string.IsNullOrEmpty(p.Code) && p.OwnerId is null && PricingService.Channels(p).Contains(SalesChannel.Online)).ToList();
        var codes = online.Where(p => PricingService.EffectiveStatus(p, now) == PromotionStatus.Active).OrderBy(p => p.EndsAt)
            .Concat(online.Where(p => PricingService.EffectiveStatus(p, now) == PromotionStatus.Scheduled).OrderBy(p => p.StartsAt))
            .ToList();

        var bundles = shop.Promotions
            .Where(p => p.Type == PromotionType.BuyXGetY && p.BuyQuantity > 0 && p.GetQuantity > 0 && PricingService.IsLive(p, now, SalesChannel.Online))
            .Select(p => (p, ShopPromos.PromotionProducts(p, products)))
            .Where(d => d.Item2.Count > 0)
            .ToList();

        return View(new PromotionsModel
        {
            Now = now,
            Slots = slots,
            Selected = selected,
            SlotProducts = slots.ToDictionary(s => s.Promotion.Id, s => ShopPromos.PromotionProducts(s.Promotion, products)),
            Codes = codes,
            Bundles = bundles,
            MemberVoucher = shop.Promotions.FirstOrDefault(p => p.Type == PromotionType.MemberVoucher && PricingService.IsLive(p, now, SalesChannel.Online)),
            Customer = shop.Customer,
            Categories = shop.Categories,
        });
    }

    public async Task<IActionResult> Membership()
    {
        ViewData["Title"] = "Chương trình thành viên";
        var customer = shop.Customer;
        KeepStatus? keep = null;
        if (customer is not null)
        {
            var spend = (await customers.MonthSpendAsync(shop.Now, [customer.Id])).GetValueOrDefault(customer.Id);
            keep = MembershipService.Keep(customer, spend, shop.Now);
        }
        var drinkNames = string.Join(", ", shop.Categories.Where(c => MembershipService.DrinkCategoryIds.Contains(c.Id)).Select(c => c.Name));
        return View(new MembershipModel { Customer = customer, Keep = keep, Now = shop.Now, DrinkCategoryNames = drinkNames });
    }

    /// <summary>Lỗi máy chủ (bản chạy thật): cùng trang lỗi thân thiện với 404.</summary>
    public IActionResult Error()
    {
        ViewData["Title"] = "Có lỗi xảy ra";
        return View("~/Views/Status/Show.cshtml", new StatusPageModel(StatusCodes.Status500InternalServerError, null));
    }
}
