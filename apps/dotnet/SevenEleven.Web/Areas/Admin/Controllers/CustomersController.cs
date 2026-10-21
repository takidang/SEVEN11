using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Thành viên: hạng dùng chung toàn chuỗi. Quản trị sửa được thông tin cá nhân; quản lý và thu ngân chỉ xem.</summary>
public class CustomersController(AppDbContext db, CustomerAdminService customers) : AdminController(db)
{
    private const int PageSize = 20;

    public async Task<IActionResult> Index(string? q, MemberTier? tier, bool risk = false, CustomerSort sort = CustomerSort.TierSpend,
        string? scope = null, string? sdt = null, int page = 1)
    {
        var now = DateTime.Now;
        var storeId = ScopeStoreId;
        var storeOnly = storeId is not null && scope != "chuoi";

        // Mở thẳng hồ sơ bằng số điện thoại (ví dụ từ máy bán hàng).
        if (!string.IsNullOrWhiteSpace(sdt))
        {
            var digits = Text.Digits(sdt);
            var found = await Db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Phone == digits);
            if (found is not null) return RedirectToAction(nameof(Detail), new { id = found.Id });
            ViewBag.MissingPhone = digits;
        }

        var scoped = await customers.ScopedAsync(storeId, storeOnly, now);
        var filtered = CustomerAdminService.Sort(CustomerAdminService.Filter(scoped, q, tier, risk), sort).ToList();
        var pages = Math.Max(1, (int)Math.Ceiling(filtered.Count / (double)PageSize));
        page = Math.Clamp(page, 1, pages);
        ViewData["Title"] = "Khách hàng";
        return View(new CustomerListModel(
            filtered.Skip((page - 1) * PageSize).Take(PageSize).ToList(), filtered.Count, scoped.Count, CustomerAdminService.Stats(scoped, now),
            q, tier, risk, sort, storeOnly, page, pages, now));
    }

    public async Task<IActionResult> Detail(string id)
    {
        var detail = await customers.DetailAsync(id, DateTime.Now);
        if (detail is null) return NotFound();
        ViewData["Title"] = detail.Customer.FullName;
        return View(new CustomerDetailModel(detail, DateTime.Now, null, null));
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Profile(string id, string? fullName, string? email, DateTime? birthday)
    {
        var errors = await customers.UpdateProfileAsync(id, fullName, email, birthday, DateTime.Now, storefront: false);
        if (errors.Count == 0)
        {
            Toast("Đã cập nhật thông tin khách hàng");
            return RedirectToAction(nameof(Detail), new { id });
        }
        var detail = await customers.DetailAsync(id, DateTime.Now);
        if (detail is null) return NotFound();
        ViewData["Title"] = detail.Customer.FullName;
        return View("Detail", new CustomerDetailModel(detail, DateTime.Now, errors, (fullName, email, birthday)));
    }
}

public record CustomerListModel(
    List<CustomerRow> Rows, int Filtered, int Scoped, CustomerStats Stats, string? Query, MemberTier? Tier, bool Risk, CustomerSort Sort,
    bool StoreOnly, int Page, int Pages, DateTime Now);

public record CustomerDetailModel(CustomerDetail Detail, DateTime Now, FormErrors? Errors, (string? FullName, string? Email, DateTime? Birthday)? Posted);
