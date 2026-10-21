using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace SevenEleven.Web.Controllers;

/// <summary>
/// Trang lỗi chung cho mọi đường dẫn không tồn tại (cửa hàng lẫn khu quản lý), giống app/not-found.tsx
/// của bản Next.js. Là trang độc lập: không dùng layout cửa hàng (giỏ hàng, phiên) nên an toàn cho /Admin.
/// </summary>
public class StatusController : Controller
{
    [Route("loi/{code:int}")]
    public IActionResult Show(int code)
    {
        if (code is >= 400 and < 600) Response.StatusCode = code;
        var original = HttpContext.Features.Get<IStatusCodeReExecuteFeature>()?.OriginalPath;
        ViewData["Title"] = code == 404 ? "Không tìm thấy trang" : "Có lỗi xảy ra";
        return View("~/Views/Status/Show.cshtml", new StatusPageModel(code, original));
    }
}

public record StatusPageModel(int Code, string? OriginalPath)
{
    public bool NotFound => Code == 404;
    public bool Staff => OriginalPath?.StartsWith("/Admin", StringComparison.OrdinalIgnoreCase) == true;
}
