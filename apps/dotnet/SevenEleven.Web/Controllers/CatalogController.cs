using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;
using SevenEleven.Web.Models.Shop;

namespace SevenEleven.Web.Controllers;

/// <summary>Danh mục (/danh-muc/{slug}), chi tiết sản phẩm (/san-pham/{slug}) và tìm kiếm.</summary>
public class CatalogController(AppDbContext db, ShopContext shop) : ShopController(db)
{
    /// <summary>Danh sách sản phẩm của một ngành hàng: lọc theo nhóm (?nhom=) và sắp xếp (?sapxep=).</summary>
    public IActionResult Category(string slug, string? nhom, string? sapxep)
    {
        var category = shop.Categories.FirstOrDefault(c => c.Slug == slug);
        if (category is null) return NotFoundPanel("Không tìm thấy danh mục",
            "Danh mục này không tồn tại hoặc đã được đổi tên. Bạn chọn danh mục ở thanh bên trái hoặc xem gợi ý bên dưới.");

        var sort = CategoryModel.Sorts.Any(s => s.Key == sapxep) ? sapxep! : "pho-bien";
        var sub = category.Subcategories.FirstOrDefault(s => s.Slug == nhom);
        var all = shop.Products.Where(p => p.CategoryId == category.Id).ToList();
        var sorted = Sorted(all, sort);

        List<(Subcategory, List<Product>)> sections = sub is not null
            ? [(sub, sorted.Where(p => p.SubcategoryId == sub.Id).ToList())]
            : category.Subcategories
                .Select(s => (s, sorted.Where(p => p.SubcategoryId == s.Id).ToList()))
                .Where(x => x.Item2.Count > 0)
                .ToList();

        ViewBag.ActiveCategory = category.Slug;
        ViewData["Title"] = category.Name;
        return View(new CategoryModel { Category = category, Subcategory = sub, Sort = sort, Total = all.Count, Sections = sections });
    }

    /// <summary>
    /// Sắp xếp như khách nhìn thấy: giá đã tính flash sale đang chạy; "Phổ biến" theo số đã bán (đơn không
    /// huỷ); hoà nhau thì giữ thứ tự gốc. Giống useSortedProducts của bản Next.js.
    /// </summary>
    private List<Product> Sorted(List<Product> products, string sort, IReadOnlyDictionary<string, int>? relevance = null)
    {
        var sales = shop.SalesRank();
        var position = products.Select((p, i) => (p.Id, i)).ToDictionary(x => x.Id, x => x.i);
        int Sold(Product p) => sales.GetValueOrDefault(p.Id);
        IOrderedEnumerable<Product> ordered = sort switch
        {
            "gia-tang" => products.OrderBy(p => shop.Display(p).Price),
            "gia-giam" => products.OrderByDescending(p => shop.Display(p).Price),
            "giam-gia" => products.OrderByDescending(p => shop.Display(p).Percent ?? 0),
            "moi-nhat" => products.OrderByDescending(p => p.IsNew).ThenByDescending(p => p.CreatedAt),
            "phu-hop" => products.OrderByDescending(p => relevance?.GetValueOrDefault(p.Id) ?? 0),
            _ => products.OrderByDescending(Sold),
        };
        return ordered.ThenByDescending(Sold).ThenBy(p => position[p.Id]).ToList();
    }

    /// <summary>Chi tiết sản phẩm: giá, còn hàng ở cửa hàng phục vụ giỏ, ưu đãi đang áp, sản phẩm cùng loại.</summary>
    public async Task<IActionResult> Product(string slug, string? tuoi, int? sl)
    {
        var product = await Db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug);
        if (product is null) return NotFoundPanel("Không tìm thấy sản phẩm",
            "Sản phẩm có thể đã ngừng kinh doanh hoặc đường dẫn không đúng. Bạn thử tìm bằng ô tìm kiếm phía trên nhé.");

        var category = shop.CategoryOf(product.CategoryId);
        var sub = category?.Subcategories.FirstOrDefault(s => s.Id == product.SubcategoryId);
        var store = shop.ServingStore;
        var stock = store is null ? null : await Db.StockLevels.AsNoTracking().FirstOrDefaultAsync(s => s.StoreId == store.Id && s.ProductId == product.Id);
        var inCart = shop.InCart(product.Id);
        var available = stock?.Quantity ?? 0;
        var state = available <= 0 ? "out" : available <= (stock?.MinQuantity ?? 0) ? "low" : "ok";
        var remaining = Math.Max(0, available - inCart);

        string? blocker = null;
        if (!product.IsActive) blocker = "Ngừng kinh doanh";
        else if (store is null || store.Status != StoreStatus.Active) blocker = "Cửa hàng tạm ngưng phục vụ";
        else if (state == "out") blocker = "Tạm hết hàng";
        else if (remaining <= 0) blocker = "Đã thêm hết số lượng còn hàng";

        var now = shop.Now;
        var bundle = shop.Promotions.FirstOrDefault(p =>
            p.Type == PromotionType.BuyXGetY && p.BuyQuantity > 0 && p.GetQuantity > 0 &&
            PricingService.AppliesTo(p, product) && PricingService.IsLive(p, now, SalesChannel.Online));

        var others = shop.Products.Where(p => p.Id != product.Id).ToList();
        var related = others.Where(p => p.SubcategoryId == product.SubcategoryId)
            .Concat(others.Where(p => p.CategoryId == product.CategoryId && p.SubcategoryId != product.SubcategoryId))
            .Take(12)
            .ToList();

        ViewBag.ActiveCategory = category?.Slug;
        ViewData["Title"] = product.Name;
        return View(new ProductModel
        {
            Product = product,
            Category = category,
            Subcategory = sub,
            Display = shop.Display(product),
            Now = now,
            Store = store,
            Stock = stock,
            InCart = inCart,
            StockState = state,
            Available = available,
            Max = Math.Max(1, Math.Min(99, remaining)),
            Blocker = blocker,
            Bundle = bundle,
            Offers = Offers(product),
            Related = related,
            AgeConfirmed = shop.AgeConfirmed,
            AskAge = tuoi == "1" && product.AgeRestricted && !shop.AgeConfirmed,
            AskAgeQuantity = Math.Clamp(sl ?? 1, 1, 99),
        });
    }

    /// <summary>Khuyến mãi đang chạm tới sản phẩm: khung flash sale, mua X tặng Y, voucher đồ uống thành viên, mã giảm giá riêng.</summary>
    private List<ProductOffer> Offers(Product product)
    {
        var now = shop.Now;
        var list = new List<ProductOffer>();
        bool Touches(Promotion p) => ShopPromos.PromotionProducts(p, [product]).Count > 0;

        foreach (var slot in shop.FlashSlots.Where(s => Touches(s.Promotion)))
        {
            list.Add(new ProductOffer(slot.Promotion.Id, "zap", "red", $"Flash sale {slot.Promotion.Name}: giảm {slot.Promotion.Value}%",
                slot.State == SlotState.Live
                    ? $"Đang diễn ra, kết thúc lúc {Fmt.Time(slot.End)}"
                    : $"Khung giờ {slot.Window} mỗi ngày · {slot.OpensLabel(now)}"));
        }

        foreach (var promo in shop.Promotions.Where(p => p.Type == PromotionType.BuyXGetY && p.BuyQuantity > 0 && p.GetQuantity > 0
                                                          && PricingService.IsLive(p, now, SalesChannel.Online) && Touches(p)))
        {
            list.Add(new ProductOffer(promo.Id, "gift", "orange", $"Mua {promo.BuyQuantity} tặng {promo.GetQuantity}",
                $"{promo.Description} Áp dụng đến {Fmt.Date(promo.EndsAt)}."));
        }

        var member = shop.Promotions.FirstOrDefault(p => p.Type == PromotionType.MemberVoucher && PricingService.IsLive(p, now, SalesChannel.Online));
        if (member is not null && MembershipService.DrinkCategoryIds.Contains(product.CategoryId))
        {
            var customer = shop.Customer;
            var tier = customer is not null && PricingService.Tiers(member).Contains(customer.Tier) ? MembershipService.Info(customer.Tier) : null;
            var lowest = MembershipService.Info(MembershipService.Order[0]);
            var highest = MembershipService.Info(MembershipService.Order[^1]);
            list.Add(new ProductOffer(member.Id, "crown", "orange",
                tier is not null
                    ? $"Hạng {tier.Label} của bạn: giảm {Fmt.Vnd(tier.DrinkVoucher)} mỗi ly"
                    : $"Thành viên giảm {Fmt.Vnd(lowest.DrinkVoucher)} – {Fmt.Vnd(highest.DrinkVoucher)} mỗi ly",
                tier is not null
                    ? $"Tự động áp dụng khi đặt hàng, tối đa {MembershipService.MaxDrinkVouchersPerOrder} ly mỗi đơn."
                    : $"Theo hạng {string.Join(", ", MembershipService.Order.Select(TierStyle.Label))} · tối đa {MembershipService.MaxDrinkVouchersPerOrder} ly mỗi đơn.",
                ActionLabel: "Tìm hiểu", ActionHref: ShopUrls.Membership));
        }

        foreach (var promo in shop.Promotions)
        {
            if (string.IsNullOrEmpty(promo.Code) || promo.OwnerId is not null || !PricingService.Channels(promo).Contains(SalesChannel.Online)
                || PricingService.EffectiveStatus(promo, now) != PromotionStatus.Active) continue;
            if (promo.UsageLimit is int limit && promo.UsageCount >= limit) continue;
            // Chỉ mã nhắm vào sản phẩm/ngành hàng này; mã toàn cửa hàng nằm ở trang Khuyến mãi.
            if (!PricingService.Split(promo.ProductIds).Contains(product.Id) && !PricingService.Split(promo.CategoryIds).Contains(product.CategoryId)) continue;
            list.Add(new ProductOffer(promo.Id, "ticket-percent", "brand", $"Nhập mã {promo.Code}", promo.Description, promo.Code,
                ActionLabel: "Xem mã", ActionHref: ShopUrls.Promotions + "#ma-giam-gia"));
        }
        return list;
    }

    /// <summary>
    /// Tìm kiếm như search-view.tsx: khớp tên/thương hiệu không dấu (hoặc đúng mã vạch, SKU); có kết quả khớp
    /// trọn từ thì chỉ giữ chúng ("mì" ra "Mì Ly" chứ không ra "Milo"); mặc định xếp theo độ phù hợp.
    /// </summary>
    public IActionResult Search(string? q, string? sapxep)
    {
        var query = (q ?? "").Trim();
        ViewData["Title"] = query.Length == 0 ? "Tìm kiếm" : $"Tìm \"{query}\"";
        var deals = ShopPromos.Discounted(shop.Products).Take(16).ToList();
        if (query.Length == 0) return View(new SearchModel { Query = "", Sort = "phu-hop", Results = [], Deals = deals });

        var folded = Text.Fold(query);
        var terms = folded.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var found = shop.Products.Where(p =>
            p.Barcode == query || string.Equals(p.Sku, query, StringComparison.OrdinalIgnoreCase)
            || terms.All(Text.Fold($"{p.Name} {p.Brand}").Contains)).ToList();
        var wordTerms = SearchModel.WordsOf(query);
        var strong = found.Where(p => SearchModel.MatchesWords(SearchModel.WordsOf($"{p.Name} {p.Brand}"), wordTerms)).ToList();
        var results = strong.Count > 0 ? strong : found;

        var phrase = string.Join(' ', wordTerms);
        var relevance = results.ToDictionary(p => p.Id, p =>
        {
            var words = SearchModel.WordsOf(p.Name);
            var name = string.Join(' ', words);
            var score = wordTerms.Count(words.Contains);
            if ($" {name} ".Contains($" {phrase} ")) score += 2;
            if ($"{name} ".StartsWith($"{phrase} ")) score += 4;
            if (p.Barcode == query || string.Equals(p.Sku, query, StringComparison.OrdinalIgnoreCase)) score += 20;
            return score;
        });

        var groups = new List<(string Href, string Label)>();
        if (wordTerms.Length > 0)
        {
            foreach (var c in shop.Categories)
            {
                if (SearchModel.MatchesWords(SearchModel.WordsOf(c.Name), wordTerms)) groups.Add((ShopUrls.Category(c.Slug), c.Name));
                foreach (var sub in c.Subcategories)
                    if (SearchModel.MatchesWords(SearchModel.WordsOf(sub.Name), wordTerms)) groups.Add((ShopUrls.Category(c.Slug, sub.Slug), sub.Name));
            }
        }

        var sort = SearchModel.Sorts.Any(x => x.Key == sapxep) ? sapxep! : "phu-hop";
        return View(new SearchModel
        {
            Query = query, Sort = sort, Results = Sorted(results, sort, relevance), Groups = groups.Take(6).ToList(),
            Deals = results.Count == 0 ? deals : [],
        });
    }

    /// <summary>404 trong khung cửa hàng, kèm lối tắt (not-found-panel.tsx).</summary>
    private ViewResult NotFoundPanel(string title, string description)
    {
        Response.StatusCode = StatusCodes.Status404NotFound;
        ViewData["Title"] = title;
        return View("NotFound", (title, description));
    }
}
