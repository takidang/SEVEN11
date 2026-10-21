using System.Runtime.InteropServices;

namespace SevenEleven.Core.Services.Pricing;

// Các struct dưới đây khớp từng byte với native/sevenpricing/sevenpricing.h để gọi qua P/Invoke.

/// <summary>Một dòng hàng đưa vào lõi tính tiền, khuyến mãi đã được chọn sẵn.</summary>
[StructLayout(LayoutKind.Sequential)]
public struct CoreLine
{
    public int UnitPrice;
    public int Quantity;
    /// <summary>0 là không có flash sale.</summary>
    public int FlashPercent;
    /// <summary>0 là không có mua X tặng Y.</summary>
    public int BuyQuantity;
    public int GetQuantity;
    public int IsDrink;
    public int IsAlcohol;
    public int CodeEligible;
}

public enum CodeType { None = 0, Percent = 1, Fixed = 2 }

[StructLayout(LayoutKind.Sequential)]
public struct CoreOptions
{
    public int MemberVoucher;
    public int MaxCups;
    public CodeType CodeType;
    public int CodeValue;
    /// <summary>0 là không giới hạn.</summary>
    public int CodeMaxDiscount;
    public int Delivery;
    public int ShippingFee;
    public int FreeShippingFrom;
}

[StructLayout(LayoutKind.Sequential)]
public struct CoreLineResult
{
    public int SalePrice;
    public int FreeUnits;
    public long LineSubtotal;
    public long LineDiscount;
    public long LineTotal;
}

[StructLayout(LayoutKind.Sequential)]
public struct CoreResult
{
    public long Subtotal;
    public long LineDiscounts;
    public long MemberDiscount;
    public long CodeEligibleTotal;
    public long CodeDiscount;
    public long DiscountTotal;
    public int ItemCount;
    public int ShippingFee;
    public int FreeShipping;
    public long Total;
    public long EligibleSpend;
}

/// <summary>Phần tính tiền của bộ tính giá. Có hai bản cho cùng một phép tính: C++ và C#.</summary>
public interface IPricingCore
{
    /// <summary>Tên hiển thị, ví dụ "C++ (sevenpricing 1.0.0)".</summary>
    string Name { get; }

    int FlashPrice(int price, int percent);

    CoreResult Compute(ReadOnlySpan<CoreLine> lines, in CoreOptions options, Span<CoreLineResult> results);
}

/// <summary>Bản C#, dùng khi máy không có thư viện C++ (và để đối chiếu trong kiểm thử).</summary>
public sealed class ManagedPricingCore : IPricingCore
{
    public static readonly ManagedPricingCore Instance = new();

    public string Name => "C# (dự phòng)";

    /// <summary>Làm tròn "nửa lên" như Math.round của JavaScript, để khớp bản Next.js từng đồng.</summary>
    public static long RoundHalfUp(double value) => (long)Math.Floor(value + 0.5);

    public int FlashPrice(int price, int percent)
    {
        var off = Math.Max(1_000L, RoundHalfUp(price * (double)percent / 100.0 / 1_000.0) * 1_000);
        return (int)Math.Max(0, price - off);
    }

    public CoreResult Compute(ReadOnlySpan<CoreLine> lines, in CoreOptions options, Span<CoreLineResult> results)
    {
        var r = new CoreResult();
        long afterLines = 0;
        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (line.Quantity <= 0 || line.UnitPrice < 0) throw new ArgumentException("Dòng hàng không hợp lệ");
            var lr = new CoreLineResult
            {
                SalePrice = line.FlashPercent > 0 ? FlashPrice(line.UnitPrice, line.FlashPercent) : line.UnitPrice,
            };
            lr.LineSubtotal = (long)line.UnitPrice * line.Quantity;
            lr.LineDiscount = (long)(line.UnitPrice - lr.SalePrice) * line.Quantity;
            if (line.BuyQuantity > 0 && line.GetQuantity > 0)
            {
                lr.FreeUnits = line.Quantity / (line.BuyQuantity + line.GetQuantity) * line.GetQuantity;
                lr.LineDiscount += (long)lr.FreeUnits * lr.SalePrice;
            }
            lr.LineTotal = lr.LineSubtotal - lr.LineDiscount;
            results[i] = lr;
            r.Subtotal += lr.LineSubtotal;
            r.LineDiscounts += lr.LineDiscount;
            afterLines += lr.LineTotal;
            r.ItemCount += line.Quantity;
        }

        if (options.MemberVoucher > 0 && options.MaxCups > 0)
        {
            var drinks = new List<int>();
            for (var i = 0; i < lines.Length; i++)
                if (lines[i].IsDrink != 0) drinks.Add(i);
            var sale = new int[lines.Length];
            for (var i = 0; i < lines.Length; i++) sale[i] = results[i].SalePrice;
            var cups = options.MaxCups;
            // Sắp xếp ổn định: giá bằng nhau thì giữ thứ tự trong giỏ.
            foreach (var i in drinks.OrderByDescending(i => sale[i]))
            {
                if (cups <= 0) break;
                var use = Math.Min(cups, lines[i].Quantity);
                r.MemberDiscount += (long)Math.Min(options.MemberVoucher, sale[i]) * use;
                cups -= use;
            }
        }

        var baseAmount = afterLines - r.MemberDiscount;
        if (options.CodeType != CodeType.None)
        {
            for (var i = 0; i < lines.Length; i++)
                if (lines[i].CodeEligible != 0) r.CodeEligibleTotal += results[i].LineTotal;
            if (r.CodeEligibleTotal > 0)
            {
                long discount;
                if (options.CodeType == CodeType.Percent)
                {
                    discount = RoundHalfUp(r.CodeEligibleTotal * (double)options.CodeValue / 100.0);
                    if (options.CodeMaxDiscount > 0) discount = Math.Min(discount, options.CodeMaxDiscount);
                }
                else
                {
                    discount = Math.Min(options.CodeValue, r.CodeEligibleTotal);
                }
                r.CodeDiscount = Math.Min(discount, Math.Max(0, baseAmount));
            }
        }

        r.DiscountTotal = r.LineDiscounts + r.MemberDiscount + r.CodeDiscount;
        var payable = Math.Max(0, r.Subtotal - r.DiscountTotal);
        r.FreeShipping = options.Delivery != 0 && payable >= options.FreeShippingFrom ? 1 : 0;
        r.ShippingFee = options.Delivery != 0 && r.ItemCount > 0 && r.FreeShipping == 0 ? options.ShippingFee : 0;
        r.Total = payable + r.ShippingFee;

        long eligible = 0;
        for (var i = 0; i < lines.Length; i++)
            if (lines[i].IsAlcohol == 0) eligible += results[i].LineTotal;
        r.EligibleSpend = Math.Max(0, eligible - r.MemberDiscount - r.CodeDiscount);
        return r;
    }
}

/// <summary>Bản C++: gọi thư viện native/sevenpricing qua P/Invoke.</summary>
public sealed partial class NativePricingCore : IPricingCore
{
    private const string Library = "sevenpricing";

    [DllImport(Library, EntryPoint = "se_version")]
    private static extern IntPtr NativeVersion();

    [DllImport(Library, EntryPoint = "se_flash_price")]
    private static extern int NativeFlashPrice(int price, int percent);

    [DllImport(Library, EntryPoint = "se_price_cart")]
    private static extern unsafe int NativePriceCart(CoreLine* lines, int count, CoreOptions* options, CoreLineResult* lineResults, CoreResult* result);

    [DllImport(Library, EntryPoint = "se_earn_stars")]
    private static extern void NativeEarnStars(int carry, long spend, int starSpend, out int stars, out int newCarry);

    [DllImport(Library, EntryPoint = "se_distance_km")]
    private static extern double NativeDistanceKm(double lat1, double lng1, double lat2, double lng2);

    private NativePricingCore(string version) => Version = version;

    public string Version { get; }

    public string Name => $"C++ (sevenpricing {Version})";

    /// <summary>Nạp thư viện C++; trả về null khi máy này chưa có (khi đó dùng bản C#).</summary>
    public static NativePricingCore? TryLoad()
    {
        try
        {
            var version = Marshal.PtrToStringAnsi(NativeVersion()) ?? "?";
            return new NativePricingCore(version);
        }
        catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException)
        {
            return null;
        }
    }

    public int FlashPrice(int price, int percent) => NativeFlashPrice(price, percent);

    public unsafe CoreResult Compute(ReadOnlySpan<CoreLine> lines, in CoreOptions options, Span<CoreLineResult> results)
    {
        if (results.Length < lines.Length) throw new ArgumentException("Thiếu chỗ cho kết quả từng dòng");
        CoreResult result;
        var opts = options;
        fixed (CoreLine* l = lines)
        fixed (CoreLineResult* lr = results)
        {
            var code = NativePriceCart(l, lines.Length, &opts, lr, &result);
            if (code != 0) throw new ArgumentException($"Lõi C++ từ chối đầu vào (mã {code})");
        }
        return result;
    }

    public (int Stars, int Carry) EarnStars(int carry, long spend, int starSpend)
    {
        NativeEarnStars(carry, spend, starSpend, out var stars, out var newCarry);
        return (stars, newCarry);
    }

    public double DistanceKm(double lat1, double lng1, double lat2, double lng2) => NativeDistanceKm(lat1, lng1, lat2, lng2);
}

/// <summary>
/// Chọn lõi tính tiền khi khởi động: có thư viện C++ thì dùng C++, không có thì dùng C#. Đặt
/// biến môi trường SEVENELEVEN_PRICING=managed để ép dùng bản C#.
/// </summary>
public static class PricingEngine
{
    private static readonly Lazy<NativePricingCore?> NativeCore = new(NativePricingCore.TryLoad);

    public static NativePricingCore? Native => NativeCore.Value;

    public static IPricingCore Current { get; set; } =
        Environment.GetEnvironmentVariable("SEVENELEVEN_PRICING") == "managed"
            ? ManagedPricingCore.Instance
            : (IPricingCore?)NativePricingCore.TryLoad() ?? ManagedPricingCore.Instance;
}
