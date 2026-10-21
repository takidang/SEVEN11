using System.Runtime.InteropServices;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Core.Services.Pricing;

namespace SevenEleven.Tests;

/// <summary>
/// Lõi tính tiền C++ (native/sevenpricing) phải cho ra đúng từng đồng như bản C#. Hai bên được chạy
/// song song trên hàng chục nghìn giỏ hàng ngẫu nhiên; lệch một trường là trượt.
/// </summary>
public class NativePricingTests
{
    private static NativePricingCore Native =>
        PricingEngine.Native ?? throw new InvalidOperationException("Chưa có thư viện sevenpricing — build lại SevenEleven.Core");

    private static bool NativeExpected => RuntimeInformation.IsOSPlatform(OSPlatform.OSX) || RuntimeInformation.IsOSPlatform(OSPlatform.Linux);

    [Fact]
    public void Native_library_is_built_and_used_by_default()
    {
        if (!NativeExpected) return; // Windows: dựng bằng CMake, không bắt buộc
        Assert.NotNull(PricingEngine.Native);
        Assert.StartsWith("C++", PricingEngine.Current.Name);
        Assert.Equal("1.0.0", Native.Version);
    }

    [Theory]
    [InlineData(25_000, 10, 22_000)] // 2.500 làm tròn nửa lên thành 3.000 như Math.round của JavaScript
    [InlineData(15_000, 10, 13_000)]
    [InlineData(20_000, 15, 17_000)]
    [InlineData(3_000, 10, 2_000)]   // giảm tối thiểu 1.000 ₫
    [InlineData(500, 20, 0)]          // không âm
    public void Flash_price_rounds_like_the_nextjs_version(int price, int percent, int expected)
    {
        Assert.Equal(expected, ManagedPricingCore.Instance.FlashPrice(price, percent));
        if (NativeExpected) Assert.Equal(expected, Native.FlashPrice(price, percent));
    }

    [Fact]
    public void Flash_price_matches_for_every_price_and_percent()
    {
        if (!NativeExpected) return;
        for (var price = 0; price <= 600_000; price += 500)
            for (var percent = 1; percent <= 90; percent++)
                Assert.Equal(ManagedPricingCore.Instance.FlashPrice(price, percent), Native.FlashPrice(price, percent));
    }

    [Fact]
    public void Native_and_managed_cores_agree_on_20000_random_carts()
    {
        if (!NativeExpected) return;
        var random = new Random(7_11);
        for (var round = 0; round < 20_000; round++)
        {
            var count = random.Next(0, 9);
            var lines = new CoreLine[count];
            for (var i = 0; i < count; i++)
            {
                var hasBuyGet = random.NextDouble() < 0.25;
                lines[i] = new CoreLine
                {
                    UnitPrice = random.Next(0, 400) * 500,
                    Quantity = random.Next(1, 13),
                    FlashPercent = random.NextDouble() < 0.3 ? random.Next(1, 91) : 0,
                    BuyQuantity = hasBuyGet ? random.Next(1, 6) : 0,
                    GetQuantity = hasBuyGet ? random.Next(1, 4) : 0,
                    IsDrink = random.Next(2),
                    IsAlcohol = random.NextDouble() < 0.15 ? 1 : 0,
                    CodeEligible = random.Next(2),
                };
            }
            var codeType = (CodeType)random.Next(3);
            var options = new CoreOptions
            {
                MemberVoucher = random.NextDouble() < 0.5 ? new[] { 2_000, 3_000, 6_000, 9_000 }[random.Next(4)] : 0,
                MaxCups = 3,
                CodeType = codeType,
                CodeValue = codeType == CodeType.Percent ? random.Next(1, 91) : random.Next(1, 100) * 1_000,
                CodeMaxDiscount = random.NextDouble() < 0.5 ? random.Next(1, 60) * 1_000 : 0,
                Delivery = random.Next(2),
                ShippingFee = 15_000,
                FreeShippingFrom = 100_000,
            };

            var managedLines = new CoreLineResult[count];
            var nativeLines = new CoreLineResult[count];
            var managed = ManagedPricingCore.Instance.Compute(lines, options, managedLines);
            var native = Native.Compute(lines, options, nativeLines);

            Assert.Equal(managed, native);
            Assert.Equal(managedLines, nativeLines);
            // Bất biến: tổng = tạm tính − giảm giá + phí giao, không âm.
            Assert.Equal(Math.Max(0, managed.Subtotal - managed.DiscountTotal) + managed.ShippingFee, managed.Total);
            Assert.True(managed.EligibleSpend >= 0 && managed.CodeDiscount >= 0 && managed.MemberDiscount >= 0);
        }
    }

    [Fact]
    public void Whole_cart_pricing_is_identical_with_either_engine()
    {
        if (!NativeExpected) return;
        var random = new Random(2026);
        var now = new DateTime(2026, 10, 6, 15, 0, 0); // trong khung flash sale ăn xế 14–17h
        var products = Enumerable.Range(1, 40).Select(i => new Product
        {
            Id = $"p{i}", Name = $"Sản phẩm {i}", Price = random.Next(5, 300) * 1_000,
            CategoryId = i % 5 == 0 ? "do-uong-co-con" : i % 3 == 0 ? "tra-sua" : "do-an-vat", IsActive = true,
        }).ToDictionary(p => p.Id);
        Promotion Live(Promotion p)
        {
            p.StartsAt = now.AddDays(-5);
            p.EndsAt = now.AddDays(5);
            p.Status = PromotionStatus.Active;
            p.Channels = "online,in-store";
            return p;
        }
        var promotions = new List<Promotion>
        {
            Live(new Promotion { Id = "fs", Type = PromotionType.FlashSale, Value = 20, DailyStart = "14:00", DailyEnd = "17:00", ProductIds = "p1,p2,p3,p4,p9,p12" }),
            Live(new Promotion { Id = "bxgy", Type = PromotionType.BuyXGetY, BuyQuantity = 3, GetQuantity = 1, ProductIds = "p2,p5,p7" }),
            Live(new Promotion { Id = "mem", Type = PromotionType.MemberVoucher, CategoryIds = "tra-sua", Tiers = "bronze,silver,gold,diamond" }),
            Live(new Promotion { Id = "pc", Code = "GIAM10", Type = PromotionType.Percent, Value = 10, MaxDiscount = 30_000, MinOrderValue = 50_000 }),
            Live(new Promotion { Id = "fx", Code = "BOT20K", Type = PromotionType.Fixed, Value = 20_000, MinOrderValue = 100_000, CategoryIds = "do-an-vat" }),
        };
        string?[] codes = [null, "GIAM10", "BOT20K", "KHONGCO"];
        var original = PricingEngine.Current;
        try
        {
            for (var round = 0; round < 3_000; round++)
            {
                var cart = Enumerable.Range(0, random.Next(1, 7))
                    .Select(_ => new CartLine($"p{random.Next(1, 41)}", random.Next(1, 8)))
                    .GroupBy(l => l.ProductId).Select(g => new CartLine(g.Key, g.Sum(l => l.Quantity))).ToList();
                var customer = random.NextDouble() < 0.6 ? new Customer { Id = "c", Tier = (MemberTier)random.Next(4) } : null;
                var code = codes[random.Next(codes.Length)];
                var channel = random.Next(2) == 0 ? SalesChannel.Online : SalesChannel.InStore;

                PricingEngine.Current = ManagedPricingCore.Instance;
                var a = PricingService.PriceCart(cart, products, promotions, channel, customer, code, channel == SalesChannel.Online, now);
                PricingEngine.Current = Native;
                var b = PricingService.PriceCart(cart, products, promotions, channel, customer, code, channel == SalesChannel.Online, now);

                Assert.Equal((a.Subtotal, a.DiscountTotal, a.ShippingFee, a.Total, a.EligibleSpend, a.CodeError, a.AppliedCode?.Id),
                             (b.Subtotal, b.DiscountTotal, b.ShippingFee, b.Total, b.EligibleSpend, b.CodeError, b.AppliedCode?.Id));
                Assert.Equal(a.Discounts, b.Discounts);
                Assert.Equal(a.Lines.Select(l => (l.Product.Id, l.SalePrice, l.LineDiscount, l.PromoLabel)),
                             b.Lines.Select(l => (l.Product.Id, l.SalePrice, l.LineDiscount, l.PromoLabel)));
            }
        }
        finally
        {
            PricingEngine.Current = original;
        }
    }

    [Fact]
    public void Stars_and_distance_from_cpp_match_the_csharp_rules()
    {
        if (!NativeExpected) return;
        var random = new Random(45);
        for (var i = 0; i < 5_000; i++)
        {
            var carry = random.Next(0, StarService.StarSpend);
            var spend = random.Next(0, 2_000_000);
            Assert.Equal(StarService.Earn(carry, spend), Native.EarnStars(carry, spend, StarService.StarSpend));

            double lat1 = 8 + random.NextDouble() * 16, lng1 = 102 + random.NextDouble() * 8;
            double lat2 = 8 + random.NextDouble() * 16, lng2 = 102 + random.NextDouble() * 8;
            Assert.Equal(DeliveryService.DistanceKm(lat1, lng1, lat2, lng2), Native.DistanceKm(lat1, lng1, lat2, lng2), 9);
        }
    }
}
