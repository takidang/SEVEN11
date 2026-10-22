using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>Lịch sử giá: mỗi lần đổi giá bán hoặc giá vốn ghi một dòng kèm người đổi và thời điểm.</summary>
public sealed class PriceHistoryTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly AppDbContext _db;
    private readonly ProductAdminService _products;
    private static readonly DateTime Now = new(2026, 10, 22, 9, 0, 0);
    private static readonly Actor Admin = new("em-admin", StaffRole.Admin, null);

    public PriceHistoryTests()
    {
        _connection.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _db.Categories.Add(new Category { Id = "snack", Slug = "snack", Name = "Đồ ăn vặt" });
        _db.Subcategories.Add(new Subcategory { Id = "chips", Slug = "chips", Name = "Snack", CategoryId = "snack" });
        _db.Stores.Add(new Store { Id = "st-1", Code = "1001", Name = "Một" });
        _db.Employees.Add(new Employee { Id = "em-admin", Code = "NV0001", FullName = "Nguyễn Minh Quân", Email = "admin@demo", Role = StaffRole.Admin });
        _db.SaveChanges();
        _db.ChangeTracker.Clear();
        _products = new ProductAdminService(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static ProductInput Input(string? id, string price, string cost, string name = "Snack khoai tây") => new()
    {
        Id = id, Name = name, CategoryId = "snack", SubcategoryId = "chips", Brand = "7-Select", Origin = "Việt Nam", Unit = "gói",
        Price = price, CostPrice = cost, Sku = "7E10001", Barcode = "8930000000017",
    };

    private async Task<List<PriceChange>> HistoryAsync(string productId)
    {
        _db.ChangeTracker.Clear();
        return await _db.PriceChanges.AsNoTracking().Where(c => c.ProductId == productId).OrderBy(c => c.Id).ToListAsync();
    }

    [Fact]
    public async Task New_product_records_its_starting_price()
    {
        var created = await _products.SaveAsync(Input(null, "15000", "9000"), Admin, Now);
        Assert.True(created.Ok, string.Join("; ", created.Errors.Values));

        var entry = Assert.Single(await HistoryAsync(created.Value!.Id));
        Assert.Null(entry.OldPrice);
        Assert.Null(entry.OldCostPrice);
        Assert.Equal(15_000, entry.NewPrice);
        Assert.Equal(9_000, entry.NewCostPrice);
        Assert.Equal("em-admin", entry.EmployeeId);
        Assert.Equal("Nguyễn Minh Quân", entry.EmployeeName);
        Assert.Equal(Now, entry.At);
    }

    [Fact]
    public async Task Changing_price_or_cost_adds_a_row_with_old_and_new_values()
    {
        var id = (await _products.SaveAsync(Input(null, "15000", "9000"), Admin, Now)).Value!.Id;
        _db.ChangeTracker.Clear();

        await _products.SaveAsync(Input(id, "16000", "9000"), Admin, Now.AddDays(1));
        _db.ChangeTracker.Clear();
        await _products.SaveAsync(Input(id, "16000", "9500"), Admin, Now.AddDays(2));

        var history = await HistoryAsync(id);
        Assert.Equal(3, history.Count);
        Assert.Equal((15_000, 16_000, 9_000, 9_000), (history[1].OldPrice, history[1].NewPrice, history[1].OldCostPrice, history[1].NewCostPrice));
        Assert.Equal((16_000, 16_000, 9_000, 9_500), (history[2].OldPrice, history[2].NewPrice, history[2].OldCostPrice, history[2].NewCostPrice));
        Assert.Equal(Now.AddDays(2), history[2].At);
    }

    [Fact]
    public async Task Editing_without_a_price_change_adds_nothing()
    {
        var id = (await _products.SaveAsync(Input(null, "15000", "9000"), Admin, Now)).Value!.Id;
        _db.ChangeTracker.Clear();

        var renamed = await _products.SaveAsync(Input(id, "15000", "9000", "Snack khoai tây vị cay"), Admin, Now.AddHours(1));
        Assert.True(renamed.Ok);
        Assert.Single(await HistoryAsync(id));
    }

    [Fact]
    public async Task Rejected_form_does_not_record_anything()
    {
        var id = (await _products.SaveAsync(Input(null, "15000", "9000"), Admin, Now)).Value!.Id;
        _db.ChangeTracker.Clear();

        var bad = await _products.SaveAsync(Input(id, "0", "9000"), Admin, Now.AddHours(1));
        Assert.False(bad.Ok);
        Assert.Single(await HistoryAsync(id));
    }
}
