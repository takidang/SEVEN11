using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Đăng nhập khu quản lý bằng email công ty và mật khẩu.</summary>
[Area("Admin")]
[AllowAnonymous]
public class AccountController(AppDbContext db) : Controller
{
    /// <summary>Tài khoản demo cho ba vai trò, mật khẩu chung 123456.</summary>
    public static readonly (string Email, string Role, string Hint)[] DemoAccounts =
    [
        ("admin@7eleven.demo", "Quản trị chuỗi", "Toàn chuỗi 10 cửa hàng"),
        ("quanly1006@7eleven.demo", "Quản lý cửa hàng", "Cửa hàng 1006 – 81 Nguyễn Du"),
        ("thungan1006@7eleven.demo", "Thu ngân", "Quầy thu ngân 1006"),
    ];

    [HttpGet]
    public async Task<IActionResult> Login(string? returnUrl)
    {
        // Trang này cho mọi người vào, nên phải tự đọc cookie nhân viên: đã đăng nhập thì vào thẳng.
        var current = await HttpContext.AuthenticateAsync(StaffAuth.Scheme);
        if (current.Succeeded && current.Principal.Staff() is { } staff) return LocalRedirect(HomeFor(staff.Role));
        ViewBag.ReturnUrl = returnUrl;
        return View();
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(string email, string password, string? returnUrl)
    {
        var normalized = (email ?? "").Trim().ToLowerInvariant();
        var employee = await db.Employees.Include(e => e.Store).FirstOrDefaultAsync(e => e.Email.ToLower() == normalized);
        string? error = employee switch
        {
            null => "Email này chưa có tài khoản nhân viên",
            _ when !PasswordHasher.Verify(password ?? "", employee.PasswordHash) => "Mật khẩu không đúng",
            { Status: EmployeeStatus.Inactive } => "Tài khoản đã bị khoá, liên hệ quản trị chuỗi",
            _ => null,
        };
        if (error is not null)
        {
            ViewBag.Error = error;
            ViewBag.Email = email;
            ViewBag.ReturnUrl = returnUrl;
            return View();
        }

        List<Claim> claims =
        [
            new(ClaimTypes.NameIdentifier, employee!.Id),
            new(ClaimTypes.Name, employee.FullName),
            new(ClaimTypes.Email, employee.Email),
            new(ClaimTypes.Role, employee.Role.ToString()),
        ];
        if (employee.StoreId is not null) claims.Add(new Claim(StaffAuth.StoreClaim, employee.StoreId));
        var identity = new ClaimsIdentity(claims, StaffAuth.Scheme);
        await HttpContext.SignInAsync(StaffAuth.Scheme, new ClaimsPrincipal(identity));

        var home = HomeFor(employee.Role);
        return LocalRedirect(Url.IsLocalUrl(returnUrl) && returnUrl!.StartsWith("/Admin") ? returnUrl : home);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(StaffAuth.Scheme);
        HttpContext.Session.Remove("admin.store");
        return RedirectToAction(nameof(Login));
    }

    /// <summary>Vai trò không mở được phân hệ này (ví dụ thu ngân vào báo cáo).</summary>
    public async Task<IActionResult> Denied()
    {
        var current = await HttpContext.AuthenticateAsync(StaffAuth.Scheme);
        var staff = current.Succeeded ? current.Principal.Staff() : null;
        ViewBag.Role = staff is null ? null : Core.Services.Labels.Role(staff.Role);
        ViewBag.Home = staff is null ? "/Admin/Account/Login" : HomeFor(staff.Role);
        return View();
    }

    /// <summary>Thu ngân vào thẳng máy bán hàng; quản lý và quản trị vào bảng điều khiển.</summary>
    public static string HomeFor(StaffRole role) => role == StaffRole.Cashier ? "/Admin/Pos" : "/Admin";
}
