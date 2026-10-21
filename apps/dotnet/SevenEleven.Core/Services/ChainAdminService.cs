using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public class SupplierInput
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public string? TaxCode { get; set; }
    public string? Address { get; set; }
    public string? ContactName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public List<string> CategoryIds { get; set; } = [];
    public bool IsActive { get; set; } = true;

    public static SupplierInput From(Supplier s) => new()
    {
        Id = s.Id, Name = s.Name, TaxCode = s.TaxCode, Address = s.Address, ContactName = s.ContactName, Phone = s.Phone,
        Email = s.Email, CategoryIds = [.. PricingService.Split(s.CategoryIds)], IsActive = s.Status == SupplierStatus.Active,
    };
}

public class StoreInput
{
    public string? Id { get; set; }
    public string? Code { get; set; }
    public string? Name { get; set; }
    public string? Address { get; set; }
    public string? Ward { get; set; }
    public string? Province { get; set; } = "TP Hồ Chí Minh";
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? OpenHours { get; set; } = "24/7";
    public StoreStatus Status { get; set; } = StoreStatus.Active;
    public string? ManagerId { get; set; }
    public string? Lat { get; set; }
    public string? Lng { get; set; }

    public static StoreInput From(Store s) => new()
    {
        Id = s.Id, Code = s.Code, Name = s.Name, Address = s.Address, Ward = s.Ward, Province = s.Province, Phone = s.Phone,
        Email = s.Email, OpenHours = s.OpenHours, Status = s.Status, ManagerId = s.ManagerId,
        Lat = s.Lat.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture),
        Lng = s.Lng.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture),
    };
}

public class EmployeeInput
{
    public string? Id { get; set; }
    public string? FullName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public StaffRole Role { get; set; } = StaffRole.Cashier;
    public string? StoreId { get; set; }
    public EmployeeStatus Status { get; set; } = EmployeeStatus.Active;
    public DateTime? HiredAt { get; set; }

    public static EmployeeInput From(Employee e) => new()
    {
        Id = e.Id, FullName = e.FullName, Phone = e.Phone, Email = e.Email, Role = e.Role, StoreId = e.StoreId, Status = e.Status, HiredAt = e.HiredAt,
    };
}

/// <summary>Người đang thao tác ở khu quản lý (để áp quyền: quản lý chỉ thêm/sửa thu ngân cửa hàng mình).</summary>
public record Actor(string Id, StaffRole Role, string? StoreId);

/// <summary>
/// Danh mục dùng chung của chuỗi: nhà cung cấp, cửa hàng, nhân viên. Chuyển từ nha-cung-cap,
/// cua-hang và nhan-vien của bản Next.js, giữ nguyên từng luật kiểm tra và câu báo lỗi.
/// </summary>
public partial class ChainAdminService(AppDbContext db)
{
    public static readonly string[] Provinces =
        ["TP Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Đồng Nai", "Khánh Hòa", "Lâm Đồng", "Quảng Ninh"];

    public static readonly (string Value, string Label)[] OpenHourOptions =
        [("24/7", "24/7 (mở cả ca đêm)"), ("06:00 - 24:00", "06:00 - 24:00"), ("06:00 - 22:00", "06:00 - 22:00"), ("07:00 - 23:00", "07:00 - 23:00")];

    [GeneratedRegex(@"^\d{10}$")] private static partial Regex TaxCodePattern();
    [GeneratedRegex(@"^\d{4}$")] private static partial Regex StoreCodePattern();
    [GeneratedRegex(@"^0\d{9,10}$")] private static partial Regex LandlinePattern();
    [GeneratedRegex(@"^0\d{9}$")] private static partial Regex MobilePattern();
    [GeneratedRegex(@"^NCC(\d+)$")] private static partial Regex SupplierCode();
    [GeneratedRegex(@"^NV(\d+)$")] private static partial Regex EmployeeCode();

    public static string RoleLabel(StaffRole r) => Labels.Role(r);

    public static string EmployeeStatusLabel(EmployeeStatus s) => s switch
    {
        EmployeeStatus.Active => "Đang làm",
        EmployeeStatus.OnLeave => "Nghỉ phép",
        _ => "Đã nghỉ",
    };

    public static string EmployeeStatusTone(EmployeeStatus s) => s switch
    {
        EmployeeStatus.Active => "fresh",
        EmployeeStatus.OnLeave => "warning",
        _ => "neutral",
    };

    // ------------------------------------------------------------------ nhà cung cấp

    public async Task<SaveResult<Supplier>> SaveSupplierAsync(SupplierInput input)
    {
        var errors = new FormErrors();
        var name = input.Name?.Trim() ?? "";
        if (name.Length < 3) errors.Set(nameof(input.Name), "Tên nhà cung cấp cần ít nhất 3 ký tự");
        else if (name.Length > 120) errors.Set(nameof(input.Name), "Tối đa 120 ký tự");
        var tax = input.TaxCode?.Trim() ?? "";
        if (!TaxCodePattern().IsMatch(tax)) errors.Set(nameof(input.TaxCode), "Mã số thuế gồm đúng 10 chữ số");
        var address = input.Address?.Trim() ?? "";
        if (address.Length < 5) errors.Set(nameof(input.Address), "Nhập địa chỉ nhà cung cấp");
        else if (address.Length > 200) errors.Set(nameof(input.Address), "Tối đa 200 ký tự");
        var contact = input.ContactName?.Trim() ?? "";
        if (contact.Length < 2) errors.Set(nameof(input.ContactName), "Nhập tên người liên hệ");
        else if (contact.Length > 60) errors.Set(nameof(input.ContactName), "Tối đa 60 ký tự");
        var phone = Regex.Replace(input.Phone ?? "", @"[\s.\-]", "");
        if (!LandlinePattern().IsMatch(phone)) errors.Set(nameof(input.Phone), "Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0");
        var email = input.Email?.Trim() ?? "";
        if (!Text.IsEmail(email)) errors.Set(nameof(input.Email), "Email không hợp lệ");
        var categories = await db.Categories.Where(c => input.CategoryIds.Contains(c.Id)).OrderBy(c => c.SortOrder).Select(c => c.Id).ToListAsync();
        if (categories.Count == 0) errors.Set(nameof(input.CategoryIds), "Chọn ít nhất một danh mục cung cấp");
        if (errors.Of(nameof(input.TaxCode)) is null)
        {
            var other = await db.Suppliers.FirstOrDefaultAsync(s => s.Id != input.Id && s.TaxCode == tax);
            if (other is not null) errors.Set(nameof(input.TaxCode), $"Mã số thuế đã dùng cho {other.Name}");
        }
        if (errors.Count > 0) return SaveResult<Supplier>.Fail(errors);

        var supplier = input.Id is null ? null : await db.Suppliers.FindAsync(input.Id);
        if (supplier is null)
        {
            var codes = await db.Suppliers.Select(s => s.Code).ToListAsync();
            var next = codes.Select(c => SupplierCode().Match(c)).Where(m => m.Success).Select(m => int.Parse(m.Groups[1].Value)).DefaultIfEmpty(0).Max() + 1;
            supplier = new Supplier { Id = "sup-" + Text.Random(8), Code = $"NCC{next:000}" };
            db.Suppliers.Add(supplier);
        }
        supplier.Name = name;
        supplier.TaxCode = tax;
        supplier.Address = address;
        supplier.ContactName = contact;
        supplier.Phone = phone;
        supplier.Email = email;
        supplier.CategoryIds = string.Join(",", categories);
        supplier.Status = input.IsActive ? SupplierStatus.Active : SupplierStatus.Inactive;
        await db.SaveChangesAsync();
        return new SaveResult<Supplier>(supplier, errors);
    }

    // ------------------------------------------------------------------ cửa hàng

    public async Task<SaveResult<Store>> SaveStoreAsync(StoreInput input, DateTime now)
    {
        var errors = new FormErrors();
        var code = input.Code?.Trim() ?? "";
        if (!StoreCodePattern().IsMatch(code)) errors.Set(nameof(input.Code), "Mã cửa hàng gồm đúng 4 chữ số");
        else if (await db.Stores.AnyAsync(s => s.Id != input.Id && s.Code == code)
                 || (input.Id is null && await db.Stores.AnyAsync(s => s.Id == "st-" + code)))
            errors.Set(nameof(input.Code), $"Mã {code} đã được dùng cho cửa hàng khác");
        var name = input.Name?.Trim() ?? "";
        if (name.Length < 3) errors.Set(nameof(input.Name), "Nhập tên ngắn của cửa hàng");
        else if (name.Length > 60) errors.Set(nameof(input.Name), "Tối đa 60 ký tự");
        var address = input.Address?.Trim() ?? "";
        if (address.Length < 5) errors.Set(nameof(input.Address), "Nhập số nhà, tên đường");
        else if (address.Length > 120) errors.Set(nameof(input.Address), "Tối đa 120 ký tự");
        var ward = input.Ward?.Trim() ?? "";
        if (ward.Length < 3) errors.Set(nameof(input.Ward), "Nhập phường/xã");
        else if (ward.Length > 60) errors.Set(nameof(input.Ward), "Tối đa 60 ký tự");
        if (Text.IsBlank(input.Province)) errors.Set(nameof(input.Province), "Chọn tỉnh/thành phố");
        var phone = input.Phone?.Trim() ?? "";
        if (!LandlinePattern().IsMatch(phone)) errors.Set(nameof(input.Phone), "Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0");
        var email = input.Email?.Trim() ?? "";
        if (!Text.IsEmail(email)) errors.Set(nameof(input.Email), "Email không hợp lệ");
        else if (await db.Stores.AnyAsync(s => s.Id != input.Id && s.Email.ToLower() == email.ToLower()))
            errors.Set(nameof(input.Email), "Email này đã thuộc cửa hàng khác");
        if (Text.IsBlank(input.OpenHours)) errors.Set(nameof(input.OpenHours), "Chọn giờ mở cửa");
        var lat = ParseCoordinate(input.Lat);
        if (lat is null or < 8 or > 24) errors.Set(nameof(input.Lat), "Vĩ độ trong khoảng 8 – 24 (lãnh thổ Việt Nam)");
        var lng = ParseCoordinate(input.Lng);
        if (lng is null or < 102 or > 110) errors.Set(nameof(input.Lng), "Kinh độ trong khoảng 102 – 110 (lãnh thổ Việt Nam)");
        Employee? manager = null;
        if (!Text.IsBlank(input.ManagerId))
        {
            manager = await db.Employees.FirstOrDefaultAsync(e => e.Id == input.ManagerId && e.Role == StaffRole.Manager && e.Status != EmployeeStatus.Inactive);
            if (manager is null) errors.Set(nameof(input.ManagerId), "Chọn quản lý trong danh sách");
        }
        if (errors.Count > 0) return SaveResult<Store>.Fail(errors);

        var store = input.Id is null ? null : await db.Stores.FindAsync(input.Id);
        var isNew = store is null;
        if (store is null)
        {
            store = new Store { Id = "st-" + code, OpenedAt = now.Date };
            db.Stores.Add(store);
        }
        store.Code = code;
        store.Name = name;
        store.Address = address;
        store.Ward = ward;
        store.Province = input.Province!.Trim();
        store.Phone = phone;
        store.Email = email;
        store.OpenHours = input.OpenHours!;
        store.Status = input.Status;
        store.Lat = lat!.Value;
        store.Lng = lng!.Value;

        // Chọn quản lý của cửa hàng khác: điều chuyển người đó sang, cửa hàng cũ chưa có quản lý.
        if (manager is not null && manager.StoreId != store.Id)
        {
            var oldStores = await db.Stores.Where(s => s.ManagerId == manager.Id && s.Id != store.Id).ToListAsync();
            foreach (var old in oldStores) old.ManagerId = null;
            manager.StoreId = store.Id;
        }
        store.ManagerId = manager?.Id;

        if (isNew)
        {
            var productIds = await db.Products.Select(p => p.Id).ToListAsync();
            db.StockLevels.AddRange(productIds.Select(id => new StockLevel { StoreId = store.Id, ProductId = id, Quantity = 0, MinQuantity = InventoryService.DefaultMinQuantity }));
        }
        await db.SaveChangesAsync();
        return new SaveResult<Store>(store, errors);
    }

    private static double? ParseCoordinate(string? value) =>
        double.TryParse(value?.Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null;

    // ------------------------------------------------------------------ nhân viên

    /// <summary>Quản trị sửa được mọi người; quản lý chỉ sửa được thu ngân của cửa hàng mình (không tự sửa mình).</summary>
    public static bool CanEdit(Actor actor, Employee target) =>
        actor.Role == StaffRole.Admin || (actor.Role == StaffRole.Manager && target.Role == StaffRole.Cashier && target.StoreId == actor.StoreId && target.Id != actor.Id);

    public async Task<(SaveResult<Employee> Result, int OrphanShifts)> SaveEmployeeAsync(EmployeeInput input, Actor actor, DateTime now)
    {
        var errors = new FormErrors();
        var existing = input.Id is null ? null : await db.Employees.FindAsync(input.Id);
        if (input.Id is not null && (existing is null || !CanEdit(actor, existing)))
        {
            errors.Set(nameof(input.FullName), "Bạn chỉ xem được thông tin nhân viên này.");
            return (SaveResult<Employee>.Fail(errors), 0);
        }
        var self = existing?.Id == actor.Id;

        var name = input.FullName?.Trim() ?? "";
        if (name.Length < 2) errors.Set(nameof(input.FullName), "Nhập họ tên nhân viên");
        else if (name.Length > 60) errors.Set(nameof(input.FullName), "Tối đa 60 ký tự");
        var phone = Text.Digits(input.Phone);
        if (!MobilePattern().IsMatch(phone)) errors.Set(nameof(input.Phone), "Số di động gồm 10 chữ số, bắt đầu bằng 0");
        var email = input.Email?.Trim().ToLowerInvariant() ?? "";
        if (!Text.IsEmail(email)) errors.Set(nameof(input.Email), "Email không hợp lệ");
        else if (await db.Employees.AnyAsync(e => e.Id != input.Id && e.Email.ToLower() == email))
            errors.Set(nameof(input.Email), "Email này đã được dùng cho nhân viên khác");

        // Quản lý chỉ gán vai trò thu ngân, và chỉ cho cửa hàng của mình; quản trị không tự đổi vai trò hay khoá mình.
        var role = self ? existing!.Role : input.Role;
        var status = self ? existing!.Status : input.Status;
        var allowed = actor.Role == StaffRole.Admin ? new[] { StaffRole.Admin, StaffRole.Manager, StaffRole.Cashier } : [StaffRole.Cashier];
        if (!allowed.Contains(role) && existing?.Role != role) errors.Set(nameof(input.Role), "Bạn không được gán vai trò này");
        var storeId = role == StaffRole.Admin ? null : actor.Role == StaffRole.Manager ? actor.StoreId : input.StoreId;
        if (role != StaffRole.Admin && (Text.IsBlank(storeId) || !await db.Stores.AnyAsync(s => s.Id == storeId)))
            errors.Set(nameof(input.StoreId), "Chọn cửa hàng làm việc");
        if (input.HiredAt is null) errors.Set(nameof(input.HiredAt), "Chọn ngày vào làm");
        else if (input.HiredAt.Value.Date > now.Date.AddDays(30)) errors.Set(nameof(input.HiredAt), "Ngày vào làm không được quá 30 ngày tới");
        if (errors.Count > 0) return (SaveResult<Employee>.Fail(errors), 0);

        var employee = existing;
        if (employee is null)
        {
            var codes = await db.Employees.Select(e => e.Code).ToListAsync();
            var next = codes.Select(c => EmployeeCode().Match(c)).Where(m => m.Success).Select(m => int.Parse(m.Groups[1].Value)).DefaultIfEmpty(0).Max() + 1;
            // Mật khẩu mặc định do người khác cấp: nhân viên phải tự đổi ở lần đăng nhập đầu.
            employee = new Employee
            {
                Id = "em-" + Text.Random(8), Code = $"NV{next:0000}", PasswordHash = PasswordHasher.Hash(SeedData.DemoPassword), MustChangePassword = true,
            };
            db.Employees.Add(employee);
        }
        var wasManagerOf = existing?.Role == StaffRole.Manager && (role != StaffRole.Manager || storeId != existing.StoreId);
        var becomesUnavailable = existing is not null && (status != EmployeeStatus.Active || storeId != existing.StoreId);

        employee.FullName = name;
        employee.Phone = phone;
        employee.Email = email;
        employee.Role = role;
        employee.StoreId = storeId;
        employee.Status = status;
        employee.HiredAt = input.HiredAt!.Value.Date;

        if (wasManagerOf)
        {
            foreach (var store in await db.Stores.Where(s => s.ManagerId == employee.Id).ToListAsync()) store.ManagerId = null;
        }
        var orphans = 0;
        if (becomesUnavailable)
        {
            var today = now.Date;
            orphans = await db.Shifts.CountAsync(s => s.EmployeeId == employee.Id && s.Status == ShiftStatus.Scheduled && s.Date >= today);
        }
        await db.SaveChangesAsync();
        return (new SaveResult<Employee>(employee, errors), orphans);
    }
}
