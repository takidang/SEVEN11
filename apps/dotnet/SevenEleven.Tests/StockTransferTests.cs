using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>Chuyển kho: bên gửi trừ kho khi gửi, bên nhận cộng khi xác nhận, lô giữ nguyên hạn dùng; huỷ thì hàng về lại.</summary>
public sealed class StockTransferTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly AppDbContext _db;
    private readonly StockTransferService _transfers;
    private static readonly DateTime Now = new(2026, 10, 25, 9, 0, 0);
    private static readonly Actor Admin = new("em-admin", StaffRole.Admin, null);
    private static readonly Actor ManagerA = new("em-a", StaffRole.Manager, "st-a");
    private static readonly Actor ManagerB = new("em-b", StaffRole.Manager, "st-b");

    public StockTransferTests()
    {
        _connection.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _db.Categories.Add(new Category { Id = "milk", Slug = "milk", Name = "Sữa" });
        _db.Subcategories.Add(new Subcategory { Id = "fresh", Slug = "fresh", Name = "Sữa tươi", CategoryId = "milk" });
        _db.Stores.AddRange(
            new Store { Id = "st-a", Code = "1001", Name = "A" },
            new Store { Id = "st-b", Code = "1002", Name = "B" },
            new Store { Id = "st-c", Code = "1003", Name = "C", Status = StoreStatus.Closed });
        _db.Products.AddRange(
            new Product { Id = "p-milk", Slug = "sua", Sku = "7E1", Barcode = "8930000000017", Name = "Sữa tươi 1L", CategoryId = "milk", SubcategoryId = "fresh", Price = 30_000, CostPrice = 20_000, ShelfLifeDays = 7 },
            new Product { Id = "p-box", Slug = "hop", Sku = "7E2", Barcode = "8930000000024", Name = "Sữa hộp 180ml", CategoryId = "milk", SubcategoryId = "fresh", Price = 8_000, CostPrice = 5_000 });
        _db.StockLevels.AddRange(
            new StockLevel { StoreId = "st-a", ProductId = "p-milk", Quantity = 20, MinQuantity = 6 },
            new StockLevel { StoreId = "st-a", ProductId = "p-box", Quantity = 30, MinQuantity = 6 });
        // Sữa tươi ở A: 4 hộp đã hết hạn, 6 hộp hết hạn 27/10, 8 hộp hết hạn 30/10 (2 hộp còn lại không theo lô).
        _db.InventoryBatches.AddRange(
            new InventoryBatch { StoreId = "st-a", ProductId = "p-milk", LotCode = "L-CU", Quantity = 4, ReceivedAt = Now.AddDays(-8), ExpiresAt = Now.AddDays(-1) },
            new InventoryBatch { StoreId = "st-a", ProductId = "p-milk", LotCode = "L-27", Quantity = 6, ReceivedAt = Now.AddDays(-5), ExpiresAt = new DateTime(2026, 10, 27, 23, 59, 0) },
            new InventoryBatch { StoreId = "st-a", ProductId = "p-milk", LotCode = "L-30", Quantity = 8, ReceivedAt = Now.AddDays(-2), ExpiresAt = new DateTime(2026, 10, 30, 23, 59, 0) });
        _db.SaveChanges();
        _db.ChangeTracker.Clear();
        _transfers = new StockTransferService(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<int> StockAsync(string store, string product)
    {
        _db.ChangeTracker.Clear();
        return (await _db.StockLevels.AsNoTracking().FirstOrDefaultAsync(s => s.StoreId == store && s.ProductId == product))?.Quantity ?? 0;
    }

    private async Task<List<(string Lot, int Qty)>> LotsAsync(string store) =>
        (await _db.InventoryBatches.AsNoTracking().Where(b => b.StoreId == store && b.Quantity > 0).OrderBy(b => b.ExpiresAt).ToListAsync())
        .Select(b => (b.LotCode, b.Quantity)).ToList();

    private Task<TransferResult> SendAsync(Actor actor, string to, params (string, int)[] lines) =>
        _transfers.SendAsync("st-a", to, lines, null, actor, "Người gửi", Now);

    [Fact]
    public async Task Sending_takes_stock_and_freshest_needed_lots_from_the_sender_only()
    {
        var sent = await SendAsync(ManagerA, "st-b", ("p-milk", 9), ("p-box", 10));
        Assert.True(sent.Ok, sent.Error);
        Assert.Equal("CK00001", sent.Transfer!.Code);

        Assert.Equal((11, 20), (await StockAsync("st-a", "p-milk"), await StockAsync("st-a", "p-box")));
        Assert.Equal((0, 0), (await StockAsync("st-b", "p-milk"), await StockAsync("st-b", "p-box")));
        // Lô đã hết hạn không bị lấy; lấy lô 27/10 trước rồi mới tới lô 30/10.
        Assert.Equal([("L-CU", 4), ("L-30", 5)], await LotsAsync("st-a"));
        var item = (await _db.StockTransferItems.AsNoTracking().Include(i => i.Lots).FirstAsync(i => i.ProductId == "p-milk"));
        Assert.Equal([("L-27", 6), ("L-30", 3)], item.Lots.OrderBy(l => l.ExpiresAt).Select(l => (l.LotCode, l.Quantity)).ToList());
        Assert.Equal(2, await _db.StockMovements.CountAsync(m => m.Kind == StockMovementKind.TransferOut && m.StoreId == "st-a" && m.Ref == "CK00001"));
    }

    [Fact]
    public async Task Receiving_adds_stock_and_keeps_lot_codes_and_expiry_dates()
    {
        var id = (await SendAsync(ManagerA, "st-b", ("p-milk", 9), ("p-box", 10))).Transfer!.Id;
        _db.ChangeTracker.Clear();

        Assert.Equal("Chỉ cửa hàng nhận mới xác nhận được đã nhận hàng", (await _transfers.ReceiveAsync(id, ManagerA, "A", Now)).Error);
        _db.ChangeTracker.Clear();
        var got = await _transfers.ReceiveAsync(id, ManagerB, "Người nhận", Now.AddHours(3));
        Assert.True(got.Ok, got.Error);

        Assert.Equal((9, 10), (await StockAsync("st-b", "p-milk"), await StockAsync("st-b", "p-box")));
        var lots = await _db.InventoryBatches.AsNoTracking().Where(b => b.StoreId == "st-b").OrderBy(b => b.ExpiresAt).ToListAsync();
        Assert.Equal(["L-27", "L-30"], lots.Select(l => l.LotCode));
        Assert.Equal([new DateTime(2026, 10, 27, 23, 59, 0), new DateTime(2026, 10, 30, 23, 59, 0)], lots.Select(l => l.ExpiresAt!.Value));
        var t = await _db.StockTransfers.AsNoTracking().FirstAsync(x => x.Id == id);
        Assert.Equal((StockTransferStatus.Received, "Người nhận"), (t.Status, t.ReceivedBy));

        _db.ChangeTracker.Clear();
        Assert.Equal("Phiếu này không còn chờ nhận hàng", (await _transfers.ReceiveAsync(id, ManagerB, "B", Now)).Error);
        Assert.Equal(9, await StockAsync("st-b", "p-milk"));
    }

    [Fact]
    public async Task Cancelling_in_transit_returns_stock_and_lots_to_the_sender()
    {
        var id = (await SendAsync(ManagerA, "st-b", ("p-milk", 9))).Transfer!.Id;
        _db.ChangeTracker.Clear();
        Assert.Equal("Chỉ cửa hàng gửi mới huỷ được phiếu", (await _transfers.CancelAsync(id, ManagerB, "B", Now)).Error);
        _db.ChangeTracker.Clear();
        Assert.True((await _transfers.CancelAsync(id, ManagerA, "A", Now)).Ok);

        Assert.Equal(20, await StockAsync("st-a", "p-milk"));
        Assert.Equal(18, (await LotsAsync("st-a")).Sum(l => l.Qty));
        Assert.Equal(0, await StockAsync("st-b", "p-milk"));
        _db.ChangeTracker.Clear();
        Assert.Equal("Phiếu này không còn chờ nhận hàng", (await _transfers.ReceiveAsync(id, ManagerB, "B", Now)).Error);
    }

    [Fact]
    public async Task Rules_block_bad_transfers_without_touching_stock()
    {
        Assert.Equal("Bạn chỉ chuyển được hàng từ cửa hàng của mình", (await SendAsync(ManagerB, "st-b", ("p-box", 1))).Error);
        Assert.Equal("Chọn cửa hàng nhận khác cửa hàng gửi", (await SendAsync(Admin, "st-a", ("p-box", 1))).Error);
        Assert.Equal("Chọn cửa hàng nhận đang hoạt động", (await SendAsync(Admin, "st-c", ("p-box", 1))).Error);
        Assert.Equal("Nhập số lượng cho ít nhất một mặt hàng", (await SendAsync(Admin, "st-b", ("p-box", 0))).Error);
        Assert.Equal("Sữa hộp 180ml: cửa hàng gửi chỉ còn 30", (await SendAsync(Admin, "st-b", ("p-box", 31))).Error);
        // 20 hộp sữa tươi trong kho nhưng chỉ 14 hộp thuộc lô còn hạn.
        Assert.Equal("Sữa tươi 1L: chỉ còn 14 sản phẩm còn hạn dùng (theo lô) để chuyển", (await SendAsync(Admin, "st-b", ("p-milk", 15))).Error);

        Assert.Equal((20, 30), (await StockAsync("st-a", "p-milk"), await StockAsync("st-a", "p-box")));
        Assert.Equal(0, await _db.StockTransfers.CountAsync());
    }

    [Fact]
    public async Task Lots_never_exceed_stock_after_a_round_trip()
    {
        var id = (await SendAsync(Admin, "st-b", ("p-milk", 14))).Transfer!.Id;
        _db.ChangeTracker.Clear();
        await _transfers.ReceiveAsync(id, Admin, "Quản trị", Now);
        foreach (var store in new[] { "st-a", "st-b" })
            Assert.True((await LotsAsync(store)).Sum(l => l.Qty) <= await StockAsync(store, "p-milk"), store);
    }
}
