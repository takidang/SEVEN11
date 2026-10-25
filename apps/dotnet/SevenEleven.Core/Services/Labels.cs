using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>Nhãn tiếng Việt cho các trạng thái, giống lib/order-status.ts. Dùng chung cho web và nghiệp vụ.</summary>
public static class Labels
{
    public static string Status(OrderStatus s) => s switch
    {
        OrderStatus.Pending => "Chờ xác nhận",
        OrderStatus.Confirmed => "Đã xác nhận",
        OrderStatus.Preparing => "Đang chuẩn bị",
        OrderStatus.Delivering => "Đang giao",
        OrderStatus.Completed => "Hoàn thành",
        OrderStatus.Cancelled => "Đã huỷ",
        _ => s.ToString(),
    };

    public static string Payment(PaymentMethod p) => p switch
    {
        PaymentMethod.Cash => "Tiền mặt",
        PaymentMethod.Card => "Thẻ ngân hàng",
        PaymentMethod.Ewallet => "Ví điện tử",
        PaymentMethod.BankTransfer => "Chuyển khoản QR",
        PaymentMethod.Cod => "Thanh toán khi nhận hàng",
        _ => p.ToString(),
    };

    public static string PaymentState(PaymentStatus p) => p switch
    {
        PaymentStatus.Unpaid => "Chưa thanh toán",
        PaymentStatus.Paid => "Đã thanh toán",
        PaymentStatus.Refunded => "Đã hoàn tiền",
        _ => p.ToString(),
    };

    /// <summary>
    /// Tên phần giảm trên cả đơn (sau giảm theo từng món): ưu đãi đồ uống của thành viên và/hoặc mã
    /// giảm giá. Đơn không lưu tách hai khoản nên gọi theo những gì đơn có.
    /// </summary>
    public static string OrderDiscount(Order o) => (o.CustomerId, o.PromotionCode) switch
    {
        (not null, string code) => $"Ưu đãi thành viên & mã {code}",
        (null, string code) => $"Mã {code}",
        _ => "Ưu đãi thành viên",
    };

    public static string Channel(SalesChannel c) => c == SalesChannel.Online ? "Online" : "Tại quầy";

    public static string Role(StaffRole r) => r switch
    {
        StaffRole.Admin => "Quản trị chuỗi",
        StaffRole.Manager => "Quản lý cửa hàng",
        _ => "Thu ngân",
    };

    public static string Purchase(PurchaseOrderStatus s) => s switch
    {
        PurchaseOrderStatus.Draft => "Nháp",
        PurchaseOrderStatus.Ordered => "Đã đặt hàng",
        PurchaseOrderStatus.PartiallyReceived => "Đang nhận hàng",
        PurchaseOrderStatus.Received => "Đã nhập kho",
        PurchaseOrderStatus.Closed => "Đã kết thúc",
        PurchaseOrderStatus.Cancelled => "Đã huỷ",
        _ => s.ToString(),
    };

    public static string Store(StoreStatus s) => s switch
    {
        StoreStatus.Active => "Đang hoạt động",
        StoreStatus.Maintenance => "Bảo trì",
        _ => "Đã đóng",
    };

    /// <summary>Tông màu của nhãn trạng thái (lớp CSS), theo bảng màu trong design-system.md.</summary>
    public static string Tone(OrderStatus s) => s switch
    {
        OrderStatus.Pending => "warning",
        OrderStatus.Confirmed => "info",
        OrderStatus.Preparing => "orange",
        OrderStatus.Delivering => "info",
        OrderStatus.Completed => "fresh",
        _ => "danger",
    };

    public static string Tone(PurchaseOrderStatus s) => s switch
    {
        PurchaseOrderStatus.Draft => "neutral",
        PurchaseOrderStatus.Ordered => "info",
        PurchaseOrderStatus.PartiallyReceived => "orange",
        PurchaseOrderStatus.Received => "fresh",
        PurchaseOrderStatus.Closed => "neutral",
        _ => "danger",
    };

    public static string Tone(PaymentStatus s) => s switch
    {
        PaymentStatus.Unpaid => "warning",
        PaymentStatus.Paid => "fresh",
        _ => "neutral",
    };
}
