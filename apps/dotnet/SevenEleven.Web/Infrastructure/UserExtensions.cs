using System.Security.Claims;
using SevenEleven.Core.Models;

namespace SevenEleven.Web.Infrastructure;

public static class Roles
{
    public const string Customer = "Customer";
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Cashier = "Cashier";
    public const string Staff = Admin + "," + Manager + "," + Cashier;
    /// <summary>Quản trị và quản lý: xem số liệu, kho, nhập hàng, báo cáo.</summary>
    public const string Managers = Admin + "," + Manager;
}

/// <summary>Cookie đăng nhập của nhân viên, tách khỏi cookie của khách.</summary>
public static class StaffAuth
{
    public const string Scheme = "Staff";
    public const string StoreClaim = "store";
}

/// <summary>Nhân viên đang đăng nhập khu quản lý, đọc từ claim.</summary>
public record StaffUser(string Id, string Name, string Email, StaffRole Role, string? StoreId)
{
    public bool IsAdmin => Role == StaffRole.Admin;
    public bool IsManager => Role == StaffRole.Manager;
    public bool IsCashier => Role == StaffRole.Cashier;
    /// <summary>Quản trị và quản lý mới xem được bảng điều khiển, kho, nhập hàng và báo cáo.</summary>
    public bool CanManage => Role is StaffRole.Admin or StaffRole.Manager;
}

public static class UserExtensions
{
    /// <summary>Mã khách đang đăng nhập, hoặc null nếu là khách vãng lai hay nhân viên.</summary>
    public static string? CustomerId(this ClaimsPrincipal user) =>
        user.IsInRole(Roles.Customer) ? user.FindFirstValue(ClaimTypes.NameIdentifier) : null;

    public static StaffUser? Staff(this ClaimsPrincipal user)
    {
        var id = user.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleText = user.FindFirstValue(ClaimTypes.Role);
        if (id is null || !Enum.TryParse<StaffRole>(roleText, out var role)) return null;
        return new StaffUser(id, user.FindFirstValue(ClaimTypes.Name) ?? "", user.FindFirstValue(ClaimTypes.Email) ?? "", role,
            user.FindFirstValue(StaffAuth.StoreClaim));
    }
}
