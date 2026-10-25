using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Html;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Hiện lỗi ngay dưới từng ô nhập của form.</summary>
public static class Forms
{
    public static IHtmlContent Error(FormErrors? errors, string field) =>
        errors?.Of(field) is string message
            ? new HtmlString($"<span class=\"field-error\" role=\"alert\">{HtmlEncoder.Default.Encode(message)}</span>")
            : HtmlString.Empty;

    /// <summary>Lớp CSS cho ô đang có lỗi.</summary>
    public static string? Invalid(FormErrors? errors, string field) => errors?.Of(field) is null ? null : "invalid";
}

/// <summary>
/// Bảng quyền khu quản lý, chép từ lib/permissions.ts: "manage" được sửa, "view" chỉ xem, không có là
/// không mở được. Máy chủ kiểm tra lại ở từng thao tác — giao diện chỉ ẩn những gì không dùng được.
/// </summary>
public static class Permissions
{
    public enum Access { None, View, Manage }

    public static Access Of(Core.Models.StaffRole role, string module) => (role, module) switch
    {
        (Core.Models.StaffRole.Admin, _) => Access.Manage,
        (Core.Models.StaffRole.Manager, "Dashboard" or "Products" or "Suppliers" or "Customers" or "Promotions" or "Stores" or "Reports") => Access.View,
        (Core.Models.StaffRole.Manager, "Pos" or "Orders" or "Stock" or "Transfers" or "Purchasing" or "Staff") => Access.Manage,
        (Core.Models.StaffRole.Cashier, "Pos" or "Orders") => Access.Manage,
        (Core.Models.StaffRole.Cashier, "Customers") => Access.View,
        _ => Access.None,
    };

    public static bool CanView(Core.Models.StaffRole role, string module) => Of(role, module) != Access.None;
    public static bool CanManage(Core.Models.StaffRole role, string module) => Of(role, module) == Access.Manage;
}
