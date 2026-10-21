using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SevenEleven.Core.Data;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Tạo lại dữ liệu mẫu tính tới hôm nay (giống "Tạo lại dữ liệu mẫu" bên Next.js). Dùng trước buổi
/// thuyết trình để bảng điều khiển có số hôm nay; mọi tài khoản và đơn tự tạo sẽ mất.
/// </summary>
[Authorize(AuthenticationSchemes = StaffAuth.Scheme, Roles = Roles.Admin)]
public class DemoController(AppDbContext db, IWebHostEnvironment env) : AdminController(db)
{
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Reset()
    {
        await SeedData.ResetAsync(Db, Path.Combine(env.ContentRootPath, "Data"));
        SetScope(null);
        Toast("Đã tạo lại dữ liệu mẫu tính tới hôm nay");
        return Redirect("/Admin");
    }
}
