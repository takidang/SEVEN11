using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>
/// Đổi mật khẩu (nhân viên, khách), bắt đổi mật khẩu được cấp, quản trị đặt lại mật khẩu nhân viên.
/// Mỗi bài dựng cơ sở dữ liệu SQLite trong bộ nhớ riêng.
/// </summary>
public sealed class PasswordTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly AppDbContext _db;
    private readonly PasswordService _passwords;
    private static readonly Actor Admin = new("em-admin", StaffRole.Admin, null);

    public PasswordTests()
    {
        _connection.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _db.Stores.Add(new Store { Id = "st-1", Code = "1001", Name = "Một" });
        var hash = PasswordHasher.Hash("123456");
        _db.Employees.AddRange(
            new Employee { Id = "em-admin", Code = "NV0001", FullName = "Quản Trị", Email = "admin@demo", Role = StaffRole.Admin, PasswordHash = hash },
            new Employee { Id = "em-1", Code = "NV0002", FullName = "Thu Ngân", Email = "tn@demo", Role = StaffRole.Cashier, StoreId = "st-1", PasswordHash = hash, MustChangePassword = true });
        _db.Customers.Add(new Customer { Id = "cu-1", FullName = "Khách", Phone = "0901234567", PasswordHash = hash });
        _db.SaveChanges();
        _db.ChangeTracker.Clear();
        _passwords = new PasswordService(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<Employee> Employee(string id)
    {
        _db.ChangeTracker.Clear();
        return await _db.Employees.AsNoTracking().FirstAsync(e => e.Id == id);
    }

    [Fact]
    public async Task Employee_change_checks_current_length_confirm_and_difference()
    {
        var wrong = await _passwords.ChangeEmployeeAsync("em-1", "sai", "abcdef", "abcdef");
        Assert.Equal("Mật khẩu hiện tại không đúng", wrong.Of("Current"));

        var weak = await _passwords.ChangeEmployeeAsync("em-1", "123456", "abc", "abd");
        Assert.Equal("Mật khẩu tối thiểu 6 ký tự", weak.Of("Password"));
        Assert.Equal("Mật khẩu nhập lại không khớp", weak.Of("Confirm"));

        var same = await _passwords.ChangeEmployeeAsync("em-1", "123456", "123456", "123456");
        Assert.Equal("Mật khẩu mới phải khác mật khẩu hiện tại", same.Of("Password"));

        Assert.True((await Employee("em-1")).MustChangePassword);
    }

    [Fact]
    public async Task Employee_change_clears_the_must_change_flag()
    {
        var errors = await _passwords.ChangeEmployeeAsync("em-1", "123456", "matkhau-moi", "matkhau-moi");
        Assert.Empty(errors);
        var employee = await Employee("em-1");
        Assert.False(employee.MustChangePassword);
        Assert.True(PasswordHasher.Verify("matkhau-moi", employee.PasswordHash));
        Assert.False(PasswordHasher.Verify("123456", employee.PasswordHash));
    }

    [Fact]
    public async Task Customer_change_needs_current_password()
    {
        Assert.Equal("Nhập mật khẩu hiện tại", (await _passwords.ChangeCustomerAsync("cu-1", "", "abcdef", "abcdef")).Of("Current"));
        Assert.Empty(await _passwords.ChangeCustomerAsync("cu-1", "123456", "abcdef", "abcdef"));
        _db.ChangeTracker.Clear();
        var customer = await _db.Customers.AsNoTracking().FirstAsync(c => c.Id == "cu-1");
        Assert.True(PasswordHasher.Verify("abcdef", customer.PasswordHash));
    }

    [Fact]
    public async Task Admin_reset_issues_a_temp_password_that_must_be_changed()
    {
        await _passwords.ChangeEmployeeAsync("em-1", "123456", "matkhau-moi", "matkhau-moi");

        var reset = await _passwords.ResetEmployeeAsync(Admin, "em-1");
        Assert.True(reset.Ok, reset.Error);
        Assert.Equal(PasswordService.TempLength, reset.TempPassword!.Length);
        var employee = await Employee("em-1");
        Assert.True(employee.MustChangePassword);
        Assert.True(PasswordHasher.Verify(reset.TempPassword, employee.PasswordHash));
        Assert.False(PasswordHasher.Verify("matkhau-moi", employee.PasswordHash));
    }

    [Fact]
    public async Task Only_admin_resets_and_never_for_self()
    {
        var manager = new Actor("em-ql", StaffRole.Manager, "st-1");
        Assert.Equal("Chỉ quản trị chuỗi được đặt lại mật khẩu", (await _passwords.ResetEmployeeAsync(manager, "em-1")).Error);
        Assert.Equal("Đổi mật khẩu của bạn ở menu tài khoản", (await _passwords.ResetEmployeeAsync(Admin, "em-admin")).Error);
        Assert.Equal("Không tìm thấy nhân viên", (await _passwords.ResetEmployeeAsync(Admin, "em-khong-co")).Error);
    }

    [Fact]
    public async Task New_employee_must_change_the_default_password()
    {
        var (created, _) = await new ChainAdminService(_db).SaveEmployeeAsync(
            new EmployeeInput { FullName = "Người Mới", Phone = "0903333333", Email = "moi@demo.vn", StoreId = "st-1", HiredAt = DateTime.Today }, Admin, DateTime.Now);
        Assert.True(created.Ok, string.Join("; ", created.Errors.Values));
        Assert.True(created.Value!.MustChangePassword);
    }
}
