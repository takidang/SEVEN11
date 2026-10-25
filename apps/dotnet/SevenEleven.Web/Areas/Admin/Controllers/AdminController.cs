using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using Microsoft.AspNetCore.Http;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Gốc chung của khu quản lý. Quản trị xem cả chuỗi hoặc chọn một cửa hàng; quản lý và thu ngân
/// luôn bị khoá vào cửa hàng của mình — máy chủ lọc theo phạm vi này, giao diện chỉ hiển thị theo.
/// Quyền từng phân hệ khớp bảng quyền trong lib/permissions.ts.
/// </summary>
[Area("Admin")]
[Authorize(AuthenticationSchemes = StaffAuth.Scheme, Roles = Roles.Staff)]
public abstract class AdminController(AppDbContext db) : Controller
{
    private const string ScopeKey = "admin.store";

    protected AppDbContext Db { get; } = db;

    protected StaffUser Staff => User.Staff()!;

    /// <summary>Cửa hàng đang xem; null là cả chuỗi (chỉ quản trị mới có).</summary>
    protected string? ScopeStoreId =>
        Staff.IsAdmin ? NullIfEmpty(HttpContext.Session.GetString(ScopeKey)) : Staff.StoreId;

    protected void SetScope(string? storeId) => HttpContext.Session.SetString(ScopeKey, storeId ?? "");

    /// <summary>Quản trị đụng được mọi cửa hàng; người khác chỉ cửa hàng của mình.</summary>
    protected bool CanTouch(string storeId) => Staff.IsAdmin || Staff.StoreId == storeId;

    /// <summary>Yêu cầu gửi bằng fetch từ admin.js (cập nhật một phần trang thay vì tải lại cả trang).</summary>
    protected bool IsFetch => Request.Headers["X-Requested-With"] == "fetch";

    protected IActionResult Back(string? returnUrl, string fallback) =>
        LocalRedirect(Url.IsLocalUrl(returnUrl) ? returnUrl! : fallback);

    protected void Toast(string message) => TempData["Toast"] = message;

    protected void Error(string? message) => TempData["Error"] = message;

    /// <summary>Quyền của vai trò hiện tại với phân hệ đang mở.</summary>
    protected Permissions.Access Access { get; private set; } = Permissions.Access.None;

    protected bool CanManage => Access == Permissions.Access.Manage;

    public override async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (User.Staff() is { } staff)
        {
            // Đọc lại từ cơ sở dữ liệu thay vì tin cookie: quản trị vừa đặt lại mật khẩu thì người đang đăng nhập cũng bị chặn ngay.
            if (await Db.Employees.AnyAsync(e => e.Id == staff.Id && e.MustChangePassword))
            {
                var here = HttpMethods.IsGet(Request.Method) ? Request.Path + Request.QueryString : null;
                context.Result = RedirectToAction("ChangePassword", "Account", new { area = "Admin", returnUrl = here });
                return;
            }
            // Áp bảng quyền ở máy chủ: không có quyền thì không mở được; chỉ xem thì không gửi thay đổi được.
            var module = context.ActionDescriptor.RouteValues["controller"] ?? "";
            if (module is not ("Scope" or "Demo" or "Account"))
            {
                Access = Permissions.Of(staff.Role, module);
                if (Access == Permissions.Access.None || (Access == Permissions.Access.View && HttpMethods.IsPost(Request.Method)))
                {
                    context.Result = RedirectToAction("Denied", "Account", new { area = "Admin" });
                    return;
                }
            }
            ViewBag.CanManage = CanManage;
            var stores = await Db.Stores.AsNoTracking().OrderBy(s => s.Code).ToListAsync();
            var scope = ScopeStoreId;
            ViewBag.Staff = staff;
            ViewBag.Stores = stores;
            ViewBag.ScopeStoreId = scope;
            ViewBag.ScopeStore = stores.FirstOrDefault(s => s.Id == scope);
            // Phiếu chuyển kho đang trên đường tới cửa hàng đang xem (cả chuỗi với quản trị): số trên menu.
            ViewBag.IncomingTransfers = Permissions.CanView(staff.Role, "Transfers")
                ? await Db.StockTransfers.CountAsync(t => t.Status == StockTransferStatus.InTransit && (scope == null || t.ToStoreId == scope))
                : 0;
            ViewBag.PendingCount = await Db.Orders.CountAsync(o =>
                o.Channel == SalesChannel.Online && o.Status == OrderStatus.Pending && (scope == null || o.StoreId == scope));
        }
        await next();
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
