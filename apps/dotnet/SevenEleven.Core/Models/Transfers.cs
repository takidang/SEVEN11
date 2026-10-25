namespace SevenEleven.Core.Models;

/// <summary>Đang chuyển → Đã nhận; huỷ được khi hàng còn đang trên đường. Số cố định vì lưu trong cơ sở dữ liệu.</summary>
public enum StockTransferStatus { InTransit = 0, Received = 1, Cancelled = 2 }

/// <summary>
/// Phiếu chuyển kho giữa hai cửa hàng. Bên gửi tạo phiếu thì kho bên gửi trừ ngay; bên nhận xác nhận đã
/// nhận thì kho bên nhận mới cộng. Hàng có hạn dùng mang theo lô (mã lô, hạn dùng) sang cửa hàng nhận.
/// </summary>
public class StockTransfer
{
    public string Id { get; set; } = "";
    /// <summary>Mã đọc được, ví dụ "CK00012".</summary>
    public string Code { get; set; } = "";
    public string FromStoreId { get; set; } = "";
    public Store? FromStore { get; set; }
    public string ToStoreId { get; set; } = "";
    public Store? ToStore { get; set; }
    public StockTransferStatus Status { get; set; }
    public string? Note { get; set; }
    /// <summary>Tên người gửi, người nhận, người huỷ (lưu tên lúc thao tác).</summary>
    public string CreatedBy { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public string? ReceivedBy { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public string? CancelledBy { get; set; }
    public DateTime? CancelledAt { get; set; }

    public List<StockTransferItem> Items { get; set; } = [];
}

public class StockTransferItem
{
    public int Id { get; set; }
    public string TransferId { get; set; } = "";
    public StockTransfer? Transfer { get; set; }
    public string ProductId { get; set; } = "";
    public Product? Product { get; set; }
    public int Quantity { get; set; }
    /// <summary>Các lô đã lấy ra ở cửa hàng gửi (chỉ hàng có hạn dùng).</summary>
    public List<StockTransferLot> Lots { get; set; } = [];
}

/// <summary>Một phần của dòng hàng lấy từ một lô: giữ nguyên mã lô và hạn dùng khi sang cửa hàng nhận.</summary>
public class StockTransferLot
{
    public int Id { get; set; }
    public int ItemId { get; set; }
    public StockTransferItem? Item { get; set; }
    public string LotCode { get; set; } = "";
    public DateTime ReceivedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public int Quantity { get; set; }
}
