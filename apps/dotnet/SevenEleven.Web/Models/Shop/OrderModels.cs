using SevenEleven.Core.Models;

namespace SevenEleven.Web.Models.Shop;

/// <summary>Trang theo dõi đơn (order-view.tsx bên Next.js).</summary>
public sealed class OrderPageModel
{
    public required Order Order { get; init; }
    /// <summary>Chủ đơn thấy đủ tên, số điện thoại, địa chỉ; người khác chỉ thấy số đã che.</summary>
    public bool IsOwner { get; init; }
    public bool SignedIn { get; init; }
    public string? FirstName { get; init; }
    public bool JustPlaced { get; init; }
    public DateTime Now { get; init; }
    public bool AgeConfirmed { get; init; }

    public static readonly OrderStatus[] Flow =
        [OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Preparing, OrderStatus.Delivering, OrderStatus.Completed];

    public static (string Title, string Description) Headline(OrderStatus status) => status switch
    {
        OrderStatus.Pending => ("Đang chờ cửa hàng xác nhận", "Cửa hàng sẽ xác nhận đơn của bạn trong ít phút."),
        OrderStatus.Confirmed => ("Cửa hàng đã nhận đơn", "Nhân viên sắp bắt đầu chuẩn bị hàng cho bạn."),
        OrderStatus.Preparing => ("Đang chuẩn bị hàng", "Sản phẩm của bạn đang được lấy và đóng gói cẩn thận."),
        OrderStatus.Delivering => ("Đơn hàng đang được giao", "Shipper đang trên đường tới, bạn để ý điện thoại nhé."),
        _ => ("Giao hàng thành công", "Cảm ơn bạn đã mua sắm tại 7-Eleven."),
    };

    public static string StepIcon(OrderStatus status) => status switch
    {
        OrderStatus.Pending => "clipboard-list",
        OrderStatus.Confirmed => "circle-check",
        OrderStatus.Preparing => "package",
        OrderStatus.Delivering => "bike",
        OrderStatus.Completed => "house",
        _ => "x",
    };

    /// <summary>"0901 *** 567" cho người không phải chủ đơn.</summary>
    public static string MaskPhone(string? phone)
    {
        var d = new string((phone ?? "").Where(char.IsDigit).ToArray());
        return d.Length >= 7 ? $"{d[..4]} *** {d[^3..]}" : "***";
    }

    /// <summary>Bỏ số nhà, tên đường (phần đầu) — chỉ còn phường, tỉnh.</summary>
    public static string MaskAddress(string address)
    {
        var rest = string.Join(", ", address.Split(", ").Skip(1));
        return rest.Length > 0 ? rest : "***";
    }
}
