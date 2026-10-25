namespace SevenEleven.Core.Models;

public enum SupplierStatus { Active, Inactive }

/// <summary>Nhà cung cấp. Tên, mã số thuế và người liên hệ đều là giả lập.</summary>
public class Supplier
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string ContactName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string Address { get; set; } = "";
    public string TaxCode { get; set; } = "";
    /// <summary>Ngành hàng nhà cung cấp này giao, phân cách bằng dấu phẩy.</summary>
    public string CategoryIds { get; set; } = "";
    public SupplierStatus Status { get; set; } = SupplierStatus.Active;
}

/// <summary>
/// Nháp → Đã đặt hàng → (Đang nhận hàng, nếu nhà cung cấp giao nhiều đợt) → Đã nhập kho. Còn thiếu mà nhà
/// cung cấp không giao nữa thì Kết thúc phiếu. Huỷ được khi chưa nhận gì. Số của từng trạng thái cố định vì
/// được lưu trong cơ sở dữ liệu: trạng thái mới luôn thêm vào cuối.
/// </summary>
public enum PurchaseOrderStatus { Draft = 0, Ordered = 1, Received = 2, Cancelled = 3, PartiallyReceived = 4, Closed = 5 }

/// <summary>Phiếu nhập hàng của một cửa hàng từ một nhà cung cấp.</summary>
public class PurchaseOrder
{
    public string Id { get; set; } = "";
    /// <summary>Mã đọc được, ví dụ "PN00047".</summary>
    public string Code { get; set; } = "";
    public string SupplierId { get; set; } = "";
    public Supplier? Supplier { get; set; }
    public string StoreId { get; set; } = "";
    public Store? Store { get; set; }
    public PurchaseOrderStatus Status { get; set; }
    /// <summary>Tổng tiền hàng theo giá nhập.</summary>
    public int Total { get; set; }
    public string? Note { get; set; }
    /// <summary>Nhân viên lập phiếu.</summary>
    public string CreatedBy { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    /// <summary>Ngày nhà cung cấp hẹn giao.</summary>
    public DateTime? ExpectedAt { get; set; }
    /// <summary>Lần nhận hàng gần nhất (đợt cuối, hoặc lúc kết thúc phiếu).</summary>
    public DateTime? ReceivedAt { get; set; }
    /// <summary>Lý do kết thúc phiếu khi còn thiếu hàng, và người kết thúc.</summary>
    public string? ClosedReason { get; set; }
    public string? ClosedBy { get; set; }

    public List<PurchaseOrderItem> Items { get; set; } = [];
}

public class PurchaseOrderItem
{
    public int Id { get; set; }
    public string PurchaseOrderId { get; set; } = "";
    public PurchaseOrder? PurchaseOrder { get; set; }
    public string ProductId { get; set; } = "";
    public Product? Product { get; set; }
    /// <summary>Số lượng đặt.</summary>
    public int Quantity { get; set; }
    /// <summary>Đã nhận qua các đợt, không vượt quá số đặt.</summary>
    public int ReceivedQuantity { get; set; }
    /// <summary>Còn thiếu so với số đặt.</summary>
    public int Remaining => Quantity - ReceivedQuantity;
    /// <summary>Giá nhập một đơn vị.</summary>
    public int CostPrice { get; set; }
    /// <summary>Số lô in trên thùng, có với hàng có hạn dùng.</summary>
    public string? LotCode { get; set; }
}
