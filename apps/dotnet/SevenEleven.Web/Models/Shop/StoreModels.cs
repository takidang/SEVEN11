using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Models.Shop;

/// <summary>Trang Hệ thống cửa hàng (store-directory.tsx bên Next.js).</summary>
public sealed class StoreDirectoryModel
{
    public required List<Store> Stores { get; init; }
    /// <summary>Tỉnh đang lọc; null = tất cả.</summary>
    public string? Province { get; init; }
    public string Query { get; init; } = "";
    /// <summary>Cửa hàng đang phục vụ giỏ hàng (tự chọn hoặc gần địa chỉ giao nhất).</summary>
    public Store? Selected { get; init; }
    /// <summary>Toạ độ địa chỉ giao đang chọn, để xếp cửa hàng gần nhất lên trước.</summary>
    public (double Lat, double Lng)? Point { get; init; }

    public List<(string Name, int Count)> Provinces =>
        Stores.GroupBy(s => s.Province).Select(g => (g.Key, g.Count())).OrderByDescending(p => p.Item2).ToList();

    /// <summary>Lọc theo tỉnh và từ khoá (không dấu, mọi từ đều có), gần nhất trước khi biết vị trí.</summary>
    public List<(Store Store, double? Km)> Visible()
    {
        var list = Stores.Where(s => (Province is null || s.Province == Province)
                                     && Text.MatchesAllWords($"{s.Code} {s.Name} {s.Address} {s.Ward} {s.Province}", Query))
            .Select(s => (s, Point is { } p ? (double?)DeliveryService.DistanceKm(p.Lat, p.Lng, s.Lat, s.Lng) : null))
            .ToList();
        return Point is null ? list : list.OrderBy(x => x.Item2).ToList();
    }

    public static string Hours(string openHours) => openHours == "24/7" ? "Mở cửa 24/7" : $"Mở cửa {openHours.Replace("-", "–")}";

    public static string MapsUrl(Store s) =>
        $"https://www.google.com/maps/dir/?api=1&destination={s.Lat.ToString(System.Globalization.CultureInfo.InvariantCulture)},{s.Lng.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
}
