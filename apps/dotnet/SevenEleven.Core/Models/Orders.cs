namespace SevenEleven.Core.Models;

public enum SalesChannel { Online, InStore }

public enum OrderStatus { Pending, Confirmed, Preparing, Delivering, Completed, Cancelled }

public enum PaymentMethod { Cash, Card, Ewallet, BankTransfer, Cod }

public enum PaymentStatus { Unpaid, Paid, Refunded }

public class Order
{
    public string Id { get; set; } = "";
    /// <summary>Mã đọc được, ví dụ "DH2609160001".</summary>
    public string Code { get; set; } = "";
    public SalesChannel Channel { get; set; }

    public string StoreId { get; set; } = "";
    public Store? Store { get; set; }
    public string? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    /// <summary>Thu ngân bán tại quầy, hoặc người xác nhận đơn online.</summary>
    public string? EmployeeId { get; set; }

    public int Subtotal { get; set; }
    public int Discount { get; set; }
    public int ShippingFee { get; set; }
    public int Total { get; set; }
    public string? PromotionCode { get; set; }

    /// <summary>Đơn của thành viên: phần chi tiêu đơn này cộng vào hạng và sao.</summary>
    public int? MemberSpend { get; set; }
    /// <summary>Số sao vàng đơn này mang lại.</summary>
    public int? StarsEarned { get; set; }

    public PaymentMethod PaymentMethod { get; set; }
    public PaymentStatus PaymentStatus { get; set; }
    public OrderStatus Status { get; set; }
    public int? CashReceived { get; set; }
    public int? ChangeGiven { get; set; }

    public DeliveryInfo? Delivery { get; set; }
    public List<OrderItem> Items { get; set; } = [];
    public List<OrderEvent> Timeline { get; set; } = [];
    /// <summary>Các lần khách trả hàng sau khi đơn hoàn thành.</summary>
    public List<OrderReturn> Returns { get; set; } = [];

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class OrderItem
{
    public int Id { get; set; }
    public string OrderId { get; set; } = "";
    public Order? Order { get; set; }
    public string ProductId { get; set; } = "";
    public Product? Product { get; set; }
    /// <summary>Tên và giá chép lại lúc bán, để sau này sửa sản phẩm không làm sai đơn cũ.</summary>
    public string Name { get; set; } = "";
    public int UnitPrice { get; set; }
    public int Quantity { get; set; }
    public int Discount { get; set; }
    public int LineTotal { get; set; }
    /// <summary>Nhãn ngắn của khuyến mãi áp cho dòng này, ví dụ "Flash sale -15%".</summary>
    public string? PromoLabel { get; set; }
}

/// <summary>Nhân viên cửa hàng tự giao, nên không có phí trả cho sàn nào cả.</summary>
public class DeliveryInfo
{
    public int Id { get; set; }
    public string OrderId { get; set; } = "";
    public Order? Order { get; set; }
    public string Recipient { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Address { get; set; } = "";
    public string? Note { get; set; }
    /// <summary>Giờ hẹn giao.</summary>
    public DateTime Eta { get; set; }
    /// <summary>Khoảng cách đường chim bay từ cửa hàng tới khách, km.</summary>
    public double? DistanceKm { get; set; }
    public string? ShipperId { get; set; }
    public string? ShipperName { get; set; }
    public string? ShipperPhone { get; set; }
}

public class OrderEvent
{
    public int Id { get; set; }
    public string OrderId { get; set; } = "";
    public Order? Order { get; set; }
    public OrderStatus Status { get; set; }
    public DateTime At { get; set; }
    public string? By { get; set; }
    public string? Note { get; set; }
}
