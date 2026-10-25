using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>
/// Trả hàng cho đơn đã hoàn thành trong 7 ngày. Đơn mẫu: 4 snack 50.000 (giảm theo món 20.000), 2 sữa tươi
/// 30.000 (hàng có hạn dùng), 4 bia 25.000 (đồ có cồn, không tính chi tiêu); mã giảm 34.000 cho cả đơn,
/// phí giao 15.000. Tổng 321.000, hàng 306.000; chi tiêu xét hạng 206.000 → 4 sao, dư 26.000.
/// </summary>
public sealed class OrderReturnTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly AppDbContext _db;
    private readonly ReturnService _returns;
    private static readonly DateTime Now = new(2026, 10, 25, 17, 0, 0);

    public OrderReturnTests()
    {
        _connection.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _db.Categories.AddRange(
            new Category { Id = "snack", Slug = "snack", Name = "Đồ ăn vặt" },
            new Category { Id = "do-uong-co-con", Slug = "bia", Name = "Đồ uống có cồn", AgeRestricted = true });
        _db.Subcategories.AddRange(
            new Subcategory { Id = "chips", Slug = "chips", Name = "Snack", CategoryId = "snack" },
            new Subcategory { Id = "beer", Slug = "beer", Name = "Bia", CategoryId = "do-uong-co-con" });
        _db.Stores.Add(new Store { Id = "st-1", Code = "1001", Name = "Một" });
        _db.Products.AddRange(
            new Product { Id = "p-snack", Slug = "snack", Sku = "7E1", Barcode = "8930000000017", Name = "Snack", CategoryId = "snack", SubcategoryId = "chips", Price = 50_000, CostPrice = 30_000 },
            new Product { Id = "p-milk", Slug = "milk", Sku = "7E2", Barcode = "8930000000024", Name = "Sữa tươi", CategoryId = "snack", SubcategoryId = "chips", Price = 30_000, CostPrice = 20_000, ShelfLifeDays = 7 },
            new Product { Id = "p-beer", Slug = "beer", Sku = "7E3", Barcode = "8930000000031", Name = "Bia", CategoryId = "do-uong-co-con", SubcategoryId = "beer", Price = 25_000, CostPrice = 18_000, AgeRestricted = true });
        _db.StockLevels.AddRange(
            new StockLevel { StoreId = "st-1", ProductId = "p-snack", Quantity = 10, MinQuantity = 6 },
            new StockLevel { StoreId = "st-1", ProductId = "p-milk", Quantity = 10, MinQuantity = 6 },
            new StockLevel { StoreId = "st-1", ProductId = "p-beer", Quantity = 10, MinQuantity = 6 });
        _db.Customers.Add(new Customer
        {
            Id = "cu-1", FullName = "Khách", Phone = "0901234567", Tier = MemberTier.Silver, TierSpend = 1_050_000, TierSince = Now.AddDays(-20),
            ReviewedMonth = "2026-09", Stars = 10, StarCarry = 26_000, TotalSpent = 2_000_000, OrderCount = 5, JoinedAt = Now.AddYears(-1),
        });
        _db.Orders.Add(Order("od-1", "DH2610240001", completedAt: Now.AddDays(-1)));
        _db.Orders.Add(Order("od-old", "DH2610170001", completedAt: Now.AddDays(-8)));
        _db.SaveChanges();
        _db.ChangeTracker.Clear();
        _returns = new ReturnService(_db);
    }

    private static Order Order(string id, string code, DateTime completedAt) => new()
    {
        Id = id, Code = code, Channel = SalesChannel.Online, StoreId = "st-1", CustomerId = "cu-1",
        Subtotal = 360_000, Discount = 54_000, ShippingFee = 15_000, Total = 321_000, PromotionCode = "GIAM34",
        MemberSpend = 206_000, StarsEarned = 4, PaymentMethod = PaymentMethod.Card, PaymentStatus = PaymentStatus.Paid,
        Status = OrderStatus.Completed, CreatedAt = completedAt.AddHours(-1), UpdatedAt = completedAt,
        Items =
        [
            new OrderItem { Id = id == "od-1" ? 1 : 11, ProductId = "p-snack", Name = "Snack", UnitPrice = 50_000, Quantity = 4, Discount = 20_000, LineTotal = 180_000 },
            new OrderItem { Id = id == "od-1" ? 2 : 12, ProductId = "p-milk", Name = "Sữa tươi", UnitPrice = 30_000, Quantity = 2, LineTotal = 60_000 },
            new OrderItem { Id = id == "od-1" ? 3 : 13, ProductId = "p-beer", Name = "Bia", UnitPrice = 25_000, Quantity = 4, LineTotal = 100_000 },
        ],
        Timeline =
        [
            new OrderEvent { Status = OrderStatus.Pending, At = completedAt.AddHours(-1) },
            new OrderEvent { Status = OrderStatus.Completed, At = completedAt },
        ],
    };

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<int> StockAsync(string productId)
    {
        _db.ChangeTracker.Clear();
        return (await _db.StockLevels.AsNoTracking().FirstAsync(s => s.ProductId == productId)).Quantity;
    }

    private async Task<Customer> CustomerAsync()
    {
        _db.ChangeTracker.Clear();
        return await _db.Customers.AsNoTracking().FirstAsync(c => c.Id == "cu-1");
    }

    private Task<ReturnResult> ReturnAsync(string reason, params ReturnLine[] lines) =>
        _returns.CreateAsync("od-1", lines, reason, null, "Thu ngân", Now);

    [Fact]
    public async Task Partial_return_refunds_what_was_paid_and_takes_back_stars_and_tier_spend()
    {
        var result = await ReturnAsync("Khách đổi ý",
            new ReturnLine(1, 2, ReturnDisposition.Restock), new ReturnLine(3, 1, ReturnDisposition.Restock));
        Assert.True(result.Ok, result.Error);
        var r = result.Return!;
        // Snack: 90.000 − 9.000 phần mã giảm; bia: 25.000 − 2.500.
        Assert.Equal("TH00001", r.Code);
        Assert.Equal([81_000, 22_500], r.Items.Select(i => i.Refund));
        Assert.Equal(103_500, r.Refund);
        // Bia không tính chi tiêu: chỉ trừ 81.000; 1.050.000 − 81.000 < 1.000.000 nên rớt hạng Bạc.
        Assert.Equal((81_000, 2), (r.SpendTaken, r.StarsTaken));

        var c = await CustomerAsync();
        Assert.Equal((8, 35_000), (c.Stars, c.StarCarry));
        Assert.Equal((969_000, MemberTier.Bronze), (c.TierSpend, c.Tier));
        Assert.Equal(2_000_000 - 103_500, c.TotalSpent);
        var drop = await _db.TierChanges.AsNoTracking().SingleAsync();
        Assert.Equal("Trả hàng đơn DH2610240001, chi tiêu tích luỹ không còn đủ mốc", drop.Reason);
        Assert.Equal(-2, (await _db.StarEntries.AsNoTracking().SingleAsync()).Delta);

        Assert.Equal((12, 11), (await StockAsync("p-snack"), await StockAsync("p-beer")));
        Assert.Equal(2, await _db.StockMovements.CountAsync(m => m.Kind == StockMovementKind.ReturnRestock && m.Ref == "TH00001"));
    }

    [Fact]
    public async Task Last_return_refunds_exactly_the_rest_and_all_member_spend()
    {
        await ReturnAsync("Khách đổi ý", new ReturnLine(1, 2, ReturnDisposition.Restock), new ReturnLine(3, 1, ReturnDisposition.Restock));
        _db.ChangeTracker.Clear();
        var rest = await ReturnAsync("Hàng lỗi, hỏng",
            new ReturnLine(1, 2, ReturnDisposition.Discard), new ReturnLine(2, 2, ReturnDisposition.Discard), new ReturnLine(3, 3, ReturnDisposition.Restock));
        Assert.True(rest.Ok, rest.Error);

        var all = await _db.OrderReturns.AsNoTracking().ToListAsync();
        Assert.Equal(306_000, all.Sum(x => x.Refund));          // đúng bằng tiền hàng khách đã trả, không gồm phí giao
        Assert.Equal(206_000, all.Sum(x => x.SpendTaken));      // đúng bằng chi tiêu đơn đã cộng
        // Xuất huỷ: tồn không đổi nhưng vẫn ghi nhật ký kho.
        Assert.Equal((12, 10, 14), (await StockAsync("p-snack"), await StockAsync("p-milk"), await StockAsync("p-beer")));
        Assert.Equal(2, await _db.StockMovements.CountAsync(m => m.Kind == StockMovementKind.ReturnDiscard && m.Delta == 0));

        _db.ChangeTracker.Clear();
        Assert.Equal("Snack: chỉ còn 0 sản phẩm chưa trả", (await ReturnAsync("Khách đổi ý", new ReturnLine(1, 1, ReturnDisposition.Restock))).Error);
    }

    [Fact]
    public async Task Rules_block_bad_returns_without_changing_anything()
    {
        Assert.Equal("Chọn lý do trả hàng", (await ReturnAsync("", new ReturnLine(1, 1, ReturnDisposition.Restock))).Error);
        Assert.Equal("Lý do \"Khác\": ghi rõ trong ô ghi chú", (await ReturnAsync("Khác", new ReturnLine(1, 1, ReturnDisposition.Restock))).Error);
        _db.ChangeTracker.Clear();
        Assert.Equal("Sữa tươi: hàng có hạn dùng không nhập lại kho, chọn Xuất huỷ",
            (await ReturnAsync("Khách đổi ý", new ReturnLine(2, 1, ReturnDisposition.Restock))).Error);
        _db.ChangeTracker.Clear();
        Assert.Equal("Snack: chỉ còn 4 sản phẩm chưa trả", (await ReturnAsync("Khách đổi ý", new ReturnLine(1, 5, ReturnDisposition.Restock))).Error);
        _db.ChangeTracker.Clear();
        Assert.Equal("Nhập số lượng trả cho ít nhất một sản phẩm", (await ReturnAsync("Khách đổi ý", new ReturnLine(1, 0, ReturnDisposition.Restock))).Error);

        var c = await CustomerAsync();
        Assert.Equal((10, 1_050_000, MemberTier.Silver), (c.Stars, c.TierSpend, c.Tier));
        Assert.Equal(10, await StockAsync("p-snack"));
        Assert.Equal(0, await _db.OrderReturns.CountAsync());
    }

    [Fact]
    public async Task Only_completed_orders_within_seven_days()
    {
        var old = await _returns.CreateAsync("od-old", [new ReturnLine(11, 1, ReturnDisposition.Restock)], "Khách đổi ý", null, "Thu ngân", Now);
        Assert.StartsWith("Đơn hoàn thành quá 7 ngày", old.Error);

        _db.ChangeTracker.Clear();
        var order = await _db.Orders.FirstAsync(o => o.Id == "od-1");
        order.Status = OrderStatus.Delivering;
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();
        Assert.Equal("Chỉ trả hàng cho đơn đã hoàn thành", (await ReturnAsync("Khách đổi ý", new ReturnLine(1, 1, ReturnDisposition.Restock))).Error);
    }
}
