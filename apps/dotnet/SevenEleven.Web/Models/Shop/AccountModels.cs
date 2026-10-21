using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Models.Shop;

/// <summary>Bước của luồng đăng nhập: form (2 tab), quên mật khẩu, nhập OTP, đặt mật khẩu mới.</summary>
public enum AuthStep { Form, Forgot, Otp, NewPassword }

/// <summary>Lỗi kèm lối thoát: "Đăng ký với số này", "Tạo mật khẩu", "Đăng nhập".</summary>
public enum AuthProblem { None, NotRegistered, NoPassword, AlreadyMember, Unknown }

/// <summary>Trạng thái luồng đăng ký / quên mật khẩu giữ trong phiên (mã OTP thì nằm ở OtpService).</summary>
public sealed class AuthFlowState
{
    /// <summary>"otp" hoặc "new-password".</summary>
    public string Step { get; set; } = "otp";
    /// <summary>"sign-up" hoặc "reset".</summary>
    public string Purpose { get; set; } = "sign-up";
    public string Phone { get; set; } = "";
    public DateTime SentAt { get; set; }
    /// <summary>Mã OTP chỉ dùng để hiện "SMS giả lập" ở bản demo.</summary>
    public string DevCode { get; set; } = "";
    /// <summary>Lỗi của lần nhập mã gần nhất (giữ tới khi gửi mã mới).</summary>
    public string? Error { get; set; }
    /// <summary>Mã hết hạn hoặc sai quá 5 lần: chỉ còn cách xin mã mới.</summary>
    public bool Blocked { get; set; }
}

/// <summary>Thông tin đăng ký chờ xác minh OTP (mật khẩu đã băm).</summary>
public sealed class PendingSignUp
{
    public string FullName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string PasswordHash { get; set; } = "";
}

/// <summary>Giá trị và lỗi của form vừa gửi, mang qua lần chuyển trang (PRG). Không bao giờ chứa mật khẩu.</summary>
public sealed class AuthFormState
{
    public string? Phone { get; set; }
    public string? FullName { get; set; }
    public Dictionary<string, string> Errors { get; set; } = [];
    public AuthProblem Problem { get; set; }
    public string? ProblemPhone { get; set; }
}

public sealed class SignInModel
{
    public required bool SignUp { get; init; }
    public required AuthStep Step { get; init; }
    public required string Next { get; init; }
    public string? Phone { get; init; }
    public string? FullName { get; init; }
    public required FormErrors Errors { get; init; }
    public AuthProblem Problem { get; init; }
    public string? ProblemPhone { get; init; }
    public AuthFlowState? Flow { get; init; }
    public int ResendLeft { get; init; }
    public string? OtpError { get; init; }
    public bool OtpBlocked { get; init; }
    public Customer? Demo { get; init; }
}

public sealed class ProfileInput
{
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? Birthday { get; set; }
}

public sealed class AccountModel
{
    public required Customer Customer { get; init; }
    public required string Tab { get; init; }
    public required DateTime Now { get; init; }
    public required KeepStatus Keep { get; init; }
    public required List<Order> Orders { get; init; }
    public required int ActiveOrders { get; init; }
    public required List<Promotion> UsableVouchers { get; init; }
    public required List<StarEntry> Stars { get; init; }
    public required int StarTotal { get; init; }
    public required int StarLimit { get; init; }
    public required List<Promotion> MyVouchers { get; init; }
    public required List<TierChange> TierHistory { get; init; }
    public required string OrderFilter { get; init; }
    public required int OrderLimit { get; init; }
    public FormErrors? ProfileErrors { get; init; }
    public ProfileInput? ProfileValues { get; init; }
    public required IReadOnlyList<Category> Categories { get; init; }

    public static readonly (string Key, string Label, string Icon)[] Tabs =
    [
        ("tong-quan", "Tổng quan", "layout-grid"),
        ("hang", "Hạng thành viên", "crown"),
        ("sao-vang", "Sao vàng", "star"),
        ("don-hang", "Đơn hàng", "package"),
        ("dia-chi", "Địa chỉ", "map-pin"),
        ("thong-tin", "Thông tin", "user-round"),
    ];

    public static readonly (string Key, string Label, OrderStatus[]? Statuses)[] OrderFilters =
    [
        ("tat-ca", "Tất cả", null),
        ("dang-xu-ly", "Đang xử lý", [OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Preparing, OrderStatus.Delivering]),
        ("hoan-thanh", "Hoàn thành", [OrderStatus.Completed]),
        ("da-huy", "Đã huỷ", [OrderStatus.Cancelled]),
    ];

    public const int OrderPage = 10;
    public const int StarPage = 15;
}
