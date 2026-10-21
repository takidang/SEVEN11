using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>Sai mật khẩu 5 lần liên tiếp thì khoá đăng nhập 15 phút, cho cả nhân viên lẫn khách.</summary>
public sealed class LoginLockoutTests
{
    private static readonly DateTime Now = new(2026, 10, 21, 9, 0, 0);

    [Fact]
    public void Fifth_wrong_password_locks_for_fifteen_minutes()
    {
        var customer = new Customer();
        Assert.Equal("Mật khẩu không đúng", LoginLockout.RecordFailure(customer, Now));
        Assert.Equal("Mật khẩu không đúng, còn 3 lần thử trước khi bị khoá 15 phút", LoginLockout.RecordFailure(customer, Now));
        LoginLockout.RecordFailure(customer, Now);
        Assert.Equal("Mật khẩu không đúng, còn 1 lần thử trước khi bị khoá 15 phút", LoginLockout.RecordFailure(customer, Now));
        Assert.False(LoginLockout.IsLocked(customer, Now));

        var message = LoginLockout.RecordFailure(customer, Now);
        Assert.Equal("Đăng nhập tạm khoá do nhập sai mật khẩu 5 lần liên tiếp. Thử lại sau 15 phút.", message);
        Assert.Equal(Now.AddMinutes(15), customer.LockedUntil);
        Assert.True(LoginLockout.IsLocked(customer, Now.AddMinutes(14).AddSeconds(59)));
        Assert.Equal("Đăng nhập tạm khoá do nhập sai mật khẩu 5 lần liên tiếp. Thử lại sau 1 phút.", LoginLockout.LockedMessage(customer, Now.AddMinutes(14).AddSeconds(1)));
        Assert.False(LoginLockout.IsLocked(customer, Now.AddMinutes(15)));
    }

    [Fact]
    public void After_the_lock_expires_counting_starts_over()
    {
        var employee = new Employee();
        for (var i = 0; i < LoginLockout.MaxAttempts; i++) LoginLockout.RecordFailure(employee, Now);
        Assert.True(LoginLockout.IsLocked(employee, Now));

        var later = Now.AddMinutes(16);
        Assert.Equal("Mật khẩu không đúng", LoginLockout.RecordFailure(employee, later));
        Assert.Null(employee.LockedUntil);
        Assert.Equal(1, employee.FailedLogins);
    }

    [Fact]
    public void Success_clears_the_count_so_only_consecutive_failures_lock()
    {
        var customer = new Customer();
        for (var i = 0; i < 4; i++) LoginLockout.RecordFailure(customer, Now);
        LoginLockout.Clear(customer);
        for (var i = 0; i < 4; i++) LoginLockout.RecordFailure(customer, Now);
        Assert.False(LoginLockout.IsLocked(customer, Now));
        Assert.Equal(4, customer.FailedLogins);
    }

    [Fact]
    public async Task Admin_password_reset_unlocks_the_employee()
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        db.Employees.Add(new Employee
        {
            Id = "em-1", Code = "NV0001", FullName = "Thu Ngân", Email = "tn@demo", Role = StaffRole.Cashier,
            PasswordHash = PasswordHasher.Hash("123456"), LockedUntil = DateTime.Now.AddMinutes(10),
        });
        db.SaveChanges();

        var reset = await new PasswordService(db).ResetEmployeeAsync(new Actor("em-admin", StaffRole.Admin, null), "em-1");
        Assert.True(reset.Ok, reset.Error);
        db.ChangeTracker.Clear();
        var employee = await db.Employees.AsNoTracking().FirstAsync(e => e.Id == "em-1");
        Assert.Null(employee.LockedUntil);
        Assert.Equal(0, employee.FailedLogins);
    }
}
