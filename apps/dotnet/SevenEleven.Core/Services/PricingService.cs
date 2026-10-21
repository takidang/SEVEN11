using SevenEleven.Core.Models;
using SevenEleven.Core.Services.Pricing;

namespace SevenEleven.Core.Services;

/// <summary>Một dòng trong giỏ: sản phẩm nào, bao nhiêu cái.</summary>
public record CartLine(string ProductId, int Quantity);

public class PricedLine
{
    public Product Product { get; init; } = null!;
    public int Quantity { get; init; }
    /// <summary>Giá niêm yết một đơn vị.</summary>
    public int UnitPrice { get; init; }
    /// <summary>Giá một đơn vị sau flash sale (bằng UnitPrice nếu không có).</summary>
    public int SalePrice { get; init; }
    public int LineSubtotal { get; init; }
    /// <summary>Phần giảm của dòng: flash sale cộng mua X tặng Y.</summary>
    public int LineDiscount { get; set; }
    public int LineTotal => LineSubtotal - LineDiscount;
    /// <summary>Nhãn ngắn, ví dụ "Flash sale -15%" hoặc "Mua 3 tặng 1".</summary>
    public string? PromoLabel { get; set; }
}

public enum DiscountKind { FlashSale, BuyXGetY, Member, Code }

public record AppliedDiscount(DiscountKind Kind, string PromotionId, string Label, int Amount);

public class PricingResult
{
    public List<PricedLine> Lines { get; init; } = [];
    public int ItemCount { get; init; }
    public int Subtotal { get; init; }
    public List<AppliedDiscount> Discounts { get; init; } = [];
    public int DiscountTotal { get; init; }
    public int ShippingFee { get; init; }
    public bool FreeShipping { get; init; }
    public int Total { get; init; }
    public Promotion? AppliedCode { get; init; }
    /// <summary>Lý do mã bị từ chối, viết sẵn cho khách đọc.</summary>
    public string? CodeError { get; init; }
    /// <summary>Phần chi tiêu tính hạng và sao: sau mọi giảm giá, không tính đồ uống có cồn.</summary>
    public int EligibleSpend { get; init; }
}

/// <summary>
/// Bộ máy tính giá duy nhất, chuyển 1-1 từ lib/pricing.ts. Giỏ hàng, máy bán tại quầy và dữ liệu mẫu
/// đều đi qua đây nên tổng tiền không bao giờ lệch nhau giữa các màn hình. Thứ tự áp dụng:
/// flash sale → mua X tặng Y → voucher đồ uống theo hạng → mã giảm giá → phí giao.
/// </summary>
public static class PricingService
{
    // ---------------------------------------------------------------- trạng thái khuyến mãi

    /// <summary>Trạng thái suy ra từ ngày; "tạm dừng" là trạng thái duy nhất bật tay.</summary>
    public static PromotionStatus EffectiveStatus(Promotion p, DateTime now)
    {
        if (p.Status == PromotionStatus.Paused) return PromotionStatus.Paused;
        if (now < p.StartsAt) return PromotionStatus.Scheduled;
        if (now > p.EndsAt) return PromotionStatus.Ended;
        return PromotionStatus.Active;
    }

    private static int MinutesOf(string hhmm)
    {
        var parts = hhmm.Split(':');
        return int.Parse(parts[0]) * 60 + int.Parse(parts[1]);
    }

    /// <summary>Khuyến mãi có đang chạy trên kênh này, đúng khung giờ trong ngày, còn lượt dùng không.</summary>
    public static bool IsLive(Promotion p, DateTime now, SalesChannel? channel = null)
    {
        if (EffectiveStatus(p, now) != PromotionStatus.Active) return false;
        if (channel is SalesChannel c && !Channels(p).Contains(c)) return false;
        if (p.DailyStart is not null && p.DailyEnd is not null)
        {
            var m = now.Hour * 60 + now.Minute;
            if (m < MinutesOf(p.DailyStart) || m >= MinutesOf(p.DailyEnd)) return false;
        }
        if (p.UsageLimit is int limit && p.UsageCount >= limit) return false;
        return true;
    }

    // Danh sách lưu thành chuỗi phân cách bằng dấu phẩy trong cơ sở dữ liệu.
    public static string[] Split(string value) =>
        string.IsNullOrWhiteSpace(value) ? [] : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    public static SalesChannel[] Channels(Promotion p) =>
        Split(p.Channels).Select(c => c == "online" ? SalesChannel.Online : SalesChannel.InStore).ToArray();

    public static MemberTier[] Tiers(Promotion p) =>
        Split(p.Tiers).Select(t => Enum.Parse<MemberTier>(t, ignoreCase: true)).ToArray();

    public static bool AppliesTo(Promotion p, Product product)
    {
        var productIds = Split(p.ProductIds);
        var categoryIds = Split(p.CategoryIds);
        if (productIds.Length == 0 && categoryIds.Length == 0) return true;
        return productIds.Contains(product.Id) || categoryIds.Contains(product.CategoryId);
    }

    /// <summary>Giá flash sale một đơn vị, làm tròn tới 1.000 ₫ (tính trong lõi C++ nếu có).</summary>
    public static int FlashPrice(int price, int percent) => PricingEngine.Current.FlashPrice(price, percent);

    /// <summary>Flash sale đang chạy và giảm sâu nhất cho sản phẩm này.</summary>
    public static Promotion? FlashSaleFor(Product product, IEnumerable<Promotion> promotions, DateTime now, SalesChannel? channel) =>
        promotions
            .Where(p => p.Type == PromotionType.FlashSale && AppliesTo(p, product) && IsLive(p, now, channel))
            .MaxBy(p => p.Value);

    // ---------------------------------------------------------------- tính giỏ hàng

    /// <summary>
    /// Tính giá cả giỏ. Phần C# quyết định khuyến mãi nào áp cho dòng nào (ngày giờ, kênh, hạng, phạm vi,
    /// điều kiện mã); phần tính tiền chạy trong lõi C++ (native/sevenpricing) qua PricingEngine, máy
    /// không có thư viện thì chạy bản C# giống hệt.
    /// </summary>
    public static PricingResult PriceCart(
        IEnumerable<CartLine> cart,
        IReadOnlyDictionary<string, Product> products,
        IReadOnlyCollection<Promotion> promotions,
        SalesChannel channel,
        Customer? customer,
        string? code,
        bool delivery,
        DateTime now)
    {
        var core = PricingEngine.Current;

        // 1. Chọn khuyến mãi cho từng dòng: flash sale sâu nhất, mua X tặng Y đầu tiên đang chạy.
        var items = new List<(Product Product, int Quantity, Promotion? Flash, Promotion? BuyGet)>();
        foreach (var item in cart)
        {
            if (item.Quantity <= 0 || !products.TryGetValue(item.ProductId, out var product)) continue;
            var flash = FlashSaleFor(product, promotions, now, channel);
            var buyGet = promotions.FirstOrDefault(p =>
                p.Type == PromotionType.BuyXGetY && p.BuyQuantity > 0 && p.GetQuantity > 0 &&
                AppliesTo(p, product) && IsLive(p, now, channel));
            items.Add((product, item.Quantity, flash, buyGet));
        }

        // 2. Voucher đồ uống theo hạng: chỉ khi có chương trình đang chạy cho hạng của khách.
        var memberPromo = customer is null ? null : promotions.FirstOrDefault(p =>
            p.Type == PromotionType.MemberVoucher && IsLive(p, now, channel) && Tiers(p).Contains(customer.Tier));
        var tier = customer is null ? null : MembershipService.Info(customer.Tier);

        var lines = new CoreLine[items.Count];
        for (var i = 0; i < items.Count; i++)
        {
            var (product, quantity, flash, buyGet) = items[i];
            lines[i] = new CoreLine
            {
                UnitPrice = product.Price,
                Quantity = quantity,
                FlashPercent = flash?.Value ?? 0,
                BuyQuantity = buyGet?.BuyQuantity ?? 0,
                GetQuantity = buyGet?.GetQuantity ?? 0,
                IsDrink = MembershipService.DrinkCategoryIds.Contains(product.CategoryId) ? 1 : 0,
                IsAlcohol = MembershipService.NonEligibleCategoryIds.Contains(product.CategoryId) ? 1 : 0,
            };
        }
        var options = new CoreOptions
        {
            MemberVoucher = memberPromo is not null && tier is not null ? tier.DrinkVoucher : 0,
            MaxCups = MembershipService.MaxDrinkVouchersPerOrder,
            Delivery = delivery ? 1 : 0,
            ShippingFee = DeliveryService.ShippingFee,
            FreeShippingFrom = DeliveryService.FreeShippingFrom,
        };
        var results = new CoreLineResult[items.Count];
        var priced = core.Compute(lines, options, results);

        // 3. Mã giảm giá: kiểm điều kiện bằng số tiền sau giảm theo món và voucher hạng, rồi tính lại.
        Promotion? appliedCode = null;
        string? codeError = null;
        var typed = code?.Trim().ToUpperInvariant();
        if (!string.IsNullOrEmpty(typed))
        {
            var promo = promotions.FirstOrDefault(p => p.Code?.ToUpperInvariant() == typed);
            var baseAmount = results.Sum(r => r.LineTotal) - priced.MemberDiscount;
            codeError = CodeError(promo, customer, channel, now, baseAmount);
            if (codeError is null && promo is not null)
            {
                for (var i = 0; i < items.Count; i++) lines[i].CodeEligible = AppliesTo(promo, items[i].Product) ? 1 : 0;
                options.CodeType = promo.Type == PromotionType.Percent ? CodeType.Percent : CodeType.Fixed;
                options.CodeValue = promo.Value;
                options.CodeMaxDiscount = promo.Type == PromotionType.Percent ? promo.MaxDiscount ?? 0 : 0;
                priced = core.Compute(lines, options, results);
                if (priced.CodeEligibleTotal <= 0) codeError = "Giỏ hàng không có sản phẩm áp dụng mã này";
                else appliedCode = promo;
            }
            if (appliedCode is null && options.CodeType != CodeType.None)
            {
                options.CodeType = CodeType.None;
                priced = core.Compute(lines, options, results);
            }
        }

        // 4. Ghép kết quả: từng dòng, và danh sách giảm giá gộp theo chương trình để hiện một hàng mỗi chương trình.
        var pricedLines = new List<PricedLine>();
        var discounts = new List<AppliedDiscount>();
        for (var i = 0; i < items.Count; i++)
        {
            var (product, quantity, flash, buyGet) = items[i];
            var r = results[i];
            var line = new PricedLine
            {
                Product = product,
                Quantity = quantity,
                UnitPrice = product.Price,
                SalePrice = r.SalePrice,
                LineSubtotal = (int)r.LineSubtotal,
                LineDiscount = (int)r.LineDiscount,
            };
            if (flash is not null)
            {
                line.PromoLabel = $"Flash sale -{flash.Value}%";
                discounts.Add(new(DiscountKind.FlashSale, flash.Id, flash.Name, (product.Price - r.SalePrice) * quantity));
            }
            if (buyGet is not null && r.FreeUnits > 0)
            {
                line.PromoLabel = $"Mua {buyGet.BuyQuantity} tặng {buyGet.GetQuantity}";
                discounts.Add(new(DiscountKind.BuyXGetY, buyGet.Id, buyGet.Name, r.FreeUnits * r.SalePrice));
            }
            pricedLines.Add(line);
        }
        if (priced.MemberDiscount > 0 && memberPromo is not null && tier is not null)
        {
            discounts.Add(new(DiscountKind.Member, memberPromo.Id,
                $"Ưu đãi thành viên {tier.Label} (-{Money.Format(tier.DrinkVoucher)}/ly)", (int)priced.MemberDiscount));
        }
        if (appliedCode is not null && priced.CodeDiscount > 0)
        {
            discounts.Add(new(DiscountKind.Code, appliedCode.Id, $"Mã {appliedCode.Code}", (int)priced.CodeDiscount));
        }
        var merged = discounts
            .GroupBy(d => (d.Kind, d.PromotionId))
            .Select(g => g.First() with { Amount = g.Sum(d => d.Amount) })
            .Where(d => d.Amount > 0)
            .ToList();

        return new PricingResult
        {
            Lines = pricedLines,
            ItemCount = priced.ItemCount,
            Subtotal = (int)priced.Subtotal,
            Discounts = merged,
            DiscountTotal = (int)priced.DiscountTotal,
            ShippingFee = priced.ShippingFee,
            FreeShipping = priced.FreeShipping != 0,
            Total = (int)priced.Total,
            AppliedCode = appliedCode,
            CodeError = codeError,
            EligibleSpend = (int)priced.EligibleSpend,
        };
    }

    /// <summary>Lý do mã không dùng được, viết sẵn cho khách đọc; null khi mã hợp lệ (trừ điều kiện phạm vi sản phẩm).</summary>
    public static string? CodeError(Promotion? promo, Customer? customer, SalesChannel channel, DateTime now, long baseAmount)
    {
        var status = promo is null ? PromotionStatus.Ended : EffectiveStatus(promo, now);
        return promo switch
        {
            null => "Mã khuyến mãi không tồn tại",
            { OwnerId: not null } when promo.OwnerId != customer?.Id =>
                customer is null ? "Voucher riêng của thành viên, vui lòng đăng nhập" : "Voucher này thuộc tài khoản khác",
            _ when promo.Type is not (PromotionType.Percent or PromotionType.Fixed) => "Mã khuyến mãi không tồn tại",
            _ when status == PromotionStatus.Scheduled => "Mã chưa đến thời gian áp dụng",
            _ when status == PromotionStatus.Ended => "Mã đã hết hạn",
            _ when status == PromotionStatus.Paused => "Mã đang tạm dừng",
            _ when !Channels(promo).Contains(channel) =>
                channel == SalesChannel.Online ? "Mã chỉ dùng khi mua tại cửa hàng" : "Mã chỉ dùng khi đặt online",
            { UsageLimit: int limit } when promo.UsageCount >= limit => "Mã đã hết lượt sử dụng",
            _ when Tiers(promo).Length > 0 && customer is null => "Mã chỉ dành cho thành viên, vui lòng đăng nhập",
            _ when Tiers(promo).Length > 0 && !Tiers(promo).Contains(customer!.Tier) =>
                "Mã chỉ dành cho hạng " + string.Join(", ", Tiers(promo).Select(t => MembershipService.Info(t).Label)),
            { MinOrderValue: int min } when baseAmount < min => $"Đơn tối thiểu {Money.Format(min)} để dùng mã này",
            _ => null,
        };
    }
}
