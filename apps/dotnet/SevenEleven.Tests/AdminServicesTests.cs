using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>
/// Các dịch vụ thêm ở đợt hoàn thiện: OTP giả lập, xét giữ hạng hằng tháng và sao hết hạn, ca làm
/// (vào ca đúng giờ, chốt ca lệch tiền phải ghi chú), form sản phẩm / khuyến mãi / nhà cung cấp /
/// nhân viên / hồ sơ khách. Mỗi bài dựng cơ sở dữ liệu SQLite trong bộ nhớ riêng.
/// </summary>
public sealed class AdminServicesTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly AppDbContext _db;
    private static readonly DateTime Now = new(2026, 10, 6, 10, 0, 0);

    public AdminServicesTests()
    {
        _connection.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _db.Categories.Add(new Category { Id = "snack", Slug = "snack", Name = "Đồ ăn vặt" });
        _db.Subcategories.Add(new Subcategory { Id = "chips", Slug = "chips", Name = "Snack", CategoryId = "snack" });
        _db.Stores.AddRange(
            new Store { Id = "st-1", Code = "1001", Name = "Một", Province = "TP Hồ Chí Minh", OpenHours = "24/7" },
            new Store { Id = "st-2", Code = "1002", Name = "Hai", Province = "Hà Nội", OpenHours = "06:00–23:00" });
        _db.Employees.AddRange(
            new Employee { Id = "em-1", Code = "NV0001", FullName = "Thu Ngân Một", Email = "tn1@demo", Phone = "0901111111", Role = StaffRole.Cashier, StoreId = "st-1" },
            new Employee { Id = "em-2", Code = "NV0002", FullName = "Quản Lý", Email = "ql@demo", Phone = "0902222222", Role = StaffRole.Manager, StoreId = "st-1" });
        _db.Products.Add(new Product { Id = "p1", Slug = "p1", Sku = "7E1001", Barcode = "8930000000017", Name = "Snack có sẵn", CategoryId = "snack", SubcategoryId = "chips", Price = 10_000, CostPrice = 6_000, IsActive = true });
        _db.SaveChanges();
        _db.ChangeTracker.Clear();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    // ---------------------------------------------------------------- OTP

    [Fact]
    public void Otp_code_works_once_and_counts_wrong_attempts()
    {
        var otp = new OtpService();
        var sent = otp.Request("0901234567", OtpPurpose.SignUp, Now);
        Assert.Equal(6, sent.DevCode.Length);
        Assert.Equal("Mã OTP không đúng, còn 4 lần thử", otp.Verify("0901234567", OtpPurpose.SignUp, "000000" == sent.DevCode ? "111111" : "000000", Now).Error);
        Assert.True(otp.Verify("0901234567", OtpPurpose.SignUp, sent.DevCode, Now.AddMinutes(1)).Ok);
        Assert.Equal("Mã OTP không còn hiệu lực, bấm Gửi lại mã", otp.Verify("0901234567", OtpPurpose.SignUp, sent.DevCode, Now.AddMinutes(1)).Error);
    }

    [Fact]
    public void Otp_blocks_after_five_wrong_tries_and_expires_after_five_minutes()
    {
        var otp = new OtpService();
        var sent = otp.Request("0912345678", OtpPurpose.Reset, Now);
        var wrong = sent.DevCode == "123456" ? "654321" : "123456";
        for (var i = 0; i < 5; i++) otp.Verify("0912345678", OtpPurpose.Reset, wrong, Now);
        Assert.Equal("Đã nhập sai 5 lần, bấm Gửi lại mã để nhận mã mới", otp.Verify("0912345678", OtpPurpose.Reset, sent.DevCode, Now).Error);

        var again = otp.Request("0912345678", OtpPurpose.Reset, Now.AddSeconds(61));
        Assert.Contains("đã quá 5 phút", otp.Verify("0912345678", OtpPurpose.Reset, again.DevCode, Now.AddSeconds(61).AddMinutes(6)).Error);
    }

    [Fact]
    public void Otp_resend_inside_sixty_seconds_keeps_the_same_code_and_purposes_are_separate()
    {
        var otp = new OtpService();
        var first = otp.Request("0987654321", OtpPurpose.SignUp, Now);
        Assert.Equal(first.DevCode, otp.Request("0987654321", OtpPurpose.SignUp, Now.AddSeconds(30)).DevCode);
        Assert.Equal(first.SentAt, otp.Request("0987654321", OtpPurpose.SignUp, Now.AddSeconds(59)).SentAt);
        Assert.NotEqual(first.SentAt, otp.Request("0987654321", OtpPurpose.SignUp, Now.AddSeconds(60)).SentAt);
        Assert.False(otp.Verify("0987654321", OtpPurpose.Reset, first.DevCode, Now).Ok);
    }

    // ---------------------------------------------------------------- xét giữ hạng, sao hết hạn

    private Customer Member(string id, MemberTier tier, int spend, string reviewed, string? grace = null) => new()
    {
        Id = id, FullName = id, Phone = "09" + id.GetHashCode().ToString("D8")[^8..], Tier = tier, TierSpend = spend,
        TierSince = Now.AddMonths(-6), ReviewedMonth = reviewed, GraceMonth = grace, JoinedAt = Now.AddYears(-2),
    };

    private void MonthOrder(string customerId, DateTime at, int memberSpend) => _db.Orders.Add(new Order
    {
        Id = $"od-{Guid.NewGuid():N}"[..14], Code = $"DH{Guid.NewGuid():N}"[..12], Channel = SalesChannel.InStore, StoreId = "st-1",
        CustomerId = customerId, Total = memberSpend, Subtotal = memberSpend, MemberSpend = memberSpend,
        Status = OrderStatus.Completed, PaymentStatus = PaymentStatus.Paid, CreatedAt = at, UpdatedAt = at,
    });

    [Fact]
    public async Task Monthly_review_drops_one_tier_resets_spend_and_is_idempotent()
    {
        // Tháng 09/2026: khách Vàng chỉ chi 300.000 (cần 350.000) → 01/10 xuống Bạc, chi tiêu về mốc Bạc.
        _db.Customers.AddRange(
            Member("gold-short", MemberTier.Gold, 3_400_000, "2026-08"),
            Member("gold-ok", MemberTier.Gold, 3_400_000, "2026-08"),
            Member("gold-new", MemberTier.Gold, 3_100_000, "2026-08", grace: "2026-09"),
            Member("bronze", MemberTier.Bronze, 100_000, "2026-08"));
        MonthOrder("gold-short", new DateTime(2026, 9, 10), 300_000);
        MonthOrder("gold-ok", new DateTime(2026, 9, 12), 200_000);
        MonthOrder("gold-ok", new DateTime(2026, 9, 25), 200_000);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        var changed = await new MembershipReviewService(_db).RunAsync(Now);
        _db.ChangeTracker.Clear();
        var c = await _db.Customers.Include(x => x.TierChanges).ToDictionaryAsync(x => x.Id);

        Assert.Equal(1, changed);
        Assert.Equal(MemberTier.Silver, c["gold-short"].Tier);
        Assert.Equal(MembershipService.Tiers[MemberTier.Silver].MinSpend, c["gold-short"].TierSpend);
        var drop = Assert.Single(c["gold-short"].TierChanges);
        Assert.Equal((MemberTier.Gold, MemberTier.Silver), (drop.From, drop.To));
        Assert.Equal(new DateTime(2026, 10, 1), drop.At);
        Assert.Contains("09/2026", drop.Reason);
        Assert.Equal(MemberTier.Gold, c["gold-ok"].Tier);
        Assert.Equal(MemberTier.Gold, c["gold-new"].Tier);
        Assert.Equal(MemberTier.Bronze, c["bronze"].Tier);
        Assert.All(c.Values, x => Assert.Equal("2026-09", x.ReviewedMonth));

        Assert.Equal(0, await new MembershipReviewService(_db).RunAsync(Now));
    }

    [Fact]
    public async Task Stars_older_than_twelve_months_expire_and_the_ledger_still_balances()
    {
        var customer = Member("stars", MemberTier.Bronze, 0, "2026-09");
        customer.Stars = 15;
        _db.Customers.Add(customer);
        _db.StarEntries.AddRange(
            new StarEntry { CustomerId = "stars", At = Now.AddMonths(-13), Delta = 10, Kind = StarEntryKind.Earn, Note = "Cũ" },
            new StarEntry { CustomerId = "stars", At = Now.AddMonths(-1), Delta = 5, Kind = StarEntryKind.Earn, Note = "Mới" });
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        Assert.Equal(1, await new MembershipReviewService(_db).RunAsync(Now));
        _db.ChangeTracker.Clear();
        var after = await _db.Customers.FindAsync("stars");
        Assert.Equal(5, after!.Stars);
        Assert.Equal(5, await _db.StarEntries.Where(e => e.CustomerId == "stars").SumAsync(e => e.Delta));
        Assert.Equal(0, await new MembershipReviewService(_db).RunAsync(Now));
    }

    // ---------------------------------------------------------------- ca làm

    [Fact]
    public async Task Check_in_only_from_thirty_minutes_before_the_shift()
    {
        var shifts = new ShiftService(_db);
        var day = new DateTime(2026, 10, 7);
        var assigned = await shifts.AssignAsync("st-1", day, ShiftType.Afternoon, "em-1", Now);
        Assert.True(assigned.Ok, assigned.Error);

        var early = await shifts.CheckInAsync(assigned.Shift!.Id, 2_000_000, day.AddHours(13));
        Assert.False(early.Ok);
        Assert.Contains("13:30", early.Error);
        Assert.True((await shifts.CheckInAsync(assigned.Shift.Id, 2_000_000, day.AddHours(13).AddMinutes(35))).Ok);
    }

    [Fact]
    public async Task Closing_a_shift_with_missing_cash_needs_a_reason_at_the_back_office()
    {
        var shifts = new ShiftService(_db);
        var day = new DateTime(2026, 10, 7);
        var shift = (await shifts.AssignAsync("st-1", day, ShiftType.Morning, "em-1", Now)).Shift!;
        await shifts.CheckInAsync(shift.Id, 2_000_000, day.AddHours(6));
        MonthOrder(null!, day.AddHours(9), 150_000);
        var order = _db.ChangeTracker.Entries<Order>().Single().Entity;
        order.CustomerId = null;
        order.PaymentMethod = PaymentMethod.Cash;
        await _db.SaveChangesAsync();

        Assert.Equal(2_150_000, await shifts.ExpectedAsync(shift));
        var noReason = await shifts.CheckOutAsync(shift.Id, 2_100_000, "", requireNoteWhenOff: true, day.AddHours(14));
        Assert.Equal("Tiền két bị lệch: ghi rõ lý do (tối thiểu 5 ký tự)", noReason.Error);
        var withReason = await shifts.CheckOutAsync(shift.Id, 2_100_000, "Thối nhầm cho khách", requireNoteWhenOff: true, day.AddHours(14));
        Assert.True(withReason.Ok, withReason.Error);
        Assert.Equal(2_100_000, withReason.Shift!.ClosingCash);
    }

    [Fact]
    public async Task Counter_check_in_cannot_double_up_but_can_reopen_after_closing()
    {
        var shifts = new ShiftService(_db);
        var employee = await _db.Employees.FindAsync("em-1");
        var store = await _db.Stores.FindAsync("st-1");
        var at = new DateTime(2026, 10, 7, 23, 30, 0);

        var first = await shifts.PosCheckInAsync(employee!, store!, 2_000_000, at);
        Assert.True(first.Ok, first.Error);
        Assert.Equal(ShiftType.Night, first.Shift!.Type);
        Assert.Equal("Bạn đang trong ca rồi", (await shifts.PosCheckInAsync(employee!, store!, 2_000_000, at.AddMinutes(5))).Error);

        Assert.True((await shifts.CheckOutAsync(first.Shift.Id, 2_000_000, null, false, at.AddMinutes(30))).Ok);
        var again = await shifts.PosCheckInAsync(employee!, store!, 1_500_000, at.AddMinutes(40));
        Assert.True(again.Ok, again.Error);
        Assert.NotEqual(first.Shift.Id, again.Shift!.Id);
        Assert.Equal(1, await _db.Shifts.CountAsync(s => s.Status == ShiftStatus.InProgress));
    }

    [Fact]
    public async Task A_shared_shift_slot_counts_each_cashiers_own_cash_only()
    {
        var shifts = new ShiftService(_db);
        var day = new DateTime(2026, 10, 7);
        var main = (await shifts.AssignAsync("st-1", day, ShiftType.Morning, "em-1", Now)).Shift!;
        await shifts.CheckInAsync(main.Id, 1_000_000, day.AddHours(6));
        var extra = (await shifts.PosCheckInAsync((await _db.Employees.FindAsync("em-2"))!, (await _db.Stores.FindAsync("st-1"))!, 500_000, day.AddHours(7))).Shift!;
        Assert.NotEqual(main.Id, extra.Id);
        foreach (var (employee, total) in new[] { ("em-1", 120_000), ("em-2", 80_000), ("em-1", 30_000) })
        {
            _db.Orders.Add(new Order
            {
                Id = $"od-{Guid.NewGuid():N}"[..14], Code = $"DH{Guid.NewGuid():N}"[..12], Channel = SalesChannel.InStore, StoreId = "st-1",
                EmployeeId = employee, Total = total, Subtotal = total, PaymentMethod = PaymentMethod.Cash, PaymentStatus = PaymentStatus.Paid,
                Status = OrderStatus.Completed, CreatedAt = day.AddHours(9), UpdatedAt = day.AddHours(9),
            });
        }
        await _db.SaveChangesAsync();

        Assert.Equal(1_150_000, await shifts.ExpectedAsync(main));
        Assert.Equal(580_000, await shifts.ExpectedAsync(extra));
    }

    [Fact]
    public void Night_slot_after_midnight_belongs_to_the_previous_day()
    {
        var (date, type) = ShiftService.SlotAt(new DateTime(2026, 10, 7, 2, 0, 0));
        Assert.Equal((new DateTime(2026, 10, 6), ShiftType.Night), (date, type));
        Assert.Equal((new DateTime(2026, 10, 7), ShiftType.Morning), ShiftService.SlotAt(new DateTime(2026, 10, 7, 6, 0, 0)));
        Assert.False(ShiftService.Runs(new Store { OpenHours = "06:00–23:00" }, ShiftType.Night));
    }

    // ---------------------------------------------------------------- form sản phẩm, khuyến mãi, NCC, nhân viên, khách

    [Fact]
    public async Task New_product_is_validated_and_gets_stock_rows_in_every_store()
    {
        var service = new ProductAdminService(_db);
        var bad = await service.SaveAsync(new ProductInput { Name = "Ab", Price = "0", CostPrice = "x", Sku = "7E1001", Barcode = "123" });
        Assert.False(bad.Ok);
        Assert.Equal("Tên sản phẩm cần ít nhất 3 ký tự", bad.Errors.Of(nameof(ProductInput.Name)));
        Assert.Equal("Giá bán phải lớn hơn 0", bad.Errors.Of(nameof(ProductInput.Price)));
        Assert.Equal("Mã vạch gồm đúng 13 chữ số", bad.Errors.Of(nameof(ProductInput.Barcode)));

        var duplicate = await service.SaveAsync(new ProductInput
        {
            Name = "Snack mới", CategoryId = "snack", SubcategoryId = "chips", Brand = "Oishi", Price = "12000", CostPrice = "7000",
            Sku = "7E1001", Barcode = "8930000000024", Unit = "gói",
        });
        Assert.Equal("SKU này đã được dùng cho sản phẩm khác", duplicate.Errors.Of(nameof(ProductInput.Sku)));

        var ok = await service.SaveAsync(new ProductInput
        {
            Name = "Snack mới", CategoryId = "snack", SubcategoryId = "chips", Brand = "Oishi", Price = "12000", CostPrice = "7000",
            Sku = await service.SuggestSkuAsync(), Barcode = "8930000000024", Unit = "gói",
        });
        Assert.True(ok.Ok, string.Join("; ", ok.Errors.Values));
        _db.ChangeTracker.Clear();
        var rows = await _db.StockLevels.Where(s => s.ProductId == ok.Value!.Id).ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.All(rows, r => Assert.Equal(0, r.Quantity));
    }

    [Fact]
    public async Task Promotion_form_rejects_bad_percent_and_duplicate_codes()
    {
        var service = new PromotionAdminService(_db);
        var input = new PromotionInput
        {
            Type = PromotionType.Percent, Name = "Giảm thử", Code = "GIAMTHU", Value = "95",
            StartDate = Now.Date, EndDate = Now.Date.AddDays(7), Channels = ["online"],
        };
        Assert.Equal("Mức giảm từ 1% đến 90%", (await service.SaveAsync(input, Now)).Errors.Of(nameof(PromotionInput.Value)));
        input.Value = "10";
        var saved = await service.SaveAsync(input, Now);
        Assert.True(saved.Ok, string.Join("; ", saved.Errors.Values));
        _db.ChangeTracker.Clear();

        var again = await service.SaveAsync(new PromotionInput
        {
            Type = PromotionType.Fixed, Name = "Trùng mã", Code = "giamthu", Value = "10000",
            StartDate = Now.Date, EndDate = Now.Date.AddDays(3), Channels = ["online"],
        }, Now);
        Assert.False(again.Ok);
        Assert.NotNull(again.Errors.Of(nameof(PromotionInput.Code)));
    }

    [Fact]
    public async Task Supplier_and_employee_forms_validate_and_number_new_codes()
    {
        var chain = new ChainAdminService(_db);
        var bad = await chain.SaveSupplierAsync(new SupplierInput { Name = "NCC", TaxCode = "123", Phone = "12", Email = "x" });
        Assert.Equal("Mã số thuế gồm đúng 10 chữ số", bad.Errors.Of(nameof(SupplierInput.TaxCode)));
        Assert.NotNull(bad.Errors.Of(nameof(SupplierInput.CategoryIds)));

        var supplier = await chain.SaveSupplierAsync(new SupplierInput
        {
            Name = "Công ty Snack Việt", TaxCode = "0312345678", Address = "1 Lê Lợi, Quận 1", ContactName = "Nguyễn Văn A",
            Phone = "0281234567", Email = "lienhe@snackviet.vn", CategoryIds = ["snack"],
        });
        Assert.True(supplier.Ok, string.Join("; ", supplier.Errors.Values));
        Assert.Matches(@"^NCC\d{3}$", supplier.Value!.Code);

        var admin = new Actor("em-admin", StaffRole.Admin, null);
        var (dupEmail, _) = await chain.SaveEmployeeAsync(new EmployeeInput { FullName = "Người Mới", Phone = "0903333333", Email = "tn1@demo", StoreId = "st-1" }, admin, Now);
        Assert.NotNull(dupEmail.Errors.Of(nameof(EmployeeInput.Email)));
        var (created, _) = await chain.SaveEmployeeAsync(new EmployeeInput { FullName = "Người Mới", Phone = "0903333333", Email = "moi@demo.vn", StoreId = "st-1", HiredAt = Now.Date }, admin, Now);
        Assert.True(created.Ok, string.Join("; ", created.Errors.Values));
        Assert.Equal("NV0003", created.Value!.Code);
        Assert.True(PasswordHasher.Verify("123456", created.Value.PasswordHash!));
    }

    [Fact]
    public async Task Storefront_profile_edit_uses_customer_friendly_messages()
    {
        _db.Customers.Add(Member("profile", MemberTier.Bronze, 0, "2026-09"));
        await _db.SaveChangesAsync();
        var service = new CustomerAdminService(_db);

        var errors = await service.UpdateProfileAsync("profile", "", "khong-email", Now.AddDays(3), Now, storefront: true);
        Assert.Equal("Nhập họ và tên", errors.Of("FullName"));
        Assert.Equal("Email chưa đúng định dạng", errors.Of("Email"));
        Assert.Equal("Ngày sinh không hợp lệ", errors.Of("Birthday"));

        var ok = await service.UpdateProfileAsync("profile", "  Nguyễn  Minh Anh ", "minhanh@example.com", new DateTime(2001, 3, 9), Now, storefront: true);
        Assert.Empty(ok);
        _db.ChangeTracker.Clear();
        var saved = await _db.Customers.FindAsync("profile");
        Assert.Equal("minhanh@example.com", saved!.Email);
        Assert.Equal(new DateTime(2001, 3, 9), saved.Birthday);
    }
}
