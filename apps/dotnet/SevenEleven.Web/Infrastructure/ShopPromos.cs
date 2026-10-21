using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Giá khách thấy trên thẻ sản phẩm lúc này: giá bán, giá gạch ngang và flash sale đang chạy.</summary>
public sealed record DisplayPrice(int Price, int? CompareAt, Promotion? Flash, DateTime? FlashEndsAt)
{
    public int? Percent => Fmt.DiscountPercent(Price, CompareAt);
}

public enum SlotState { Live, Upcoming, Ended }

/// <summary>Một khung giờ flash sale của hôm nay (giống FlashSlot trong flash-slots.ts).</summary>
public sealed record FlashSlot(Promotion Promotion, DateTime Start, DateTime End, SlotState State, DateTime? NextStart)
{
    /// <summary>"14:00 – 17:00".</summary>
    public string Window => $"{Fmt.Time(Start)} – {Fmt.Time(End)}";

    /// <summary>"Bắt đầu lúc 14:00" / "Bắt đầu lúc 06:00 ngày mai" / "Đã kết thúc" (gọn: "06:00 ngày mai").</summary>
    public string OpensLabel(DateTime now, bool compact = false)
    {
        if (NextStart is not DateTime next) return "Đã kết thúc";
        var at = Fmt.Time(next) + (next.Date != now.Date ? " ngày mai" : "");
        return compact ? at : "Bắt đầu lúc " + at;
    }
}

/// <summary>Một voucher trong ô chọn voucher của giỏ hàng, đã kiểm với giỏ hiện tại.</summary>
public sealed record VoucherOption(Promotion Promo, int Saving, string? Reason, double? Progress)
{
    public bool Usable => Reason is null;
}

/// <summary>
/// Khuyến mãi phía cửa hàng online, chuyển từ flash-slots.ts, pricing.ts (displayPrice) và
/// vouchers.ts của bản Next.js. Phần tính tiền vẫn đi qua PricingService.
/// </summary>
public static class ShopPromos
{
    private static TimeSpan TimeOf(string hhmm)
    {
        var parts = hhmm.Split(':');
        return new TimeSpan(int.Parse(parts[0]), int.Parse(parts[1]), 0);
    }

    /// <summary>Giờ khung giờ hôm nay đóng lại (cho đồng hồ đếm ngược).</summary>
    public static DateTime WindowEndsAt(Promotion p, DateTime now) =>
        p.DailyEnd is null ? p.EndsAt : now.Date + TimeOf(p.DailyEnd);

    public static DisplayPrice Display(Product product, IReadOnlyCollection<Promotion> promotions, DateTime now)
    {
        var sale = PricingService.FlashSaleFor(product, promotions, now, SalesChannel.Online);
        if (sale is not null)
            return new DisplayPrice(PricingService.FlashPrice(product.Price, sale.Value), product.CompareAtPrice ?? product.Price, sale, WindowEndsAt(sale, now));
        return new DisplayPrice(product.Price, product.CompareAtPrice, null, null);
    }

    // ------------------------------------------------------------------ khung giờ flash sale

    /// <summary>Khung giờ flash sale hôm nay, lấy từ các khuyến mãi trong cơ sở dữ liệu (khu quản lý tạm dừng/sửa được).</summary>
    public static List<FlashSlot> FlashSlots(IEnumerable<Promotion> promotions, DateTime now)
    {
        var slots = new List<FlashSlot>();
        foreach (var p in promotions)
        {
            if (p.Type != PromotionType.FlashSale || p.DailyStart is null || p.DailyEnd is null) continue;
            if (!PricingService.Channels(p).Contains(SalesChannel.Online)) continue;
            var status = PricingService.EffectiveStatus(p, now);
            if (status is PromotionStatus.Paused or PromotionStatus.Ended) continue;

            var start = now.Date + TimeOf(p.DailyStart);
            var end = now.Date + TimeOf(p.DailyEnd);
            // Chương trình chưa chạy trong hôm nay.
            if (p.StartsAt >= end) continue;

            SlotState state;
            DateTime? next = null;
            if (PricingService.IsLive(p, now, SalesChannel.Online)) state = SlotState.Live;
            else if (now < start || now < p.StartsAt)
            {
                state = SlotState.Upcoming;
                next = p.StartsAt > start ? p.StartsAt : start;
            }
            else
            {
                state = SlotState.Ended;
                var tomorrow = start.AddDays(1);
                next = tomorrow <= p.EndsAt ? tomorrow : null;
            }
            slots.Add(new FlashSlot(p, start, end, state, next));
        }
        return slots.OrderBy(s => s.Start).ToList();
    }

    /// <summary>Khung giờ để giới thiệu: đang chạy, nếu không thì khung mở sớm nhất.</summary>
    public static FlashSlot? Featured(IReadOnlyList<FlashSlot> slots) =>
        slots.FirstOrDefault(s => s.State == SlotState.Live)
        ?? slots.Where(s => s.NextStart is not null).OrderBy(s => s.NextStart).FirstOrDefault();

    /// <summary>Sản phẩm đang bán mà khuyến mãi áp dụng, theo đúng thứ tự trong khuyến mãi rồi tới ngành hàng.</summary>
    public static List<Product> PromotionProducts(Promotion promotion, IReadOnlyList<Product> activeProducts)
    {
        var productIds = PricingService.Split(promotion.ProductIds);
        var categoryIds = PricingService.Split(promotion.CategoryIds);
        if (productIds.Length == 0 && categoryIds.Length == 0) return activeProducts.ToList();
        var byId = activeProducts.ToDictionary(p => p.Id);
        var listed = productIds.Select(id => byId.GetValueOrDefault(id)).OfType<Product>().ToList();
        var listedIds = listed.Select(p => p.Id).ToHashSet();
        var inCategories = categoryIds.Length == 0
            ? []
            : activeProducts.Where(p => categoryIds.Contains(p.CategoryId) && !listedIds.Contains(p.Id));
        return [.. listed, .. inCategories];
    }

    /// <summary>Hàng đang giảm giá theo giá niêm yết (giá gạch ngang cao hơn giá bán).</summary>
    public static IEnumerable<Product> Discounted(IEnumerable<Product> products) =>
        products.Where(p => p.IsActive && p.CompareAtPrice is int c && c > p.Price);

    // ------------------------------------------------------------------ voucher (lib/vouchers.ts)

    /// <summary>
    /// Voucher đáng hiện trên một kênh: đang chạy hoặc sắp chạy, không tạm dừng, chưa hết hạn, chưa
    /// hết lượt. Voucher riêng (đổi từ sao vàng) chỉ hiện với chủ của nó.
    /// </summary>
    public static List<Promotion> ListVouchers(IEnumerable<Promotion> promotions, DateTime now, SalesChannel channel, string? customerId) =>
        promotions.Where(p =>
        {
            if (string.IsNullOrEmpty(p.Code) || p.Type is not (PromotionType.Percent or PromotionType.Fixed)) return false;
            if (p.OwnerId is not null && p.OwnerId != customerId) return false;
            if (!PricingService.Channels(p).Contains(channel)) return false;
            if (p.UsageLimit is int limit && p.UsageCount >= limit) return false;
            var status = PricingService.EffectiveStatus(p, now);
            return status is PromotionStatus.Active or PromotionStatus.Scheduled;
        }).ToList();

    /// <summary>Số lớn trên cuống vé: "20K" hoặc "10%" (kèm "tối đa 30K").</summary>
    public static (string Value, string? Cap) Stub(Promotion p) =>
        p.Type == PromotionType.Percent
            ? ($"{p.Value}%", p.MaxDiscount is int max && max > 0 ? $"tối đa {Fmt.CompactUpper(max)}" : null)
            : (Fmt.CompactUpper(p.Value), null);

    /// <summary>"Giảm 20.000 ₫" / "Giảm 10%, tối đa 30.000 ₫".</summary>
    public static string ValueText(Promotion p) =>
        p.Type == PromotionType.Percent
            ? $"Giảm {p.Value}%" + (p.MaxDiscount is int max && max > 0 ? $", tối đa {Fmt.Vnd(max)}" : "")
            : $"Giảm {Fmt.Vnd(p.Value)}";

    /// <summary>Điều kiện của voucher theo thứ tự khách hay kiểm.</summary>
    public static List<string> Conditions(Promotion p, IReadOnlyList<Category> categories)
    {
        var list = new List<string> { p.MinOrderValue is int min && min > 0 ? $"Đơn tối thiểu {Fmt.Vnd(min)}" : "Không yêu cầu đơn tối thiểu" };

        var productIds = PricingService.Split(p.ProductIds);
        var categoryNames = PricingService.Split(p.CategoryIds)
            .Select(id => categories.FirstOrDefault(c => c.Id == id)?.Name)
            .OfType<string>();
        var scope = new List<string>();
        if (productIds.Length > 0) scope.Add($"{Fmt.Num(productIds.Length)} sản phẩm chọn lọc");
        scope.AddRange(categoryNames);
        list.Add(scope.Count > 0 ? $"Áp dụng cho {string.Join(", ", scope)}" : "Áp dụng cho mọi sản phẩm");

        var tiers = PricingService.Tiers(p);
        list.Add(p.OwnerId is not null
            ? "Voucher riêng của bạn, đổi từ sao vàng"
            : tiers.Length > 0 ? $"Dành cho hạng {string.Join(", ", tiers.Select(TierStyle.Label))}" : "Dành cho mọi khách hàng");

        var channels = PricingService.Channels(p);
        if (!channels.Contains(SalesChannel.InStore)) list.Add("Chỉ dùng khi đặt online");
        else if (!channels.Contains(SalesChannel.Online)) list.Add("Chỉ dùng khi mua tại cửa hàng");
        else list.Add("Dùng khi đặt online và mua tại cửa hàng");

        if (p.UsageLimit is int limit) list.Add($"Còn {Fmt.Num(Math.Max(0, limit - p.UsageCount))} lượt");
        return list;
    }

    /// <summary>Hạn dùng: "HSD 01/11/2026 · còn 45 ngày", "Hết hạn hôm nay lúc 23:59" hoặc "Bắt đầu từ …".</summary>
    public static (string Text, bool Urgent) Expiry(Promotion p, DateTime now)
    {
        if (PricingService.EffectiveStatus(p, now) == PromotionStatus.Scheduled)
            return ($"Bắt đầu từ {Fmt.Date(p.StartsAt)}, HSD {Fmt.Date(p.EndsAt)}", false);
        if (p.EndsAt.Date == now.Date) return ($"Hết hạn hôm nay lúc {Fmt.Time(p.EndsAt)}", true);
        var daysLeft = (int)Math.Ceiling((p.EndsAt - now).TotalDays);
        return ($"HSD {Fmt.Date(p.EndsAt)} · còn {daysLeft} ngày", daysLeft <= 3);
    }

    /// <summary>
    /// Voucher online kiểm với giỏ hàng: dùng được (tiết kiệm nhiều nhất trước), thiếu đơn tối thiểu
    /// (gần đủ nhất trước), lý do khác, rồi voucher chưa tới ngày.
    /// </summary>
    public static List<VoucherOption> Options(
        IEnumerable<Promotion> promotions, DateTime now, Customer? customer, PricingResult pricing, Func<string, PricingResult> priceWithCode)
    {
        // Đơn tối thiểu tính trên giỏ sau giảm theo món và voucher hạng, giống PricingService.
        var baseAmount = pricing.Subtotal - pricing.Discounts.Where(d => d.Kind != DiscountKind.Code).Sum(d => d.Amount);

        var options = ListVouchers(promotions, now, SalesChannel.Online, customer?.Id).Select(promo =>
        {
            var tiers = PricingService.Tiers(promo);
            if (PricingService.EffectiveStatus(promo, now) == PromotionStatus.Scheduled)
                return new VoucherOption(promo, 0, $"Chưa đến ngày dùng, bắt đầu từ {Fmt.Date(promo.StartsAt)}", null);
            if (tiers.Length > 0 && customer is null)
                return new VoucherOption(promo, 0, "Đăng nhập để dùng voucher dành cho thành viên", null);
            if (tiers.Length > 0 && customer is not null && !tiers.Contains(customer.Tier))
                return new VoucherOption(promo, 0, $"Hạng {TierStyle.Label(customer.Tier)} của bạn chưa dùng được voucher này", null);
            if (promo.MinOrderValue is int min && min > 0 && baseAmount < min)
                return new VoucherOption(promo, 0, $"Mua thêm {Fmt.Vnd(min - baseAmount)} để dùng voucher này", Math.Max(0, baseAmount) / (double)min);
            var result = priceWithCode(promo.Code!);
            if (result.CodeError is string error) return new VoucherOption(promo, 0, error, null);
            return new VoucherOption(promo, result.Discounts.FirstOrDefault(d => d.Kind == DiscountKind.Code)?.Amount ?? 0, null, null);
        }).ToList();

        int Rank(VoucherOption o) => o.Reason is null ? 0 : o.Progress is not null ? 1 : PricingService.EffectiveStatus(o.Promo, now) == PromotionStatus.Scheduled ? 3 : 2;
        return options
            .Select((o, i) => (o, i))
            .OrderBy(x => Rank(x.o)).ThenByDescending(x => x.o.Saving).ThenByDescending(x => x.o.Progress ?? 0).ThenBy(x => x.i)
            .Select(x => x.o)
            .ToList();
    }
}
