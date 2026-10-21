using Microsoft.AspNetCore.Mvc;
using SevenEleven.Core.Data;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Quản trị đổi phạm vi xem: cả chuỗi hoặc một cửa hàng.</summary>
public class ScopeController(AppDbContext db) : AdminController(db)
{
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Set(string? storeId, string? returnUrl)
    {
        if (Staff.IsAdmin) SetScope(string.IsNullOrEmpty(storeId) ? null : storeId);
        return Back(returnUrl, "/Admin");
    }
}
