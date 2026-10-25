using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>Phiếu nhập nhận thiếu, nhận nhiều đợt, kết thúc phiếu khi nhà cung cấp không giao nữa.</summary>
public sealed class PartialReceivingTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly AppDbContext _db;
    private readonly PurchasingService _purchasing;

    public PartialReceivingTests()
    {
        _connection.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _db.Categories.Add(new Category { Id = "milk", Slug = "milk", Name = "Sữa" });
        _db.Subcategories.Add(new Subcategory { Id = "fresh", Slug = "fresh", Name = "Sữa tươi", CategoryId = "milk" });
        _db.Stores.Add(new Store { Id = "st-1", Code = "1001", Name = "Một" });
        _db.Suppliers.Add(new Supplier { Id = "sup-1", Code = "NCC001", Name = "Sữa Việt", CategoryIds = "milk" });
        _db.Products.AddRange(
            new Product { Id = "p-milk", Slug = "sua", Sku = "7E1", Barcode = "8930000000017", Name = "Sữa tươi 1L", CategoryId = "milk", SubcategoryId = "fresh", Price = 30_000, CostPrice = 20_000, ShelfLifeDays = 7 },
            new Product { Id = "p-box", Slug = "hop", Sku = "7E2", Barcode = "8930000000024", Name = "Sữa hộp 180ml", CategoryId = "milk", SubcategoryId = "fresh", Price = 8_000, CostPrice = 5_000 });
        _db.StockLevels.AddRange(
            new StockLevel { StoreId = "st-1", ProductId = "p-milk", Quantity = 2, MinQuantity = 6 },
            new StockLevel { StoreId = "st-1", ProductId = "p-box", Quantity = 0, MinQuantity = 6 });
        _db.PurchaseOrders.Add(new PurchaseOrder
        {
            Id = "po-1", Code = "PN00001", SupplierId = "sup-1", StoreId = "st-1", Status = PurchaseOrderStatus.Ordered, CreatedBy = "em-1",
            CreatedAt = DateTime.Now.AddHours(-2), ExpectedAt = DateTime.Now.AddHours(22), Total = 24 * 20_000 + 48 * 5_000,
            Items =
            [
                new PurchaseOrderItem { Id = 1, ProductId = "p-milk", Quantity = 24, CostPrice = 20_000 },
                new PurchaseOrderItem { Id = 2, ProductId = "p-box", Quantity = 48, CostPrice = 5_000 },
            ],
        });
        _db.SaveChanges();
        _db.ChangeTracker.Clear();
        _purchasing = new PurchasingService(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<PurchaseOrder> OrderAsync()
    {
        _db.ChangeTracker.Clear();
        return await _db.PurchaseOrders.AsNoTracking().Include(p => p.Items).FirstAsync(p => p.Id == "po-1");
    }

    private async Task<int> StockAsync(string productId) =>
        (await _db.StockLevels.AsNoTracking().FirstAsync(s => s.StoreId == "st-1" && s.ProductId == productId)).Quantity;

    [Fact]
    public async Task Short_delivery_receives_part_and_keeps_waiting_for_the_rest()
    {
        var result = await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 10, [2] = 48 }, "Quản lý");
        Assert.True(result.Ok, result.Error);

        var order = await OrderAsync();
        Assert.Equal(PurchaseOrderStatus.PartiallyReceived, order.Status);
        Assert.Equal((10, 14), (order.Items.First(i => i.Id == 1).ReceivedQuantity, order.Items.First(i => i.Id == 1).Remaining));
        Assert.Equal(0, order.Items.First(i => i.Id == 2).Remaining);
        Assert.Equal(12, await StockAsync("p-milk"));
        Assert.Equal(48, await StockAsync("p-box"));
        var batch = Assert.Single(await _db.InventoryBatches.AsNoTracking().Where(b => b.ProductId == "p-milk").ToListAsync());
        Assert.Equal((10, "PN00001-7E1"), (batch.Quantity, batch.LotCode));
        Assert.Equal(2, await _db.StockMovements.CountAsync(m => m.Ref == "PN00001" && m.Kind == StockMovementKind.Receive));
    }

    [Fact]
    public async Task Second_delivery_completes_the_order_with_its_own_lot()
    {
        await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 10, [2] = 48 }, "Quản lý");
        await Task.Delay(20); // hai đợt khác thời điểm
        _db.ChangeTracker.Clear();
        var second = await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 14 }, "Quản lý");
        Assert.True(second.Ok, second.Error);

        var order = await OrderAsync();
        Assert.Equal(PurchaseOrderStatus.Received, order.Status);
        Assert.All(order.Items, i => Assert.Equal(0, i.Remaining));
        Assert.Equal(26, await StockAsync("p-milk"));
        var lots = await _db.InventoryBatches.AsNoTracking().Where(b => b.ProductId == "p-milk").OrderBy(b => b.Id).Select(b => b.LotCode).ToListAsync();
        Assert.Equal(["PN00001-7E1", "PN00001-7E1-D2"], lots);
    }

    [Fact]
    public async Task Cannot_receive_more_than_ordered_negative_or_nothing()
    {
        Assert.Equal("Sữa tươi 1L: chỉ còn thiếu 24, không nhận quá số đã đặt",
            (await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 25 }, null)).Error);
        _db.ChangeTracker.Clear();
        Assert.Equal("Số lượng nhận không được âm", (await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = -1 }, null)).Error);
        _db.ChangeTracker.Clear();
        Assert.Equal("Nhập số lượng nhận cho ít nhất một mặt hàng",
            (await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 0, [2] = 0 }, null)).Error);

        var order = await OrderAsync();
        Assert.Equal(PurchaseOrderStatus.Ordered, order.Status);
        Assert.All(order.Items, i => Assert.Equal(0, i.ReceivedQuantity));
        Assert.Equal(2, await StockAsync("p-milk"));
    }

    [Fact]
    public async Task Closing_a_partial_order_needs_a_reason_and_bills_only_what_arrived()
    {
        await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 10, [2] = 48 }, "Quản lý");
        _db.ChangeTracker.Clear();

        Assert.Equal("Nhập lý do kết thúc phiếu, ví dụ: nhà cung cấp hết hàng", (await _purchasing.CloseAsync("po-1", " ", "Quản lý")).Error);
        _db.ChangeTracker.Clear();
        Assert.Equal("Phiếu đã nhận một phần hàng nên không huỷ được, hãy dùng Kết thúc phiếu", (await _purchasing.CancelAsync("po-1")).Error);
        _db.ChangeTracker.Clear();

        var closed = await _purchasing.CloseAsync("po-1", "Nhà cung cấp hết sữa tươi", "Quản lý");
        Assert.True(closed.Ok, closed.Error);
        var order = await OrderAsync();
        Assert.Equal(PurchaseOrderStatus.Closed, order.Status);
        Assert.Equal(10 * 20_000 + 48 * 5_000, order.Total);
        Assert.Equal(("Nhà cung cấp hết sữa tươi", "Quản lý"), (order.ClosedReason, order.ClosedBy));

        _db.ChangeTracker.Clear();
        Assert.Equal("Phiếu này không ở trạng thái chờ nhận hàng", (await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 1 }, null)).Error);
        Assert.Equal(12, await StockAsync("p-milk"));
    }

    [Fact]
    public async Task Order_with_nothing_received_is_cancelled_not_closed()
    {
        Assert.Equal("Phiếu chưa nhận đợt nào, hãy dùng Huỷ phiếu", (await _purchasing.CloseAsync("po-1", "Không giao", null)).Error);
        _db.ChangeTracker.Clear();
        Assert.True((await _purchasing.CancelAsync("po-1")).Ok);
    }

    [Fact]
    public async Task Receive_all_takes_whatever_is_still_missing()
    {
        await _purchasing.ReceiveAsync("po-1", new Dictionary<int, int> { [1] = 10 }, "Quản lý");
        await Task.Delay(20);
        _db.ChangeTracker.Clear();
        Assert.True((await _purchasing.ReceiveAsync("po-1", "Quản lý")).Ok);

        var order = await OrderAsync();
        Assert.Equal(PurchaseOrderStatus.Received, order.Status);
        Assert.Equal(26, await StockAsync("p-milk"));
        Assert.Equal(48, await StockAsync("p-box"));
    }
}
