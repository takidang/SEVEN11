using SevenEleven.Core.Services;

namespace SevenEleven.Core.Models;

/// <summary>Đồng → Bạc → Vàng → Kim cương. Luật hạng nằm ở Services/MembershipService.</summary>
public enum MemberTier { Bronze, Silver, Gold, Diamond }

public class Customer : ILockableAccount
{
    public string Id { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Email { get; set; }
    public DateTime? Birthday { get; set; }

    public MemberTier Tier { get; set; } = MemberTier.Bronze;
    /// <summary>
    /// Chi tiêu tính hạng: tiền thực trả sau mọi giảm giá, không tính đồ uống có cồn.
    /// Đạt mốc là lên hạng ngay; tụt hạng thì kéo về đúng mốc của hạng mới.
    /// </summary>
    public int TierSpend { get; set; }
    public DateTime TierSince { get; set; }
    /// <summary>Tháng vừa lên hạng ("yyyy-MM"): tháng đó miễn xét giữ hạng.</summary>
    public string? GraceMonth { get; set; }
    /// <summary>Tháng gần nhất đã chạy xét giữ hạng ("yyyy-MM").</summary>
    public string ReviewedMonth { get; set; } = "";

    /// <summary>Sao vàng còn dùng được.</summary>
    public int Stars { get; set; }
    /// <summary>Phần chi tiêu lẻ cộng dồn sang sao kế tiếp.</summary>
    public int StarCarry { get; set; }
    public int TotalSpent { get; set; }
    public int OrderCount { get; set; }
    public DateTime JoinedAt { get; set; }
    /// <summary>Mật khẩu băm; khách đăng ký tại quầy thì để trống cho tới khi tự đặt.</summary>
    public string? PasswordHash { get; set; }
    /// <summary>Số lần sai mật khẩu liên tiếp; luật khoá ở Services/LoginLockout.</summary>
    public int FailedLogins { get; set; }
    public DateTime? LockedUntil { get; set; }

    public List<Address> Addresses { get; set; } = [];
    public List<Order> Orders { get; set; } = [];
    public List<StarEntry> StarEntries { get; set; } = [];
    public List<TierChange> TierChanges { get; set; } = [];
}

/// <summary>Một lần đổi hạng: lên hạng vì chi tiêu đạt mốc, hoặc xuống hạng vì không giữ được hạng.</summary>
public class TierChange
{
    public int Id { get; set; }
    public string CustomerId { get; set; } = "";
    public Customer? Customer { get; set; }
    public DateTime At { get; set; }
    public MemberTier From { get; set; }
    public MemberTier To { get; set; }
    public string Reason { get; set; } = "";
}

public class Address
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Recipient { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Line { get; set; } = "";
    public string Ward { get; set; } = "";
    public string Province { get; set; } = "";
    public bool IsDefault { get; set; }
    /// <summary>Có toạ độ khi khách bấm "dùng vị trí hiện tại"; dùng để chọn cửa hàng gần nhất.</summary>
    public double? Lat { get; set; }
    public double? Lng { get; set; }

    public string CustomerId { get; set; } = "";
    public Customer? Customer { get; set; }
}

public enum StarEntryKind { Earn, Redeem, Expire, Refund }

/// <summary>Một lần sao vàng thay đổi: tích thêm, đổi quà, hết hạn, hoặc trừ lại khi huỷ đơn.</summary>
public class StarEntry
{
    public int Id { get; set; }
    public string CustomerId { get; set; } = "";
    public Customer? Customer { get; set; }
    public DateTime At { get; set; }
    public int Delta { get; set; }
    public StarEntryKind Kind { get; set; }
    public string Note { get; set; } = "";
    /// <summary>Mã đơn hoặc mã voucher liên quan.</summary>
    public string? Ref { get; set; }
}
