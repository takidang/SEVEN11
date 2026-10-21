namespace SevenEleven.Core.Models;

/// <summary>Tồn kho của một mặt hàng tại một cửa hàng.</summary>
public class StockLevel
{
    public int Id { get; set; }
    public string StoreId { get; set; } = "";
    public Store? Store { get; set; }
    public string ProductId { get; set; } = "";
    public Product? Product { get; set; }
    public int Quantity { get; set; }
    /// <summary>Mức tồn tối thiểu: bằng hoặc thấp hơn thì coi là "sắp hết".</summary>
    public int MinQuantity { get; set; }
}

/// <summary>Một lô hàng đã nhập, có hạn sử dụng (hàng tươi, sữa…).</summary>
public class InventoryBatch
{
    public int Id { get; set; }
    public string LotCode { get; set; } = "";
    public string StoreId { get; set; } = "";
    public Store? Store { get; set; }
    public string ProductId { get; set; } = "";
    public Product? Product { get; set; }
    public int Quantity { get; set; }
    public DateTime ReceivedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public enum StockMovementKind
{
    /// <summary>Bán (online hoặc tại quầy).</summary>
    Sale,
    /// <summary>Đơn bị huỷ, hàng về lại kho.</summary>
    CancelReturn,
    /// <summary>Nhận hàng từ phiếu nhập.</summary>
    Receive,
    /// <summary>Điều chỉnh tay có lý do (hỏng, hết hạn, kiểm kê lẻ…).</summary>
    Adjust,
    /// <summary>Cân bằng kho sau một phiên kiểm kê.</summary>
    Stocktake,
    /// <summary>Xuất huỷ một lô.</summary>
    Discard,
}

/// <summary>
/// Nhật ký biến động kho: mỗi lần số tồn thay đổi là một dòng — ai, lúc nào, vì sao, còn lại bao
/// nhiêu. Bản Next.js chưa lưu được lý do điều chỉnh; bản này lưu đủ.
/// </summary>
public class StockMovement
{
    public long Id { get; set; }
    public string StoreId { get; set; } = "";
    public Store? Store { get; set; }
    public string ProductId { get; set; } = "";
    public Product? Product { get; set; }
    public DateTime At { get; set; }
    public int Delta { get; set; }
    /// <summary>Số tồn sau khi thay đổi.</summary>
    public int QuantityAfter { get; set; }
    public StockMovementKind Kind { get; set; }
    /// <summary>Lý do chọn sẵn, ví dụ "Hàng hỏng/vỡ".</summary>
    public string? Reason { get; set; }
    public string? Note { get; set; }
    /// <summary>Mã đơn, mã phiếu nhập hoặc số lô liên quan.</summary>
    public string? Ref { get; set; }
    /// <summary>Tên người thao tác.</summary>
    public string? By { get; set; }
}

/// <summary>Số đếm thực tế của một mặt hàng trong phiên kiểm kê đang dở ở một cửa hàng.</summary>
public class StocktakeCount
{
    public int Id { get; set; }
    public string StoreId { get; set; } = "";
    public string ProductId { get; set; } = "";
    public Product? Product { get; set; }
    public int Counted { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? By { get; set; }
}
