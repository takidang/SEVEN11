using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Mạng lưới cửa hàng. Quản trị thêm/sửa; quản lý xem toàn chuỗi (chỉ xem).</summary>
public class StoresController(AppDbContext db, ChainAdminService chain) : AdminController(db)
{
    public async Task<IActionResult> Index(string? q, string? province, StoreStatus? status)
    {
        var now = DateTime.Now;
        var stores = await Db.Stores.AsNoTracking().OrderBy(s => s.Code).ToListAsync();
        var metrics = await MetricsAsync(now);
        var employees = await Db.Employees.AsNoTracking().ToListAsync();
        var scope = ScopeStoreId;
        var list = stores.Where(s => (province is null || s.Province == province) && (status is null || s.Status == status)
                                     && Text.MatchesAllWords($"{s.Code} {s.Name} {s.Address} {s.Ward} {s.Province}", q))
            .OrderBy(s => s.Id == scope ? 0 : 1).ThenBy(s => s.Code).ToList();
        ViewData["Title"] = "Cửa hàng";
        return View(new StoreListModel(list, stores, metrics, employees, q, province, status, now));
    }

    public async Task<IActionResult> Detail(string id)
    {
        var store = await Db.Stores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id || s.Code == id);
        if (store is null) return NotFound();
        var now = DateTime.Now;
        var metrics = (await MetricsAsync(now)).GetValueOrDefault(store.Id) ?? StoreMetrics.Empty(now);
        var staff = await Db.Employees.AsNoTracking().Where(e => e.StoreId == store.Id)
            .OrderBy(e => e.Status == EmployeeStatus.Inactive).ThenBy(e => e.Role).ThenBy(e => e.FullName).ToListAsync();
        var manager = store.ManagerId is null ? null : await Db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == store.ManagerId);
        ViewData["Title"] = $"{store.Code} – {store.Name}";
        return View(new StoreDetailModel(store, metrics, staff, manager, Staff.IsAdmin || Staff.StoreId == store.Id));
    }

    public async Task<IActionResult> Edit(string? id)
    {
        if (!CanManage) return RedirectToAction(nameof(Index));
        var store = id is null ? null : await Db.Stores.FindAsync(id);
        if (id is not null && store is null) return NotFound();
        return await FormAsync(store is null ? new StoreInput() : StoreInput.From(store), store, null);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Save(StoreInput input)
    {
        var result = await chain.SaveStoreAsync(input, DateTime.Now);
        if (!result.Ok)
        {
            var existing = input.Id is null ? null : await Db.Stores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == input.Id);
            return await FormAsync(input, existing, result.Errors);
        }
        Toast(input.Id is null ? $"Đã thêm cửa hàng {result.Value!.Code} – {result.Value.Name}" : $"Đã cập nhật cửa hàng {result.Value!.Code}");
        return RedirectToAction(nameof(Detail), new { id = result.Value.Id });
    }

    /// <summary>Quản trị bấm "Xem lịch ca" ở một cửa hàng: chuyển phạm vi xem sang cửa hàng đó rồi mở lịch ca.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Schedule(string id)
    {
        if (Staff.IsAdmin) SetScope(id);
        return Redirect("/Admin/Staff?tab=lich-ca");
    }

    private async Task<IActionResult> FormAsync(StoreInput input, Store? existing, FormErrors? errors)
    {
        var managers = await Db.Employees.AsNoTracking().Include(e => e.Store)
            .Where(e => e.Role == StaffRole.Manager && e.Status != EmployeeStatus.Inactive).OrderBy(e => e.FullName).ToListAsync();
        ViewData["Title"] = existing is null ? "Thêm cửa hàng" : $"Sửa cửa hàng {existing.Code} – {existing.Name}";
        return View("Edit", new StoreFormModel(input, existing, managers, errors ?? new FormErrors()));
    }

    /// <summary>Doanh thu 7 ngày (gồm hôm nay) và hôm nay so với cùng giờ hôm qua, cho từng cửa hàng.</summary>
    private async Task<Dictionary<string, StoreMetrics>> MetricsAsync(DateTime now)
    {
        var from = now.Date.AddDays(-6);
        var orders = await Db.Orders.AsNoTracking().Where(o => o.Status != OrderStatus.Cancelled && o.CreatedAt >= from.AddDays(-1))
            .Select(o => new { o.StoreId, o.CreatedAt, o.Total }).ToListAsync();
        return orders.GroupBy(o => o.StoreId).ToDictionary(g => g.Key, g =>
        {
            var days = Enumerable.Range(0, 7).Select(i => from.AddDays(i)).Select(d =>
            {
                var list = g.Where(o => o.CreatedAt.Date == d).ToList();
                return (Day: d, Orders: list.Count, Revenue: list.Sum(o => (long)o.Total));
            }).ToList();
            var yesterday = g.Where(o => o.CreatedAt >= now.Date.AddDays(-1) && o.CreatedAt < now.AddDays(-1)).Sum(o => (long)o.Total);
            return new StoreMetrics(days, yesterday);
        });
    }
}

public record StoreMetrics(List<(DateTime Day, int Orders, long Revenue)> Days, long YesterdaySoFar)
{
    public static StoreMetrics Empty(DateTime now) =>
        new(Enumerable.Range(0, 7).Select(i => (now.Date.AddDays(i - 6), 0, 0L)).ToList(), 0);

    public (int Orders, long Revenue) Today => Days.Count > 0 ? (Days[^1].Orders, Days[^1].Revenue) : (0, 0);
    public long WeekRevenue => Days.Sum(d => d.Revenue);
    public int WeekOrders => Days.Sum(d => d.Orders);
}

public record StoreListModel(
    List<Store> Stores, List<Store> All, Dictionary<string, StoreMetrics> Metrics, List<Employee> Employees,
    string? Query, string? Province, StoreStatus? Status, DateTime Now);

public record StoreDetailModel(Store Store, StoreMetrics Metrics, List<Employee> Staff, Employee? Manager, bool CanSeeSchedule);

public record StoreFormModel(StoreInput Input, Store? Existing, List<Employee> Managers, FormErrors Errors);
