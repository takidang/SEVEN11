using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>
/// Các bước của một đơn online, chuyển từ lib/order-status.ts: chờ xác nhận → đã xác nhận →
/// đang chuẩn bị → đang giao → hoàn thành. Đơn tại quầy sinh ra đã hoàn thành.
/// </summary>
public static class OrderFlow
{
    public static readonly OrderStatus[] Online =
        [OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Preparing, OrderStatus.Delivering, OrderStatus.Completed];

    /// <summary>Bước kế tiếp, hoặc null khi đơn đã xong hay đã huỷ.</summary>
    public static OrderStatus? Next(OrderStatus status)
    {
        var i = Array.IndexOf(Online, status);
        return i == -1 || i == Online.Length - 1 ? null : Online[i + 1];
    }

    /// <summary>Chữ trên nút đẩy đơn sang bước kế tiếp.</summary>
    public static string ActionLabel(OrderStatus next) => next switch
    {
        OrderStatus.Confirmed => "Xác nhận đơn",
        OrderStatus.Preparing => "Bắt đầu chuẩn bị",
        OrderStatus.Delivering => "Giao cho shipper",
        OrderStatus.Completed => "Đã giao thành công",
        _ => "Chuyển bước",
    };

    /// <summary>Cửa hàng huỷ được khi hàng chưa rời cửa hàng.</summary>
    public static bool CanCancel(OrderStatus status) =>
        status is OrderStatus.Pending or OrderStatus.Confirmed or OrderStatus.Preparing;

    /// <summary>Khách tự huỷ trên web chỉ khi cửa hàng chưa xác nhận.</summary>
    public static bool CustomerCanCancel(OrderStatus status) => status == OrderStatus.Pending;
}
