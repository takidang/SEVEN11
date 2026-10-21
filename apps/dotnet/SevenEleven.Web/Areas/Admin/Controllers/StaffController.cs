using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Nhân viên & ca làm: hồ sơ nhân viên, lịch ca theo tuần, chốt tiền két cuối ca. Quản trị và quản lý
/// dùng được; quản lý chỉ thêm/sửa thu ngân cửa hàng mình. Lịch ca và chốt ca làm theo từng cửa hàng.
/// </summary>
public class StaffController(AppDbContext db, ChainAdminService chain, ShiftService shifts, PasswordService passwords) : AdminController(db)
{
    private const int PageSize = 20;

    public async Task<IActionResult> Index(string? tab, string? q, StaffRole? role, EmployeeStatus? status, string? week, string? ngay,
        string? slot, string? ca, string? lam, int page = 1)
    {
        tab = tab is "lich-ca" or "chot-ca" ? tab : "nhan-vien";
        var now = DateTime.Now;
        var storeId = ScopeStoreId;
        var store = storeId is null ? null : await Db.Stores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == storeId);
        ViewData["Title"] = "Nhân viên & ca làm";
        var model = new StaffPageModel { Tab = tab, Store = store, Now = now, Stores = await Db.Stores.AsNoTracking().OrderBy(s => s.Code).ToListAsync() };

        if (tab == "nhan-vien")
        {
            var employees = await Db.Employees.AsNoTracking().Include(e => e.Store)
                .Where(e => storeId == null || e.StoreId == storeId).ToListAsync();
            var digits = Text.Digits(q);
            var filtered = employees.Where(e =>
                    (role is null || e.Role == role) && (status is null || e.Status == status) &&
                    (string.IsNullOrWhiteSpace(q) || Text.MatchesAllWords($"{e.FullName} {e.Code} {e.Email}", q) || (digits.Length >= 3 && e.Phone.Contains(digits))))
                .OrderBy(e => e.Status == EmployeeStatus.Inactive).ThenBy(e => e.Role).ThenBy(e => e.Code).ToList();
            var pages = Math.Max(1, (int)Math.Ceiling(filtered.Count / (double)PageSize));
            page = Math.Clamp(page, 1, pages);
            model.Employees = filtered.Skip((page - 1) * PageSize).Take(PageSize).ToList();
            model.EmployeeTotal = filtered.Count;
            model.StatusCounts = Enum.GetValues<EmployeeStatus>().ToDictionary(s => s, s => employees.Count(e => e.Status == s));
            model.Query = q;
            model.Role = role;
            model.Status = status;
            model.Page = page;
            model.Pages = pages;
            return View(model);
        }
        if (store is null) return View(model);

        if (tab == "lich-ca")
        {
            var monday = DateTime.TryParse(week, out var w) ? ShiftService.WeekStart(w) : ShiftService.WeekStart(now);
            model.WeekStart = monday;
            model.WeekShifts = await Db.Shifts.AsNoTracking().Include(s => s.Employee)
                .Where(s => s.StoreId == store.Id && s.Date >= monday && s.Date < monday.AddDays(7)).ToListAsync();
            model.Roster = await Db.Employees.AsNoTracking().Where(e => e.StoreId == store.Id && e.Status == EmployeeStatus.Active)
                .OrderBy(e => e.Role).ThenBy(e => e.FullName).ToListAsync();
            model.Inactive = await Db.Employees.AsNoTracking().Where(e => e.StoreId == store.Id && e.Status != EmployeeStatus.Active).ToListAsync();
            if (slot is not null && TryParseSlot(slot, out var date, out var type)) model.SelectedSlot = (date, type);
            return View(model);
        }

        // Chốt ca: một ngày, không sau hôm nay.
        var day = DateTime.TryParse(ngay, out var d) && d.Date <= now.Date ? d.Date : now.Date;
        model.Day = day;
        var dayShifts = await Db.Shifts.AsNoTracking().Include(s => s.Employee)
            .Where(s => s.StoreId == store.Id && s.Date == day).ToListAsync();
        var rows = new List<ClosingRow>();
        foreach (var s in dayShifts.OrderBy(s => s.Type).ThenBy(s => s.Id))
        {
            var (start, end) = ShiftService.Window(s);
            var sales = await shifts.ShiftCashAsync(s);
            long? expected = s.OpeningCash is int open ? open + sales.Amount : null;
            long? diff = s.Status == ShiftStatus.Completed && s.ClosingCash is int close && expected is long e ? close - e : null;
            rows.Add(new ClosingRow(s, start, end, sales, expected, diff));
        }
        model.Closing = rows;
        model.OtherDayRunning = await Db.Shifts.AsNoTracking().Include(s => s.Employee)
            .FirstOrDefaultAsync(s => s.StoreId == store.Id && s.Status == ShiftStatus.InProgress && s.Date != day);
        if (ca is not null && rows.FirstOrDefault(r => r.Shift.Id == ca) is { } selected)
        {
            model.SelectedShift = selected;
            model.SelectedAction = lam == "chot" ? "chot" : "vao";
            if (model.SelectedAction == "vao") model.SuggestedOpening = await shifts.SuggestedOpeningAsync(store.Id, selected.Start);
        }
        return View(model);
    }

    /// <summary>Quản trị chọn nhanh cửa hàng ngay trong tab lịch ca / chốt ca.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult PickStore(string storeId, string tab)
    {
        if (Staff.IsAdmin) SetScope(storeId);
        return RedirectToAction(nameof(Index), new { tab });
    }

    // ------------------------------------------------------------------ nhân viên

    public async Task<IActionResult> Employee(string? id)
    {
        Employee? employee = null;
        if (id is not null)
        {
            employee = await Db.Employees.AsNoTracking().Include(e => e.Store).FirstOrDefaultAsync(e => e.Id == id);
            if (employee is null || (!Staff.IsAdmin && employee.StoreId != Staff.StoreId && employee.Id != Staff.Id)) return NotFound();
        }
        var input = employee is null
            ? new EmployeeInput { StoreId = Staff.IsManager ? Staff.StoreId : ScopeStoreId, HiredAt = DateTime.Today }
            : EmployeeInput.From(employee);
        return await EmployeeViewAsync(input, employee, null);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> SaveEmployee(EmployeeInput input)
    {
        var actor = new Actor(Staff.Id, Staff.Role, Staff.StoreId);
        var (result, orphans) = await chain.SaveEmployeeAsync(input, actor, DateTime.Now);
        if (!result.Ok)
        {
            var existing = input.Id is null ? null : await Db.Employees.AsNoTracking().Include(e => e.Store).FirstOrDefaultAsync(e => e.Id == input.Id);
            return await EmployeeViewAsync(input, existing, result.Errors);
        }
        var e = result.Value!;
        Toast((input.Id is null ? $"Đã thêm nhân viên {e.FullName} ({e.Code})" : $"Đã lưu thông tin {e.FullName}")
              + (orphans > 0 ? $". Nhân viên còn {orphans} ca đã xếp từ hôm nay – hãy xếp lại lịch ca." : ""));
        return RedirectToAction(nameof(Employee), new { id = e.Id });
    }

    /// <summary>Quản trị đặt lại mật khẩu: mật khẩu tạm hiện một lần ở thông báo, nhân viên phải đổi khi đăng nhập.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> ResetPassword(string id)
    {
        var employee = await Db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id);
        if (employee is null) return NotFound();
        var result = await passwords.ResetEmployeeAsync(new Actor(Staff.Id, Staff.Role, Staff.StoreId), id);
        if (result.Ok) Toast($"Đã đặt lại mật khẩu cho {employee.FullName}. Mật khẩu tạm: {result.TempPassword} — chỉ hiện một lần, nhân viên phải đổi ở lần đăng nhập tới.");
        else Error(result.Error);
        return RedirectToAction(nameof(Employee), new { id });
    }

    private async Task<IActionResult> EmployeeViewAsync(EmployeeInput input, Employee? employee, FormErrors? errors)
    {
        var monday = ShiftService.WeekStart(DateTime.Today);
        var weekShifts = employee is null ? [] : await Db.Shifts.AsNoTracking().Include(s => s.Store)
            .Where(s => s.EmployeeId == employee.Id && s.Date >= monday && s.Date < monday.AddDays(7)).OrderBy(s => s.Date).ThenBy(s => s.Type).ToListAsync();
        var actor = new Actor(Staff.Id, Staff.Role, Staff.StoreId);
        var canEdit = employee is null ? Staff.CanManage : ChainAdminService.CanEdit(actor, employee);
        ViewData["Title"] = employee?.FullName ?? "Thêm nhân viên";
        return View("Employee", new EmployeeFormModel(input, employee, await Db.Stores.AsNoTracking().OrderBy(s => s.Code).ToListAsync(),
            weekShifts, monday, errors ?? new FormErrors(), canEdit, Staff.IsAdmin, employee?.Id == Staff.Id));
    }

    // ------------------------------------------------------------------ lịch ca

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Assign(DateTime date, ShiftType type, string? employeeId)
    {
        if (ScopeStoreId is not string storeId) return RedirectToAction(nameof(Index), new { tab = "lich-ca" });
        var result = await shifts.AssignAsync(storeId, date, type, employeeId, DateTime.Now);
        var name = result.Ok ? (await Db.Employees.FindAsync(employeeId))?.FullName : null;
        if (result.Ok) Toast($"Đã xếp {name} vào {ShiftService.Label(type)} {date:dd/MM}");
        else Error(result.Error);
        return RedirectToAction(nameof(Index), new { tab = "lich-ca", week = date.ToString("yyyy-MM-dd"), slot = result.Ok ? null : SlotKey(date, type) });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteShift(string id)
    {
        var shift = await Db.Shifts.Include(s => s.Employee).FirstOrDefaultAsync(s => s.Id == id);
        if (shift is null || !CanTouch(shift.StoreId)) return NotFound();
        var (date, type, name) = (shift.Date, shift.Type, shift.Employee?.FullName);
        var result = await shifts.DeleteAsync(id);
        if (result.Ok) Toast($"Đã xoá {ShiftService.Label(type)} {date:dd/MM} của {name}");
        else Error(result.Error);
        return RedirectToAction(nameof(Index), new { tab = "lich-ca", week = date.ToString("yyyy-MM-dd") });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Absent(string id, string? back)
    {
        var shift = await Db.Shifts.Include(s => s.Employee).FirstOrDefaultAsync(s => s.Id == id);
        if (shift is null || !CanTouch(shift.StoreId)) return NotFound();
        var result = await shifts.MarkAbsentAsync(id, DateTime.Now);
        if (result.Ok) Toast($"Đã ghi nhận {shift.Employee?.FullName} vắng {ShiftService.Label(shift.Type).ToLower()}");
        else Error(result.Error);
        return back == "chot-ca"
            ? RedirectToAction(nameof(Index), new { tab = "chot-ca", ngay = shift.Date.ToString("yyyy-MM-dd") })
            : RedirectToAction(nameof(Index), new { tab = "lich-ca", week = shift.Date.ToString("yyyy-MM-dd") });
    }

    // ------------------------------------------------------------------ chốt ca

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> CheckIn(string id, string? openingCash)
    {
        var shift = await Db.Shifts.Include(s => s.Employee).FirstOrDefaultAsync(s => s.Id == id);
        if (shift is null || !CanTouch(shift.StoreId)) return NotFound();
        var result = await shifts.CheckInAsync(id, Text.ParseInt(openingCash), DateTime.Now);
        if (result.Ok) Toast($"{shift.Employee?.FullName} đã vào {ShiftService.Label(shift.Type).ToLower()} · tiền đầu ca {Money.Format(result.Shift!.OpeningCash ?? 0)}");
        else Error(result.Error);
        return RedirectToAction(nameof(Index), new { tab = "chot-ca", ngay = shift.Date.ToString("yyyy-MM-dd"), ca = result.Ok ? null : id, lam = result.Ok ? null : "vao" });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> CheckOut(string id, string? closingCash, string? note)
    {
        var shift = await Db.Shifts.Include(s => s.Employee).FirstOrDefaultAsync(s => s.Id == id);
        if (shift is null || !CanTouch(shift.StoreId)) return NotFound();
        var result = await shifts.CheckOutAsync(id, Text.ParseInt(closingCash), note, requireNoteWhenOff: true, DateTime.Now);
        if (result.Ok)
        {
            var expected = await shifts.ExpectedAsync(result.Shift!) ?? 0;
            var (label, _) = ShiftService.DifferenceBadge((result.Shift!.ClosingCash ?? 0) - expected);
            Toast($"Đã chốt {ShiftService.Label(shift.Type).ToLower()} của {shift.Employee?.FullName} · tiền két {Money.Format(result.Shift.ClosingCash ?? 0)} · {label}");
        }
        else
        {
            Error(result.Error);
        }
        return RedirectToAction(nameof(Index), new { tab = "chot-ca", ngay = shift.Date.ToString("yyyy-MM-dd"), ca = result.Ok ? null : id, lam = result.Ok ? null : "chot" });
    }

    public static string SlotKey(DateTime date, ShiftType type) => $"{date:yyyy-MM-dd}_{type.ToString().ToLowerInvariant()}";

    private static bool TryParseSlot(string value, out DateTime date, out ShiftType type)
    {
        date = default;
        type = default;
        var parts = value.Split('_');
        return parts.Length == 2 && DateTime.TryParse(parts[0], out date) && Enum.TryParse(parts[1], true, out type);
    }
}

public record ClosingRow(Shift Shift, DateTime Start, DateTime End, CashSales Sales, long? Expected, long? Difference);

public class StaffPageModel
{
    public string Tab { get; init; } = "nhan-vien";
    public Store? Store { get; init; }
    public List<Store> Stores { get; init; } = [];
    public DateTime Now { get; init; }
    // nhân viên
    public List<Employee> Employees { get; set; } = [];
    public int EmployeeTotal { get; set; }
    public Dictionary<EmployeeStatus, int> StatusCounts { get; set; } = [];
    public string? Query { get; set; }
    public StaffRole? Role { get; set; }
    public EmployeeStatus? Status { get; set; }
    public int Page { get; set; } = 1;
    public int Pages { get; set; } = 1;
    // lịch ca
    public DateTime WeekStart { get; set; }
    public List<Shift> WeekShifts { get; set; } = [];
    public List<Employee> Roster { get; set; } = [];
    public List<Employee> Inactive { get; set; } = [];
    public (DateTime Date, ShiftType Type)? SelectedSlot { get; set; }
    // chốt ca
    public DateTime Day { get; set; }
    public List<ClosingRow> Closing { get; set; } = [];
    public Shift? OtherDayRunning { get; set; }
    public ClosingRow? SelectedShift { get; set; }
    public string? SelectedAction { get; set; }
    public (int Amount, bool FromPrevious) SuggestedOpening { get; set; }
}

public record EmployeeFormModel(
    EmployeeInput Input, Employee? Employee, List<Store> Stores, List<Shift> WeekShifts, DateTime WeekStart, FormErrors Errors,
    bool CanEdit, bool ActorIsAdmin, bool IsSelf);
