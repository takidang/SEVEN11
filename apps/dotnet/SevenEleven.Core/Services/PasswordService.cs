using System.Security.Cryptography;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>Kết quả quản trị đặt lại mật khẩu: mật khẩu tạm chỉ hiện một lần cho người đặt lại.</summary>
public record PasswordReset(bool Ok, string? Error, string? TempPassword);

/// <summary>
/// Đổi mật khẩu cho nhân viên và khách, quản trị đặt lại mật khẩu nhân viên. Luật chung: mật khẩu mới
/// 6–64 ký tự, nhập lại phải khớp, khác mật khẩu đang dùng. Nhân viên mới và nhân viên vừa được đặt lại
/// dùng mật khẩu do người khác cấp nên bị bắt đổi ở lần đăng nhập tới.
/// </summary>
public class PasswordService(AppDbContext db)
{
    public const int MinLength = 6;
    public const int MaxLength = 64;
    public const int TempLength = 8;
    /// <summary>Bỏ các ký tự dễ đọc nhầm (0/O, 1/l/I) vì mật khẩu tạm được đọc cho nhân viên chép lại.</summary>
    private const string TempAlphabet = "abcdefghijkmnpqrstuvwxyz23456789";

    /// <summary>Kiểm tra mật khẩu mới và ô nhập lại; khoá lỗi: "Password", "Confirm".</summary>
    public static FormErrors ValidateNew(string? password, string? confirm)
    {
        var errors = new FormErrors();
        if ((password ?? "").Length < MinLength) errors.Set("Password", $"Mật khẩu tối thiểu {MinLength} ký tự");
        else if (password!.Length > MaxLength) errors.Set("Password", $"Mật khẩu tối đa {MaxLength} ký tự");
        if (string.IsNullOrEmpty(confirm)) errors.Set("Confirm", "Nhập lại mật khẩu mới");
        else if (confirm != password) errors.Set("Confirm", "Mật khẩu nhập lại không khớp");
        return errors;
    }

    /// <summary>Nhân viên tự đổi mật khẩu (cả lần bắt buộc đầu tiên). Khoá lỗi: "Current", "Password", "Confirm".</summary>
    public async Task<FormErrors> ChangeEmployeeAsync(string employeeId, string? current, string? password, string? confirm)
    {
        var employee = await db.Employees.FindAsync(employeeId);
        var errors = Check(employee?.PasswordHash, current, password, confirm);
        if (employee is null || errors.Count > 0) return errors;
        employee.PasswordHash = PasswordHasher.Hash(password!);
        employee.MustChangePassword = false;
        await db.SaveChangesAsync();
        return errors;
    }

    /// <summary>Khách đổi mật khẩu trong trang tài khoản. Khoá lỗi như của nhân viên.</summary>
    public async Task<FormErrors> ChangeCustomerAsync(string customerId, string? current, string? password, string? confirm)
    {
        var customer = await db.Customers.FindAsync(customerId);
        var errors = Check(customer?.PasswordHash, current, password, confirm);
        if (customer is null || errors.Count > 0) return errors;
        customer.PasswordHash = PasswordHasher.Hash(password!);
        await db.SaveChangesAsync();
        return errors;
    }

    /// <summary>
    /// Quản trị đặt lại mật khẩu cho nhân viên khác: cấp mật khẩu tạm ngẫu nhiên và bắt đổi ở lần đăng
    /// nhập tới. Không đặt lại cho chính mình — tự đổi ở menu tài khoản.
    /// </summary>
    public async Task<PasswordReset> ResetEmployeeAsync(Actor actor, string employeeId)
    {
        if (actor.Role != StaffRole.Admin) return new(false, "Chỉ quản trị chuỗi được đặt lại mật khẩu", null);
        if (actor.Id == employeeId) return new(false, "Đổi mật khẩu của bạn ở menu tài khoản", null);
        var employee = await db.Employees.FindAsync(employeeId);
        if (employee is null) return new(false, "Không tìm thấy nhân viên", null);

        var temp = RandomNumberGenerator.GetString(TempAlphabet, TempLength);
        employee.PasswordHash = PasswordHasher.Hash(temp);
        employee.MustChangePassword = true;
        await db.SaveChangesAsync();
        return new(true, null, temp);
    }

    private static FormErrors Check(string? hash, string? current, string? password, string? confirm)
    {
        var errors = new FormErrors();
        if (string.IsNullOrEmpty(current)) errors.Set("Current", "Nhập mật khẩu hiện tại");
        else if (!PasswordHasher.Verify(current, hash)) errors.Set("Current", "Mật khẩu hiện tại không đúng");
        foreach (var (k, v) in ValidateNew(password, confirm)) errors.Set(k, v);
        if (!errors.ContainsKey("Password") && password == current) errors.Set("Password", "Mật khẩu mới phải khác mật khẩu hiện tại");
        return errors;
    }
}
