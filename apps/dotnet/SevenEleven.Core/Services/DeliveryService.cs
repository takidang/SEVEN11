using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>
/// Giao hàng, chuyển từ lib/geo.ts và lib/delivery.ts. Nhân viên cửa hàng tự giao nên không có
/// phí trả cho sàn; chi phí nằm trong lương. Chỉ giao trong bán kính 5 km để giữ lời hứa 24 phút.
/// </summary>
public static class DeliveryService
{
    public const int ShippingFee = 15_000;
    /// <summary>Đơn từ mức này được miễn phí giao (đủ bù phí ở biên lợi nhuận ~27%).</summary>
    public const int FreeShippingFrom = 100_000;
    /// <summary>8 phút soạn hàng + 16 phút chạy xe ở tốc độ nội thành ~20 km/h.</summary>
    public const double RadiusKm = 5;
    public const int PromisedMinutes = 24;
    private const int PrepMinutes = 8;
    private const int MinutesPerKm = 4;
    private const double EarthRadiusKm = 6371;

    /// <summary>Khoảng cách đường chim bay giữa hai toạ độ, km (công thức haversine).</summary>
    public static double DistanceKm(double lat1, double lng1, double lat2, double lng2)
    {
        static double Rad(double deg) => deg * Math.PI / 180;
        var dLat = Rad(lat2 - lat1);
        var dLng = Rad(lng2 - lng1);
        var h = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Pow(Math.Sin(dLng / 2), 2);
        return 2 * EarthRadiusKm * Math.Asin(Math.Sqrt(h));
    }

    /// <summary>
    /// Cửa hàng phục vụ: cửa hàng đang hoạt động gần địa chỉ nhất khi có toạ độ; không có toạ độ thì
    /// lấy cửa hàng đầu tiên cùng tỉnh/thành.
    /// </summary>
    public static Store? StoreFor(IEnumerable<Store> stores, string province, double? lat, double? lng)
    {
        var open = stores.Where(s => s.Status == StoreStatus.Active).ToList();
        var sameProvince = open.Where(s => s.Province == province).ToList();
        if (lat is null || lng is null) return sameProvince.FirstOrDefault() ?? open.FirstOrDefault();
        var candidates = sameProvince.Count > 0 ? sameProvince : open;
        return candidates.MinBy(s => DistanceKm(lat.Value, lng.Value, s.Lat, s.Lng));
    }

    /// <summary>Thời gian giao, không bao giờ nhanh hơn lời hứa 24 phút.</summary>
    public static int Minutes(double? distanceKm) =>
        distanceKm is double km ? Math.Max(PromisedMinutes, (int)Math.Round(PrepMinutes + km * MinutesPerKm, MidpointRounding.AwayFromZero)) : PromisedMinutes;

    public static string FormatDistance(double km) =>
        km < 1 ? $"{Math.Round(km * 100, MidpointRounding.AwayFromZero) * 10:0} m" : $"{km:0.#} km".Replace('.', ',');
}
