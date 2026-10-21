namespace SevenEleven.Core.Models;

public enum PromotionType
{
    /// <summary>Giảm theo phần trăm.</summary>
    Percent,
    /// <summary>Giảm một số tiền.</summary>
    Fixed,
    /// <summary>Giá sốc theo khung giờ trong ngày.</summary>
    FlashSale,
    BuyXGetY,
    /// <summary>Voucher đồ uống theo hạng thành viên.</summary>
    MemberVoucher,
}

public enum PromotionStatus { Scheduled, Active, Paused, Ended }

public class Promotion
{
    public string Id { get; set; } = "";
    /// <summary>Mã khách nhập. Flash sale không có mã.</summary>
    public string? Code { get; set; }
    /// <summary>Voucher riêng (đổi từ sao vàng): chỉ khách này dùng được.</summary>
    public string? OwnerId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public PromotionType Type { get; set; }
    /// <summary>Percent: 0–100. Fixed và MemberVoucher: số tiền giảm.</summary>
    public int Value { get; set; }
    public int? MaxDiscount { get; set; }
    public int? MinOrderValue { get; set; }
    public int? BuyQuantity { get; set; }
    public int? GetQuantity { get; set; }

    /// <summary>Danh sách id, để trống nghĩa là áp cho tất cả.</summary>
    public string ProductIds { get; set; } = "";
    public string CategoryIds { get; set; } = "";
    /// <summary>Hạng được dùng; để trống là mọi hạng và cả khách vãng lai.</summary>
    public string Tiers { get; set; } = "";
    public string Channels { get; set; } = "";

    /// <summary>Khung giờ flash sale trong ngày, "HH:mm".</summary>
    public string? DailyStart { get; set; }
    public string? DailyEnd { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public PromotionStatus Status { get; set; }
    public int? UsageLimit { get; set; }
    public int UsageCount { get; set; }
}
