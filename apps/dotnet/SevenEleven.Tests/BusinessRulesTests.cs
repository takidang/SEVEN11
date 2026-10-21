using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>
/// Kiểm chứng luật nghiệp vụ C# cho ra đúng con số như bản TypeScript (lib/pricing.ts,
/// lib/membership.ts, lib/stars.ts, lib/geo.ts). Mỗi ca ghi rõ phép tính để đối chiếu bằng tay.
/// </summary>
public class BusinessRulesTests
{
    // Giờ cố định 12:00 trưa: ngoài cả ba khung flash sale (6–10h, 14–17h, 17–21h).
    private static readonly DateTime Noon = new(2026, 10, 6, 12, 0, 0);

    private static Product Item(string id, string category, int price) =>
        new() { Id = id, Name = id, CategoryId = category, SubcategoryId = category, Price = price, IsActive = true };

    private static Promotion Live(Promotion p)
    {
        p.Channels = string.IsNullOrEmpty(p.Channels) ? "online,in-store" : p.Channels;
        p.StartsAt = Noon.AddDays(-30);
        p.EndsAt = Noon.AddDays(30);
        p.Status = PromotionStatus.Active;
        return p;
    }

    private static readonly Promotion MemberDrink = Live(new Promotion
    {
        Id = "pr-member-drink", Name = "Ưu đãi đồ uống", Type = PromotionType.MemberVoucher,
        CategoryIds = "tra-sua", Tiers = "bronze,silver,gold,diamond",
    });

    private static PricingResult Price(IEnumerable<(Product P, int Qty)> cart, IReadOnlyCollection<Promotion> promos,
        Customer? customer = null, string? code = null, bool delivery = true, DateTime? at = null)
    {
        var list = cart.ToList();
        var products = list.ToDictionary(x => x.P.Id, x => x.P);
        return PricingService.PriceCart(list.Select(x => new CartLine(x.P.Id, x.Qty)), products, promos,
            SalesChannel.Online, customer, code, delivery, at ?? Noon);
    }

    // ---------------------------------------------------------------- tính giá

    [Fact]
    public void Gold_member_gets_6000_off_each_drink_and_pays_shipping_under_100k()
    {
        var gold = new Customer { Id = "c1", Tier = MemberTier.Gold };
        var r = Price([(Item("cafe", "tra-sua", 20_000), 2), (Item("banh", "mon-ngon", 39_000), 1)], [MemberDrink], gold);

        Assert.Equal(79_000, r.Subtotal);          // 2 × 20.000 + 39.000
        Assert.Equal(12_000, r.DiscountTotal);     // 2 ly × 6.000
        Assert.Equal(15_000, r.ShippingFee);       // 67.000 < 100.000 nên tính phí giao
        Assert.Equal(82_000, r.Total);             // 79.000 − 12.000 + 15.000
        Assert.Equal(67_000, r.EligibleSpend);     // tính hạng không gồm phí giao
    }

    [Fact]
    public void Drink_voucher_caps_at_three_cups_per_order()
    {
        var diamond = new Customer { Id = "c1", Tier = MemberTier.Diamond };
        var r = Price([(Item("tra", "tra-sua", 30_000), 5)], [MemberDrink], diamond);
        Assert.Equal(27_000, r.DiscountTotal);     // chỉ 3 ly × 9.000, hai ly còn lại giá gốc
    }

    [Fact]
    public void Free_shipping_from_100k_after_discounts()
    {
        var r = Price([(Item("x", "do-an-vat", 50_000), 2)], []);
        Assert.True(r.FreeShipping);
        Assert.Equal(100_000, r.Total);
    }

    [Fact]
    public void Flash_sale_only_inside_its_daily_window()
    {
        var snack = Item("snack", "do-an-vat", 30_000);
        var afternoon = Live(new Promotion
        {
            Id = "fs", Name = "Ăn xế", Type = PromotionType.FlashSale, Value = 20,
            ProductIds = "snack", DailyStart = "14:00", DailyEnd = "17:00",
        });

        var atNoon = Price([(snack, 1)], [afternoon], delivery: false, at: Noon);
        var at3pm = Price([(snack, 1)], [afternoon], delivery: false, at: Noon.AddHours(3));

        Assert.Equal(30_000, atNoon.Total);        // 12h chưa vào khung
        Assert.Equal(24_000, at3pm.Total);         // 15h: giảm 20% = 6.000
    }

    [Fact]
    public void Buy_three_get_one_free()
    {
        var snack = Item("snack", "do-an-vat", 20_000);
        var promo = Live(new Promotion { Id = "b31", Name = "Mua 3 tặng 1", Type = PromotionType.BuyXGetY, BuyQuantity = 3, GetQuantity = 1, ProductIds = "snack" });
        var r = Price([(snack, 4)], [promo], delivery: false);
        Assert.Equal(60_000, r.Total);             // trả 3 gói, tặng 1
    }

    [Fact]
    public void Code_below_minimum_order_is_rejected_with_a_reason()
    {
        var chaoban = Live(new Promotion { Id = "cb", Code = "CHAOBAN", Name = "Chào bạn", Type = PromotionType.Fixed, Value = 20_000, MinOrderValue = 150_000, Channels = "online" });
        var r = Price([(Item("x", "do-an-vat", 50_000), 1)], [chaoban], code: "chaoban");
        Assert.Null(r.AppliedCode);
        Assert.Contains("Đơn tối thiểu", r.CodeError);
    }

    [Fact]
    public void Percent_code_respects_its_cap()
    {
        var gold = new Customer { Id = "c1", Tier = MemberTier.Gold };
        var giam10 = Live(new Promotion { Id = "g10", Code = "GIAM10", Name = "Giảm 10%", Type = PromotionType.Percent, Value = 10, MaxDiscount = 30_000, MinOrderValue = 150_000, Tiers = "gold,diamond" });
        var r = Price([(Item("x", "do-an-vat", 500_000), 1)], [giam10], gold, "GIAM10");
        Assert.Equal(30_000, r.DiscountTotal);     // 10% của 500.000 là 50.000 nhưng trần 30.000
    }

    [Fact]
    public void Code_for_gold_and_diamond_is_refused_for_bronze()
    {
        var bronze = new Customer { Id = "c1", Tier = MemberTier.Bronze };
        var giam10 = Live(new Promotion { Id = "g10", Code = "GIAM10", Name = "Giảm 10%", Type = PromotionType.Percent, Value = 10, Tiers = "gold,diamond" });
        var r = Price([(Item("x", "do-an-vat", 200_000), 1)], [giam10], bronze, "GIAM10");
        Assert.Equal("Mã chỉ dành cho hạng Vàng, Kim cương", r.CodeError);
    }

    [Fact]
    public void Alcohol_does_not_count_toward_tier_or_stars()
    {
        var r = Price([(Item("bia", "do-uong-co-con", 100_000), 1), (Item("banh", "mon-ngon", 50_000), 1)], [], delivery: false);
        Assert.Equal(50_000, r.EligibleSpend);
    }

    // ---------------------------------------------------------------- hạng và sao

    [Theory]
    [InlineData(0, MemberTier.Bronze)]
    [InlineData(999_999, MemberTier.Bronze)]
    [InlineData(1_000_000, MemberTier.Silver)]
    [InlineData(3_000_000, MemberTier.Gold)]
    [InlineData(5_000_000, MemberTier.Diamond)]
    public void Tier_thresholds(int spend, MemberTier expected) =>
        Assert.Equal(expected, MembershipService.TierForSpend(spend));

    [Fact]
    public void Reaching_a_threshold_upgrades_immediately_and_grants_a_grace_month()
    {
        var c = new Customer { Tier = MemberTier.Silver, TierSpend = 2_950_000 };
        MembershipService.AddTierSpend(c, 60_000, Noon);
        Assert.Equal(MemberTier.Gold, c.Tier);
        Assert.Equal("2026-10", c.GraceMonth);
    }

    [Fact]
    public void Stars_are_one_per_45000_with_the_rest_carried_over()
    {
        var (stars, carry) = StarService.Earn(carry: 22_000, spend: 70_000);
        Assert.Equal(2, stars);                    // 22.000 + 70.000 = 92.000 → 2 sao
        Assert.Equal(2_000, carry);                // dư 2.000 cho lần sau
    }

    // ---------------------------------------------------------------- giao hàng

    [Fact]
    public void Distance_between_saigon_and_hanoi_is_about_1140_km()
    {
        var km = DeliveryService.DistanceKm(10.7725, 106.6980, 21.0287, 105.8524);
        Assert.InRange(km, 1_130, 1_150);
    }

    [Fact]
    public void Nearest_open_store_wins_and_stores_under_maintenance_are_skipped()
    {
        var stores = new[]
        {
            new Store { Id = "near-closed", Province = "TP Hồ Chí Minh", Status = StoreStatus.Maintenance, Lat = 10.80, Lng = 106.65 },
            new Store { Id = "near-open", Province = "TP Hồ Chí Minh", Status = StoreStatus.Active, Lat = 10.79, Lng = 106.68 },
            new Store { Id = "far-open", Province = "TP Hồ Chí Minh", Status = StoreStatus.Active, Lat = 10.73, Lng = 106.70 },
        };
        var store = DeliveryService.StoreFor(stores, "TP Hồ Chí Minh", 10.8014, 106.6527);
        Assert.Equal("near-open", store?.Id);
    }
}
