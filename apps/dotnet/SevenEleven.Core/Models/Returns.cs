namespace SevenEleven.Core.Models;

/// <summary>Hàng khách trả: nhập lại kho để bán tiếp, hoặc xuất huỷ (hỏng, hàng tươi). Số cố định vì lưu trong cơ sở dữ liệu.</summary>
public enum ReturnDisposition { Restock = 0, Discard = 1 }

/// <summary>
/// Phiếu trả hàng của một đơn đã hoàn thành (trong 7 ngày). Một đơn có thể trả nhiều lần, mỗi lần một
/// phiếu; tiền hoàn, sao và chi tiêu xét hạng bị trừ lại ghi trên phiếu để tra lại về sau.
/// </summary>
public class OrderReturn
{
    public string Id { get; set; } = "";
    /// <summary>Mã đọc được, ví dụ "TH00003".</summary>
    public string Code { get; set; } = "";
    public string OrderId { get; set; } = "";
    public Order? Order { get; set; }
    public string StoreId { get; set; } = "";
    public DateTime At { get; set; }
    /// <summary>Tên nhân viên nhận hàng trả.</summary>
    public string By { get; set; } = "";
    public string Reason { get; set; } = "";
    public string? Note { get; set; }
    /// <summary>Tiền hoàn cho khách.</summary>
    public int Refund { get; set; }
    /// <summary>Chi tiêu xét hạng và sao vàng bị trừ lại (đơn của thành viên).</summary>
    public int SpendTaken { get; set; }
    public int StarsTaken { get; set; }

    public List<OrderReturnItem> Items { get; set; } = [];
}

public class OrderReturnItem
{
    public int Id { get; set; }
    public string ReturnId { get; set; } = "";
    public OrderReturn? Return { get; set; }
    public int OrderItemId { get; set; }
    public string ProductId { get; set; } = "";
    public string Name { get; set; } = "";
    public int Quantity { get; set; }
    public int Refund { get; set; }
    public ReturnDisposition Disposition { get; set; }
}
