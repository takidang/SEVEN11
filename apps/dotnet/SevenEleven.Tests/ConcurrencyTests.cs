using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>
/// Nhiều người bấm cùng lúc trên một cơ sở dữ liệu thật (SQLite trên đĩa, mỗi yêu cầu một kết nối như
/// web chạy thật): mua những món cuối cùng, hai người cùng huỷ một đơn, cùng nhận một phiếu nhập,
/// cùng đổi sao. Không được bán quá tồn, không được trả hàng/sao hai lần, không văng lỗi máy chủ.
/// </summary>
public sealed class ConcurrencyTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"seven-concurrency-{Guid.NewGuid():N}.db");
    private readonly DbContextOptions<AppDbContext> _options;

    public ConcurrencyTests()
    {
        _options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite($"Data Source={_path}").Options;
        using var db = Fresh();
        db.Database.EnsureCreated();
        var now = DateTime.Now;
        db.Categories.Add(new Category { Id = "snack", Slug = "snack", Name = "Snack" });
        db.Subcategories.Add(new Subcategory { Id = "chips", Slug = "chips", Name = "Khoai tây", CategoryId = "snack" });
        db.Products.Add(new Product { Id = "chips", Slug = "chips", Sku = "7E1", Barcode = "1", Name = "Snack khoai tây", CategoryId = "snack", SubcategoryId = "chips", Price = 20_000, CostPrice = 12_000, IsActive = true });
        db.Stores.Add(new Store { Id = "st-1", Code = "1001", Name = "Cửa hàng thử", Province = "TP Hồ Chí Minh", Lat = 10.78, Lng = 106.70 });
        db.Employees.Add(new Employee { Id = "em-1", Code = "NV1", FullName = "Thu Ngân", Email = "tn@demo", Role = StaffRole.Cashier, StoreId = "st-1" });
        db.StockLevels.Add(new StockLevel { StoreId = "st-1", ProductId = "chips", Quantity = 5, MinQuantity = 2 });
        db.Customers.Add(new Customer { Id = "cu-1", FullName = "Khách", Phone = "0901234567", Stars = 25, TierSince = now, JoinedAt = now });
        db.StarEntries.Add(new StarEntry { CustomerId = "cu-1", At = now, Delta = 25, Kind = StarEntryKind.Earn, Note = "Sao ban đầu" });
        db.Suppliers.Add(new Supplier { Id = "sup-1", Code = "NCC1", Name = "NCC Snack", CategoryIds = "snack" });
        db.SaveChanges();
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var suffix in new[] { "", "-wal", "-shm" }) File.Delete(_path + suffix);
    }

    private AppDbContext Fresh() => new(_options);

    private async Task<T> InFreshAsync<T>(Func<AppDbContext, Task<T>> work)
    {
        await using var db = Fresh();
        return await work(db);
    }

    [Fact]
    public async Task Twenty_cashiers_buying_the_last_five_units_never_oversell()
    {
        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => InFreshAsync(db =>
            new OrderService(db).PlaceAsync(new PlaceOrderInput(
                SalesChannel.InStore, "st-1", [new CartLine("chips", 1)], PaymentMethod.Card, null, null, null, "em-1"))))));

        await using var check = Fresh();
        var stock = await check.StockLevels.SingleAsync();
        Assert.Equal(5, results.Count(r => r.Ok));
        Assert.All(results.Where(r => !r.Ok), r => Assert.Contains("không đủ hàng", r.Error));
        Assert.Equal(0, stock.Quantity);
        Assert.Equal(5, await check.Orders.CountAsync());
        Assert.Equal(5, await check.Orders.Select(o => o.Code).Distinct().CountAsync());
        Assert.Equal(-5, await check.StockMovements.SumAsync(m => m.Delta));
    }

    [Fact]
    public async Task Two_people_cancelling_the_same_order_return_the_goods_once()
    {
        var placed = await InFreshAsync(db => new OrderService(db).PlaceAsync(new PlaceOrderInput(
            SalesChannel.Online, "st-1", [new CartLine("chips", 3)], PaymentMethod.Ewallet, "cu-1", null,
            new DeliveryInput("Khách", "0901234567", "1 Pasteur", null, 1.0))));
        Assert.True(placed.Ok, placed.Error);
        var id = placed.Order!.Id;

        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => Task.Run(() => InFreshAsync(db =>
            new OrderService(db).ChangeStatusAsync(id, OrderStatus.Cancelled, $"Người {i}", "Huỷ thử")))));

        await using var check = Fresh();
        Assert.All(results, r => Assert.True(r.Ok, r.Error));
        Assert.Equal(5, (await check.StockLevels.SingleAsync()).Quantity);
        Assert.Equal(1, await check.OrderEvents.CountAsync(e => e.OrderId == id && e.Status == OrderStatus.Cancelled));
        Assert.Equal(1, await check.StockMovements.CountAsync(m => m.Kind == StockMovementKind.CancelReturn));
        var customer = await check.Customers.SingleAsync();
        Assert.Equal(customer.Stars, await check.StarEntries.SumAsync(e => e.Delta));
        Assert.Equal(0, customer.OrderCount);
    }

    [Fact]
    public async Task Two_staff_moving_an_order_forward_at_once_only_step_once()
    {
        var placed = await InFreshAsync(db => new OrderService(db).PlaceAsync(new PlaceOrderInput(
            SalesChannel.Online, "st-1", [new CartLine("chips", 1)], PaymentMethod.Cod, "cu-1", null,
            new DeliveryInput("Khách", "0901234567", "1 Pasteur", null, 1.0))));
        var id = placed.Order!.Id;

        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => Task.Run(() => InFreshAsync(db =>
            new OrderService(db).ChangeStatusAsync(id, OrderStatus.Confirmed, $"Người {i}", null)))));

        await using var check = Fresh();
        Assert.All(results, r => Assert.True(r.Ok, r.Error));
        Assert.Equal(1, await check.OrderEvents.CountAsync(e => e.OrderId == id && e.Status == OrderStatus.Confirmed));
    }

    [Fact]
    public async Task Receiving_the_same_purchase_order_twice_adds_stock_once()
    {
        var draft = await InFreshAsync(async db =>
        {
            var service = new PurchasingService(db);
            var created = await service.CreateDraftAsync("sup-1", "st-1", "Quản lý", null);
            if (created.Order!.Items.Count == 0) await service.AddItemAsync(created.Order.Id, "chips", 10);
            await service.PlaceAsync(created.Order.Id);
            return created.Order;
        });
        await using (var db = Fresh()) Assert.NotEmpty(await db.PurchaseOrderItems.Where(i => i.PurchaseOrderId == draft.Id).ToListAsync());
        var ordered = await InFreshAsync(db => db.PurchaseOrderItems.Where(i => i.PurchaseOrderId == draft.Id).SumAsync(i => i.Quantity));

        var results = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => Task.Run(() => InFreshAsync(db =>
            new PurchasingService(db).ReceiveAsync(draft.Id, "Quản lý")))));

        await using var check = Fresh();
        Assert.Equal(1, results.Count(r => r.Ok));
        Assert.Equal(5 + ordered, (await check.StockLevels.SingleAsync()).Quantity);
        Assert.Equal(ordered, await check.StockMovements.Where(m => m.Kind == StockMovementKind.Receive).SumAsync(m => m.Delta));
    }

    [Fact]
    public async Task Redeeming_stars_from_many_tabs_never_goes_below_zero()
    {
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => InFreshAsync(db =>
            new LoyaltyService(db).RedeemAsync("cu-1", "sao-10")))));

        await using var check = Fresh();
        var customer = await check.Customers.SingleAsync();
        Assert.Equal(2, results.Count(r => r.Ok));
        Assert.Equal(5, customer.Stars);
        Assert.Equal(customer.Stars, await check.StarEntries.SumAsync(e => e.Delta));
        Assert.Equal(2, await check.Promotions.CountAsync(p => p.OwnerId == "cu-1"));
    }

    [Fact]
    public async Task Double_clicking_check_in_opens_only_one_shift()
    {
        var at = DateTime.Now;
        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => Task.Run(() => InFreshAsync(async db =>
            await new ShiftService(db).PosCheckInAsync((await db.Employees.FindAsync("em-1"))!, (await db.Stores.FindAsync("st-1"))!, 2_000_000, at)))));

        await using var check = Fresh();
        Assert.Equal(1, results.Count(r => r.Ok));
        Assert.Equal(1, await check.Shifts.CountAsync(s => s.Status == ShiftStatus.InProgress));
    }

    [Fact]
    public async Task Stock_adjustments_racing_with_sales_keep_the_log_consistent()
    {
        await using (var db = Fresh())
        {
            (await db.StockLevels.SingleAsync()).Quantity = 40;
            await db.SaveChangesAsync();
        }
        var sales = Enumerable.Range(0, 10).Select(_ => Task.Run(() => InFreshAsync(async db =>
            (await new OrderService(db).PlaceAsync(new PlaceOrderInput(SalesChannel.InStore, "st-1", [new CartLine("chips", 1)], PaymentMethod.Card, null, null, null, "em-1"))).Ok)));
        var adjusts = Enumerable.Range(0, 5).Select(i => Task.Run(() => InFreshAsync(async db =>
            (await new InventoryService(db).AdjustAsync("st-1", "chips", 30 + i, "Kiểm kê", null, "Quản lý")).Ok)));
        await Task.WhenAll(sales.Concat(adjusts));

        await using var check = Fresh();
        var level = await check.StockLevels.SingleAsync();
        var last = await check.StockMovements.OrderByDescending(m => m.Id).FirstAsync();
        Assert.Equal(level.Quantity, last.QuantityAfter);
        // Tồn ban đầu 40 + tổng biến động đã ghi = tồn cuối.
        Assert.Equal(level.Quantity, 40 + await check.StockMovements.SumAsync(m => m.Delta));
        Assert.True(level.Quantity >= 0);
    }
}
