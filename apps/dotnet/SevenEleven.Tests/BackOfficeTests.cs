using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>
/// Kiểm chứng nghiệp vụ khu quản lý trên một cơ sở dữ liệu SQLite trong bộ nhớ: huỷ đơn trả lại
/// kho, sao, hạng và lượt mã; nhập hàng cộng kho và tạo lô; xuất huỷ lô; đổi sao lấy voucher;
/// đơn chỉ đi đúng từng bước.
/// </summary>
public sealed class BackOfficeTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly AppDbContext _db;

    public BackOfficeTests()
    {
        _connection.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        Seed();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private void Seed()
    {
        var now = DateTime.Now;
        _db.Categories.AddRange(
            new Category { Id = "tra-sua", Slug = "tra-sua", Name = "Trà sữa" },
            new Category { Id = "san-pham-tu-sua", Slug = "sua", Name = "Sữa" });
        _db.Subcategories.AddRange(
            new Subcategory { Id = "ts", Slug = "ts", Name = "Trà sữa", CategoryId = "tra-sua" },
            new Subcategory { Id = "sua", Slug = "sua-tuoi", Name = "Sữa tươi", CategoryId = "san-pham-tu-sua" });
        _db.Products.AddRange(
            new Product { Id = "tea", Slug = "tea", Sku = "7E1", Barcode = "1", Name = "Trà sữa", CategoryId = "tra-sua", SubcategoryId = "ts", Price = 50_000, CostPrice = 30_000, IsActive = true },
            new Product { Id = "milk", Slug = "milk", Sku = "7E2", Barcode = "2", Name = "Sữa tươi", CategoryId = "san-pham-tu-sua", SubcategoryId = "sua", Price = 30_000, CostPrice = 22_000, ShelfLifeDays = 7, IsActive = true });
        _db.Stores.Add(new Store { Id = "st-1", Code = "1001", Name = "Cửa hàng thử", Province = "TP Hồ Chí Minh", Lat = 10.78, Lng = 106.70 });
        _db.Employees.Add(new Employee { Id = "em-1", Code = "NV1", FullName = "Thu Ngân", Email = "tn@demo", Role = StaffRole.Cashier, StoreId = "st-1" });
        _db.StockLevels.AddRange(
            new StockLevel { StoreId = "st-1", ProductId = "tea", Quantity = 10, MinQuantity = 4 },
            new StockLevel { StoreId = "st-1", ProductId = "milk", Quantity = 2, MinQuantity = 6 });
        _db.Customers.Add(new Customer
        {
            Id = "cu-1", FullName = "Khách Vàng", Phone = "0901234567", Tier = MemberTier.Gold, TierSpend = 3_050_000,
            TierSince = now.AddMonths(-2), Stars = 20, StarCarry = 40_000, JoinedAt = now.AddYears(-1),
        });
        _db.Promotions.Add(new Promotion
        {
            Id = "pr-code", Code = "GIAM20K", Name = "Giảm 20k", Type = PromotionType.Fixed, Value = 20_000, Channels = "online,in-store",
            StartsAt = now.AddDays(-1), EndsAt = now.AddDays(10), Status = PromotionStatus.Active, UsageLimit = 1,
        });
        _db.Suppliers.Add(new Supplier { Id = "sup-1", Code = "NCC1", Name = "Sữa Cao Nguyên", CategoryIds = "san-pham-tu-sua" });
        _db.SaveChanges();
        _db.ChangeTracker.Clear();
    }

    private Task<PlaceOrderResult> PlaceOnlineAsync(int teaQuantity, string? code = null) =>
        new OrderService(_db).PlaceAsync(new PlaceOrderInput(
            SalesChannel.Online, "st-1", [new CartLine("tea", teaQuantity)], PaymentMethod.Ewallet, "cu-1", code,
            new DeliveryInput("Khách Vàng", "0901234567", "Số 1 Pasteur", null, 1.2)));

    // ---------------------------------------------------------------- huỷ đơn

    [Fact]
    public async Task Cancelling_an_order_returns_stock_stars_tier_spend_and_the_code()
    {
        var placed = await PlaceOnlineAsync(3, "GIAM20K");
        Assert.True(placed.Ok, placed.Error);
        _db.ChangeTracker.Clear();

        // 3 × 50.000 = 150.000; −20.000 mã = 130.000 → miễn phí giao, tính hạng 130.000.
        var afterOrder = await _db.Customers.AsNoTracking().FirstAsync(c => c.Id == "cu-1");
        Assert.Equal(130_000, placed.Order!.MemberSpend);
        Assert.Equal(0, placed.Order.ShippingFee);
        Assert.Equal(3_180_000, afterOrder.TierSpend);
        Assert.Equal(23, afterOrder.Stars);          // (40.000 + 130.000) / 45.000 = 3 sao, dư 35.000
        Assert.Equal(35_000, afterOrder.StarCarry);
        Assert.Equal(7, (await _db.StockLevels.AsNoTracking().FirstAsync(s => s.ProductId == "tea")).Quantity);
        Assert.Equal(1, (await _db.Promotions.AsNoTracking().FirstAsync(p => p.Id == "pr-code")).UsageCount);

        var cancelled = await new OrderService(_db).ChangeStatusAsync(placed.Order.Id, OrderStatus.Cancelled, "Quản lý", "Hết hàng");
        Assert.True(cancelled.Ok, cancelled.Error);
        _db.ChangeTracker.Clear();

        var customer = await _db.Customers.AsNoTracking().FirstAsync(c => c.Id == "cu-1");
        var order = await _db.Orders.AsNoTracking().Include(o => o.Timeline).FirstAsync(o => o.Id == placed.Order.Id);
        Assert.Equal(3_050_000, customer.TierSpend);
        Assert.Equal(20, customer.Stars);
        Assert.Equal(40_000, customer.StarCarry);
        Assert.Equal(MemberTier.Gold, customer.Tier);
        Assert.Equal(10, (await _db.StockLevels.AsNoTracking().FirstAsync(s => s.ProductId == "tea")).Quantity);
        Assert.Equal(0, (await _db.Promotions.AsNoTracking().FirstAsync(p => p.Id == "pr-code")).UsageCount);
        Assert.Equal(PaymentStatus.Refunded, order.PaymentStatus);
        Assert.Contains(order.Timeline, e => e.Status == OrderStatus.Cancelled && e.Note == "Hết hàng");
        Assert.Contains(await _db.StarEntries.AsNoTracking().ToListAsync(), e => e.Kind == StarEntryKind.Refund && e.Delta == -3);
    }

    [Fact]
    public async Task An_order_that_lifted_the_tier_takes_it_back_when_cancelled()
    {
        var member = await _db.Customers.FirstAsync(c => c.Id == "cu-1");
        member.Tier = MemberTier.Silver;
        member.TierSpend = 2_980_000;
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        var placed = await PlaceOnlineAsync(1); // 50.000 → 3.030.000, lên Vàng ngay
        _db.ChangeTracker.Clear();
        Assert.Equal(MemberTier.Gold, (await _db.Customers.AsNoTracking().FirstAsync(c => c.Id == "cu-1")).Tier);

        await new OrderService(_db).ChangeStatusAsync(placed.Order!.Id, OrderStatus.Cancelled, null, null);
        _db.ChangeTracker.Clear();
        var customer = await _db.Customers.AsNoTracking().FirstAsync(c => c.Id == "cu-1");
        Assert.Equal(2_980_000, customer.TierSpend);
        Assert.Equal(MemberTier.Silver, customer.Tier);
    }

    [Fact]
    public async Task Orders_only_move_one_step_at_a_time_and_cannot_be_cancelled_once_out_for_delivery()
    {
        var placed = await PlaceOnlineAsync(1);
        var orders = new OrderService(_db);
        var id = placed.Order!.Id;

        Assert.False((await orders.ChangeStatusAsync(id, OrderStatus.Delivering, null, null)).Ok);
        Assert.True((await orders.ChangeStatusAsync(id, OrderStatus.Confirmed, null, null)).Ok);
        Assert.True((await orders.ChangeStatusAsync(id, OrderStatus.Preparing, null, null)).Ok);
        Assert.True((await orders.ChangeStatusAsync(id, OrderStatus.Delivering, null, null)).Ok);

        var cancel = await orders.ChangeStatusAsync(id, OrderStatus.Cancelled, null, null);
        Assert.False(cancel.Ok);
        Assert.Contains("Đang giao", cancel.Error);
        Assert.True((await orders.ChangeStatusAsync(id, OrderStatus.Completed, null, null)).Ok);
    }

    [Fact]
    public async Task Cash_on_delivery_counts_as_paid_when_the_order_is_completed()
    {
        var placed = await new OrderService(_db).PlaceAsync(new PlaceOrderInput(
            SalesChannel.Online, "st-1", [new CartLine("tea", 1)], PaymentMethod.Cod, "cu-1", null,
            new DeliveryInput("Khách Vàng", "0901234567", "Số 1 Pasteur", null, 1.2)));
        Assert.Equal(PaymentStatus.Unpaid, placed.Order!.PaymentStatus);
        var orders = new OrderService(_db);
        foreach (var step in new[] { OrderStatus.Confirmed, OrderStatus.Preparing, OrderStatus.Delivering, OrderStatus.Completed })
            await orders.ChangeStatusAsync(placed.Order.Id, step, null, null);
        _db.ChangeTracker.Clear();
        Assert.Equal(PaymentStatus.Paid, (await _db.Orders.AsNoTracking().FirstAsync(o => o.Id == placed.Order.Id)).PaymentStatus);
    }

    [Fact]
    public async Task Selling_at_the_counter_takes_the_earliest_expiring_lot_first()
    {
        var now = DateTime.Now;
        _db.StockLevels.First(s => s.ProductId == "milk").Quantity = 5;
        _db.InventoryBatches.AddRange(
            new InventoryBatch { StoreId = "st-1", ProductId = "milk", LotCode = "OLD", Quantity = 2, ReceivedAt = now.AddDays(-6), ExpiresAt = now.AddDays(1) },
            new InventoryBatch { StoreId = "st-1", ProductId = "milk", LotCode = "NEW", Quantity = 3, ReceivedAt = now, ExpiresAt = now.AddDays(7) });
        await _db.SaveChangesAsync();

        var sold = await new OrderService(_db).PlaceAsync(new PlaceOrderInput(
            SalesChannel.InStore, "st-1", [new CartLine("milk", 3)], PaymentMethod.Cash, null, null, null, "em-1", 100_000));
        Assert.True(sold.Ok, sold.Error);
        Assert.Equal(10_000, sold.Order!.ChangeGiven); // 3 × 30.000 = 90.000, khách đưa 100.000
        _db.ChangeTracker.Clear();

        var lots = await _db.InventoryBatches.AsNoTracking().ToListAsync();
        Assert.DoesNotContain(lots, b => b.LotCode == "OLD");
        Assert.Equal(2, lots.Single(b => b.LotCode == "NEW").Quantity);
    }

    // ---------------------------------------------------------------- nhập hàng, kho

    [Fact]
    public async Task Purchase_order_suggests_short_items_and_receiving_adds_stock_and_a_lot()
    {
        var purchasing = new PurchasingService(_db);
        var draft = await purchasing.CreateDraftAsync("sup-1", "st-1", "em-1", null);
        Assert.True(draft.Ok, draft.Error);
        var line = Assert.Single(draft.Order!.Items);           // sữa còn 2, dưới mức 6
        Assert.Equal("milk", line.ProductId);
        Assert.Equal(18, line.Quantity);                         // 6 × 3 − 2 = 16, làm tròn theo thùng 6
        Assert.Equal(18 * 22_000, draft.Order.Total);

        Assert.False((await purchasing.ReceiveAsync(draft.Order.Id)).Ok); // nháp chưa gửi thì chưa nhận được
        Assert.True((await purchasing.PlaceAsync(draft.Order.Id)).Ok);
        Assert.True((await purchasing.ReceiveAsync(draft.Order.Id)).Ok);
        _db.ChangeTracker.Clear();

        Assert.Equal(20, (await _db.StockLevels.AsNoTracking().FirstAsync(s => s.ProductId == "milk")).Quantity);
        var lot = await _db.InventoryBatches.AsNoTracking().SingleAsync();
        Assert.Equal(18, lot.Quantity);
        Assert.Equal(DateTime.Today.AddDays(7), lot.ExpiresAt!.Value.Date);
        Assert.False((await purchasing.CancelAsync(draft.Order.Id)).Ok); // đã nhập kho thì không huỷ được
    }

    [Fact]
    public async Task Discarding_a_lot_takes_it_out_of_stock()
    {
        _db.StockLevels.First(s => s.ProductId == "milk").Quantity = 5;
        var lot = new InventoryBatch { StoreId = "st-1", ProductId = "milk", LotCode = "HUY", Quantity = 4, ReceivedAt = DateTime.Now.AddDays(-8), ExpiresAt = DateTime.Now.AddDays(-1) };
        _db.InventoryBatches.Add(lot);
        await _db.SaveChangesAsync();

        var inventory = new InventoryService(_db);
        Assert.Equal(BatchState.Expired, InventoryService.StateOf(lot, DateTime.Now));
        Assert.Null(await inventory.DiscardBatchAsync(lot.Id, "cua-hang-khac")); // quản lý cửa hàng khác không đụng được
        Assert.NotNull(await inventory.DiscardBatchAsync(lot.Id, "st-1"));
        _db.ChangeTracker.Clear();
        Assert.Equal(1, (await _db.StockLevels.AsNoTracking().FirstAsync(s => s.ProductId == "milk")).Quantity);
    }

    [Fact]
    public async Task Adjusting_stock_keeps_the_reason_in_the_movement_log()
    {
        var inventory = new InventoryService(_db);
        Assert.Equal("Ghi rõ lý do điều chỉnh", (await inventory.AdjustAsync("st-1", "tea", 7, "Khác", null, "QL")).Error);
        Assert.Equal("Số lượng không đổi, không cần điều chỉnh", (await inventory.AdjustAsync("st-1", "tea", 10, "Kiểm kê", null, "QL")).Error);

        var result = await inventory.AdjustAsync("st-1", "tea", 7, "Hàng hỏng/vỡ", "vỡ 3 ly khi xếp kệ", "Quản lý");
        Assert.True(result.Ok);
        Assert.Equal((10, 7), (result.Before, result.After));
        var log = await _db.StockMovements.AsNoTracking().SingleAsync();
        Assert.Equal((-3, 7, StockMovementKind.Adjust, "Hàng hỏng/vỡ", "vỡ 3 ly khi xếp kệ", "Quản lý"),
            (log.Delta, log.QuantityAfter, log.Kind, log.Reason, log.Note, log.By));

        Assert.Equal("Định mức tối đa 9.999", (await inventory.SetMinAsync("st-1", "tea", 10_000)).Error);
        Assert.True((await inventory.SetMinAsync("st-1", "tea", 8)).Ok);
        Assert.Equal(StockState.Low, InventoryService.StateOf(7, 8));
        Assert.Equal(StockState.Out, InventoryService.StateOf(0, 5));
    }

    [Fact]
    public async Task Stocktake_session_balances_only_the_items_that_differ()
    {
        var inventory = new InventoryService(_db);
        await inventory.SetCountAsync("st-1", "tea", 10, "QL");   // khớp
        await inventory.SetCountAsync("st-1", "milk", 5, "QL");   // sổ 2, đếm 5 → thừa 3
        var result = await inventory.ApplyCountsAsync("st-1", "QL");
        Assert.Equal((2, 1, 1, 0, 3, 0, 3 * 22_000L), (result.Counted, result.Matched, result.Over, result.Short, result.OverUnits, result.ShortUnits, result.ValueDifference));
        _db.ChangeTracker.Clear();
        Assert.Equal(5, (await _db.StockLevels.AsNoTracking().FirstAsync(s => s.ProductId == "milk")).Quantity);
        Assert.Empty(await _db.StocktakeCounts.ToListAsync());
        var log = await _db.StockMovements.AsNoTracking().SingleAsync();
        Assert.Equal((StockMovementKind.Stocktake, 3), (log.Kind, log.Delta));
    }

    // ---------------------------------------------------------------- sao vàng

    [Fact]
    public async Task Redeeming_stars_creates_a_personal_single_use_voucher()
    {
        var loyalty = new LoyaltyService(_db);
        Assert.False((await loyalty.RedeemAsync("cu-1", "sao-50")).Ok); // có 20 sao, cần 50

        var result = await loyalty.RedeemAsync("cu-1", "sao-20");
        Assert.True(result.Ok, result.Error);
        var voucher = result.Voucher!;
        Assert.StartsWith("SAO", voucher.Code);
        Assert.Equal("cu-1", voucher.OwnerId);
        Assert.Equal(22_000, voucher.Value);
        Assert.Equal(1, voucher.UsageLimit);
        _db.ChangeTracker.Clear();
        Assert.Equal(0, (await _db.Customers.AsNoTracking().FirstAsync(c => c.Id == "cu-1")).Stars);

        // Người khác không dùng được voucher riêng.
        var products = await _db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id);
        var promotions = await _db.Promotions.AsNoTracking().ToListAsync();
        var stranger = new Customer { Id = "cu-2", Tier = MemberTier.Bronze };
        var priced = PricingService.PriceCart([new CartLine("tea", 3)], products, promotions, SalesChannel.Online, stranger, voucher.Code, true, DateTime.Now);
        Assert.Equal("Voucher này thuộc tài khoản khác", priced.CodeError);
    }

    [Fact]
    public void Star_take_back_never_goes_below_zero_after_stars_were_spent()
    {
        // Đơn mang lại 2 sao (90.000), khách đã tiêu hết sao: huỷ đơn chỉ trừ được tới 0.
        var (stars, carry, taken) = StarService.TakeBack(stars: 1, carry: 5_000, spend: 90_000, earned: 2);
        Assert.Equal(0, stars);
        Assert.Equal(5_000, carry);
        Assert.Equal(1, taken);
    }

    // ---------------------------------------------------------------- ngân sách, lãi lỗ

    [Fact]
    public void Profit_and_loss_for_30_days_of_the_whole_chain()
    {
        var pnl = BudgetService.Statement(revenue: 4_000_000_000, grossProfit: 1_100_000_000, days: 30, storeCount: 10, singleStore: false);
        Assert.Equal(-435_000_000, pnl.Lines.Single(l => l.Id == "payroll").Amount); // 10 × 37,5 tr + 60 tr văn phòng
        Assert.Equal(-200_000_000, pnl.Lines.Single(l => l.Id == "rent").Amount);
        Assert.Equal(-120_000_000, pnl.Lines.Single(l => l.Id == "utilities").Amount);
        Assert.Equal(-60_000_000, pnl.Lines.Single(l => l.Id == "marketing").Amount);
        Assert.Equal(285_000_000, pnl.NetProfit);
    }

    [Fact]
    public void One_store_carries_its_own_costs_plus_a_share_of_head_office()
    {
        var costs = BudgetService.PerStoreCosts(30, 10);
        Assert.Equal(37_500_000 + 6_000_000, costs.Payroll);
        Assert.Equal(20_000_000 + 12_000_000 + 6_000_000, costs.Rent + costs.Utilities + costs.Marketing);
    }

    [Fact]
    public void Capital_always_adds_back_up_to_the_charter_capital()
    {
        var c = BudgetService.Capital(2_900_000_000);
        Assert.Equal(BudgetService.CharterCapital, c.FixedAssets + c.Inventory + c.Cash);
    }

    [Theory]
    [InlineData(2, 6, 18)]
    [InlineData(0, 4, 12)]
    [InlineData(10, 12, 30)]
    public void Suggested_purchase_quantity_rounds_up_to_whole_cases(int quantity, int min, int expected) =>
        Assert.Equal(expected, PurchasingService.SuggestedQuantity(quantity, min));

    [Fact]
    public void Previous_period_of_a_running_day_stops_at_the_same_time_of_day()
    {
        var now = new DateTime(2026, 10, 6, 14, 30, 0);
        var today = Periods.Preset("hom-nay", now);
        var previous = Periods.Previous(today, now);
        Assert.Equal(new DateTime(2026, 10, 5), previous.From);
        Assert.Equal(new DateTime(2026, 10, 5, 14, 30, 0), previous.To);
    }
}
