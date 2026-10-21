using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public record ShiftResult(bool Ok, Shift? Shift, string? Error)
{
    public static ShiftResult Fail(string error) => new(false, null, error);
}

/// <summary>Tiền mặt bán tại quầy trong một khung giờ.</summary>
public record CashSales(long Amount, int Orders);

/// <summary>
/// Ca làm và chốt tiền két, chuyển từ nhan-vien (lịch ca, chốt ca) và ban-hang/shift-control của bản
/// Next.js. Ba ca mỗi ngày, mỗi ca 8 giờ; ca đêm chỉ có ở cửa hàng mở 24/7. Tiền dự kiến trong két =
/// tiền đầu ca + tiền mặt bán tại quầy trong khung giờ của ca; chênh lệch = tiền đếm được − dự kiến.
/// </summary>
public class ShiftService(AppDbContext db)
{
    public const int DefaultOpeningCash = 2_000_000;
    public const int MaxOpeningCash = 50_000_000;
    public const int MaxClosingCash = 500_000_000;
    public const int HoursPerShift = 8;
    /// <summary>Được vào ca sớm tối đa 30 phút trước giờ bắt đầu.</summary>
    public const int EarlyCheckInMinutes = 30;

    public static readonly ShiftType[] Types = [ShiftType.Morning, ShiftType.Afternoon, ShiftType.Night];

    public static string Label(ShiftType t) => t switch
    {
        ShiftType.Morning => "Ca sáng",
        ShiftType.Afternoon => "Ca chiều",
        _ => "Ca đêm",
    };

    public static string Time(ShiftType t) => t switch
    {
        ShiftType.Morning => "06:00 – 14:00",
        ShiftType.Afternoon => "14:00 – 22:00",
        _ => "22:00 – 06:00",
    };

    public static string StatusLabel(ShiftStatus s) => s switch
    {
        ShiftStatus.Scheduled => "Đã xếp lịch",
        ShiftStatus.InProgress => "Đang làm",
        ShiftStatus.Completed => "Đã xong",
        _ => "Vắng",
    };

    public static string StatusTone(ShiftStatus s) => s switch
    {
        ShiftStatus.Scheduled => "neutral",
        ShiftStatus.InProgress => "fresh",
        ShiftStatus.Completed => "info",
        _ => "danger",
    };

    /// <summary>Khung giờ [bắt đầu, kết thúc) của một ca; ca đêm kéo sang 06:00 hôm sau.</summary>
    public static (DateTime Start, DateTime End) Window(DateTime date, ShiftType type)
    {
        var day = date.Date;
        return type switch
        {
            ShiftType.Morning => (day.AddHours(6), day.AddHours(14)),
            ShiftType.Afternoon => (day.AddHours(14), day.AddHours(22)),
            _ => (day.AddHours(22), day.AddDays(1).AddHours(6)),
        };
    }

    public static (DateTime Start, DateTime End) Window(Shift s) => Window(s.Date, s.Type);

    /// <summary>Thời điểm này thuộc ca nào: 00:00–05:59 là ca đêm của hôm trước.</summary>
    public static (DateTime Date, ShiftType Type) SlotAt(DateTime at) => at.Hour switch
    {
        < 6 => (at.Date.AddDays(-1), ShiftType.Night),
        < 14 => (at.Date, ShiftType.Morning),
        < 22 => (at.Date, ShiftType.Afternoon),
        _ => (at.Date, ShiftType.Night),
    };

    public static string SlotId(string storeCode, DateTime date, ShiftType type) =>
        $"sh-{storeCode}-{date:yyyy-MM-dd}-{type.ToString().ToLowerInvariant()}";

    /// <summary>Cửa hàng không mở 24/7 thì không có ca đêm.</summary>
    public static bool Runs(Store store, ShiftType type) => type != ShiftType.Night || store.OpenHours == "24/7";

    /// <summary>Thứ Hai của tuần chứa ngày này.</summary>
    public static DateTime WeekStart(DateTime date) => date.Date.AddDays(-(((int)date.DayOfWeek + 6) % 7));

    /// <summary>Tiền mặt bán tại quầy của cửa hàng trong khung giờ (không tính đơn huỷ); có employeeId thì chỉ đơn người đó bán.</summary>
    public async Task<CashSales> CashSalesAsync(string storeId, DateTime start, DateTime end, string? employeeId = null)
    {
        var orders = db.Orders.Where(o => o.StoreId == storeId && o.Channel == SalesChannel.InStore
            && o.PaymentMethod == PaymentMethod.Cash && o.Status != OrderStatus.Cancelled
            && o.CreatedAt >= start && o.CreatedAt < end && (employeeId == null || o.EmployeeId == employeeId));
        return new CashSales(await orders.SumAsync(o => (long)o.Total), await orders.CountAsync());
    }

    /// <summary>
    /// Tiền mặt thuộc về két của một ca. Ca một mình một khung giờ thì là mọi đơn tiền mặt của cửa hàng trong
    /// khung đó (như bản Next.js); khung giờ có thêm người vào ca phụ ở quầy thì mỗi người chỉ tính đơn mình
    /// bán, để không cộng trùng một đơn vào nhiều két.
    /// </summary>
    public async Task<CashSales> ShiftCashAsync(Shift shift)
    {
        var (start, end) = Window(shift);
        var shared = await db.Shifts.AnyAsync(s => s.Id != shift.Id && s.StoreId == shift.StoreId && s.Date == shift.Date
                                                   && s.Type == shift.Type && s.Status != ShiftStatus.Absent);
        return await CashSalesAsync(shift.StoreId, start, end, shared ? shift.EmployeeId : null);
    }

    // ------------------------------------------------------------------ xếp lịch

    /// <summary>Xếp (hoặc đổi) người cho một ô lịch còn chưa kết thúc.</summary>
    public async Task<ShiftResult> AssignAsync(string storeId, DateTime date, ShiftType type, string? employeeId, DateTime now)
    {
        var store = await db.Stores.FindAsync(storeId);
        if (store is null) return ShiftResult.Fail("Không tìm thấy cửa hàng");
        if (!Runs(store, type)) return ShiftResult.Fail("Cửa hàng không mở ca đêm");
        var (_, end) = Window(date, type);
        if (now >= end) return ShiftResult.Fail("Ca này đã qua, không xếp người được nữa");
        if (string.IsNullOrEmpty(employeeId)) return ShiftResult.Fail("Chọn nhân viên cho ca này");
        var employee = await db.Employees.FindAsync(employeeId);
        if (employee is null || employee.StoreId != storeId || employee.Status != EmployeeStatus.Active)
            return ShiftResult.Fail("Nhân viên này không đang làm việc tại cửa hàng");

        var id = SlotId(store.Code, date, type);
        var shift = await db.Shifts.FindAsync(id);
        if (shift is not null && shift.Status != ShiftStatus.Scheduled)
            return ShiftResult.Fail("Ca này đã vào ca hoặc đã chốt, không đổi người được");
        if (shift is null)
        {
            shift = new Shift { Id = id, StoreId = storeId, Date = date.Date, Type = type };
            db.Shifts.Add(shift);
        }
        shift.EmployeeId = employeeId;
        shift.Status = ShiftStatus.Scheduled;
        await db.SaveChangesAsync();
        return new ShiftResult(true, shift, null);
    }

    /// <summary>Xoá ca chưa vào: ô lịch trống lại.</summary>
    public async Task<ShiftResult> DeleteAsync(string shiftId)
    {
        var shift = await db.Shifts.FindAsync(shiftId);
        if (shift is null) return ShiftResult.Fail("Không tìm thấy ca");
        if (shift.Status != ShiftStatus.Scheduled) return ShiftResult.Fail("Chỉ xoá được ca chưa vào");
        db.Shifts.Remove(shift);
        await db.SaveChangesAsync();
        return new ShiftResult(true, shift, null);
    }

    /// <summary>Ghi nhận vắng: ca đã bắt đầu mà nhân viên chưa vào.</summary>
    public async Task<ShiftResult> MarkAbsentAsync(string shiftId, DateTime now)
    {
        var shift = await db.Shifts.FindAsync(shiftId);
        if (shift is null) return ShiftResult.Fail("Không tìm thấy ca");
        if (shift.Status != ShiftStatus.Scheduled) return ShiftResult.Fail("Chỉ đánh dấu vắng được ca chưa vào");
        if (now < Window(shift).Start) return ShiftResult.Fail("Ca chưa bắt đầu");
        shift.Status = ShiftStatus.Absent;
        await db.SaveChangesAsync();
        return new ShiftResult(true, shift, null);
    }

    // ------------------------------------------------------------------ vào ca, kết ca

    /// <summary>Tiền đầu ca gợi ý: tiền cuối ca của ca đã chốt gần nhất trước đó tại cửa hàng, không có thì quỹ chuẩn.</summary>
    public async Task<(int Amount, bool FromPrevious)> SuggestedOpeningAsync(string storeId, DateTime before)
    {
        var previous = await db.Shifts
            .Where(s => s.StoreId == storeId && s.Status == ShiftStatus.Completed && s.ClosingCash != null && s.CheckOutAt <= before)
            .OrderByDescending(s => s.CheckOutAt)
            .FirstOrDefaultAsync();
        return previous?.ClosingCash is int cash ? (cash, true) : (DefaultOpeningCash, false);
    }

    public static string? OpeningCashError(int? amount) => amount switch
    {
        null => "Nhập số tiền đầu ca",
        < 0 => "Số tiền không hợp lệ",
        > MaxOpeningCash => "Tiền đầu ca tối đa 50.000.000 ₫",
        _ => null,
    };

    /// <summary>Vào ca theo lịch (quản lý vào hộ hoặc nhân viên tự vào): từ 30 phút trước giờ bắt đầu tới hết ca.</summary>
    public async Task<ShiftResult> CheckInAsync(string shiftId, int? openingCash, DateTime now)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var shift = await db.Shifts.FindAsync(shiftId);
        if (shift is null) return ShiftResult.Fail("Không tìm thấy ca");
        if (shift.Status != ShiftStatus.Scheduled) return ShiftResult.Fail("Ca này không ở trạng thái chờ vào ca");
        var (start, end) = Window(shift);
        if (now < start.AddMinutes(-EarlyCheckInMinutes)) return ShiftResult.Fail($"Chỉ vào ca được từ {start.AddMinutes(-EarlyCheckInMinutes):HH:mm}");
        if (now >= end) return ShiftResult.Fail("Ca đã kết thúc, không vào ca được nữa");
        if (OpeningCashError(openingCash) is string error) return ShiftResult.Fail(error);
        shift.Status = ShiftStatus.InProgress;
        shift.CheckInAt = now;
        shift.OpeningCash = openingCash;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new ShiftResult(true, shift, null);
    }

    /// <summary>
    /// Kết ca với số tiền đếm được. Chốt ca ở khu quản lý bắt buộc ghi chú khi lệch tiền (tối thiểu 5 ký
    /// tự); kết ca ở máy bán hàng thì ghi chú không bắt buộc, giống bản Next.js.
    /// </summary>
    public async Task<ShiftResult> CheckOutAsync(string shiftId, int? closingCash, string? note, bool requireNoteWhenOff, DateTime now)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var shift = await db.Shifts.FindAsync(shiftId);
        if (shift is null) return ShiftResult.Fail("Không tìm thấy ca");
        if (shift.Status != ShiftStatus.InProgress) return ShiftResult.Fail("Ca này không đang làm");
        if (closingCash is null) return ShiftResult.Fail(requireNoteWhenOff ? "Nhập số tiền đếm được" : "Nhập số tiền mặt đếm được trong két");
        if (closingCash < 0) return ShiftResult.Fail("Số tiền không hợp lệ");
        if (closingCash > MaxClosingCash) return ShiftResult.Fail("Số tiền quá lớn");
        note = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        if (note?.Length > 200) return ShiftResult.Fail("Ghi chú tối đa 200 ký tự");
        if (requireNoteWhenOff)
        {
            var expected = await ExpectedAsync(shift);
            if (expected is long e && closingCash != e && (note?.Length ?? 0) < 5)
                return ShiftResult.Fail("Tiền két bị lệch: ghi rõ lý do (tối thiểu 5 ký tự)");
        }
        shift.Status = ShiftStatus.Completed;
        shift.CheckOutAt = now;
        shift.ClosingCash = closingCash;
        if (note is not null) shift.Note = note;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new ShiftResult(true, shift, null);
    }

    /// <summary>Tiền dự kiến trong két của ca (theo khung giờ của ca); null khi chưa vào ca.</summary>
    public async Task<long?> ExpectedAsync(Shift shift)
    {
        if (shift.OpeningCash is not int opening) return null;
        return opening + (await ShiftCashAsync(shift)).Amount;
    }

    public static (string Label, string Tone) DifferenceBadge(long difference) => difference switch
    {
        0 => ("Khớp", "fresh"),
        > 0 => ($"Thừa {Money.Format(difference)}", "warning"),
        _ => ($"Thiếu {Money.Format(-difference)}", "danger"),
    };

    // ------------------------------------------------------------------ ca ở máy bán hàng

    /// <summary>Ca đang làm của nhân viên tại cửa hàng (ngày nào cũng được).</summary>
    public Task<Shift?> CurrentAsync(string employeeId, string storeId) =>
        db.Shifts.Where(s => s.EmployeeId == employeeId && s.StoreId == storeId && s.Status == ShiftStatus.InProgress)
            .OrderByDescending(s => s.CheckInAt).FirstOrDefaultAsync();

    /// <summary>
    /// Vào ca từ máy bán hàng theo giờ hiện tại. Có lịch thì dùng ca đã xếp; ô lịch còn trống thì tạo ca
    /// mới đúng ô đó; ô đã có người khác thì tạo ca phụ riêng cho người này (không ghi đè lịch).
    /// </summary>
    public async Task<ShiftResult> PosCheckInAsync(Employee employee, Store store, int? openingCash, DateTime now)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        if (OpeningCashError(openingCash) is string error) return ShiftResult.Fail(error == "Nhập số tiền đầu ca" ? "Nhập tiền đầu ca" : error);
        if (await CurrentAsync(employee.Id, store.Id) is not null) return ShiftResult.Fail("Bạn đang trong ca rồi");
        var (date, type) = SlotAt(now);
        var slotId = SlotId(store.Code, date, type);
        var shift = await db.Shifts.FindAsync(slotId);
        if (shift is null)
        {
            shift = new Shift { Id = slotId, StoreId = store.Id, EmployeeId = employee.Id, Date = date, Type = type };
            db.Shifts.Add(shift);
        }
        else if (shift.EmployeeId != employee.Id || shift.Status != ShiftStatus.Scheduled)
        {
            // Ca phụ của riêng người này; đã kết ca rồi mà vào lại (giống bản Next.js) thì mở thêm ca mới.
            var baseId = $"{slotId}-{employee.Code.ToLowerInvariant()}";
            var candidate = baseId;
            shift = await db.Shifts.FindAsync(candidate);
            for (var n = 2; shift is not null && shift.Status != ShiftStatus.Scheduled; n++)
            {
                candidate = $"{baseId}-{n}";
                shift = await db.Shifts.FindAsync(candidate);
            }
            if (shift is null)
            {
                shift = new Shift { Id = candidate, StoreId = store.Id, EmployeeId = employee.Id, Date = date, Type = type };
                db.Shifts.Add(shift);
            }
        }
        shift.Status = ShiftStatus.InProgress;
        shift.CheckInAt = now;
        shift.OpeningCash = openingCash;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new ShiftResult(true, shift, null);
    }

    /// <summary>Số liệu ca đang làm ở máy bán hàng: đơn do chính nhân viên này bán từ lúc vào ca.</summary>
    public async Task<PosShiftSummary> PosSummaryAsync(Shift shift)
    {
        var orders = await db.Orders
            .Where(o => o.StoreId == shift.StoreId && o.EmployeeId == shift.EmployeeId && o.Channel == SalesChannel.InStore
                        && o.Status != OrderStatus.Cancelled && o.CreatedAt >= shift.CheckInAt)
            .Select(o => new { o.Total, o.PaymentMethod })
            .ToListAsync();
        var cash = orders.Where(o => o.PaymentMethod == PaymentMethod.Cash).Sum(o => (long)o.Total);
        var other = orders.Where(o => o.PaymentMethod != PaymentMethod.Cash).Sum(o => (long)o.Total);
        return new PosShiftSummary(orders.Count, shift.OpeningCash ?? 0, cash, other, (shift.OpeningCash ?? 0) + cash);
    }
}

public record PosShiftSummary(int Orders, int OpeningCash, long Cash, long NonCash, long Expected);
