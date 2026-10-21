using System.Text;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using Xunit.Abstractions;

namespace SevenEleven.Tests;

/// <summary>
/// Vòng lặp mô phỏng: nạp đúng bộ dữ liệu mẫu thật (10 cửa hàng, 3.000 thành viên, ~32 nghìn đơn), rồi
/// bắn hàng nghìn thao tác ngẫu nhiên qua chính các dịch vụ mà web dùng — đặt đơn online, bán tại quầy,
/// chuyển bước, huỷ đơn, nhập hàng, điều chỉnh/kiểm kê, xuất huỷ lô, đổi sao, xét hạng, vào/kết ca.
/// Sau mỗi bước kiểm các bất biến nhẹ; cứ vài trăm bước kiểm toàn bộ cơ sở dữ liệu.
/// Số bước và hạt giống đổi được qua biến môi trường SIM_OPS / SIM_SEEDS để chạy lặp dài.
/// </summary>
[Trait("Category", "Simulation")]
public sealed class SimulationTests(ITestOutputHelper output)
{
    public static IEnumerable<object[]> Seeds =>
        (Environment.GetEnvironmentVariable("SIM_SEEDS") ?? "11,23")
        .Split(',', StringSplitOptions.RemoveEmptyEntries).Select(s => new object[] { int.Parse(s) });

    private static int Ops => int.TryParse(Environment.GetEnvironmentVariable("SIM_OPS"), out var n) ? n : 1200;

    [Theory]
    [MemberData(nameof(Seeds))]
    public async Task Random_operations_keep_every_invariant(int seed)
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        AppDbContext Fresh() => new(options);

        await using (var db = Fresh()) await SeedData.EnsureSeededAsync(db, DataPath());

        var sim = new Simulation(Fresh, new Random(seed));
        await sim.SnapshotAsync();
        var failures = new List<string>();
        failures.AddRange(await sim.FullCheckAsync("sau khi nạp dữ liệu mẫu"));

        for (var step = 1; step <= Ops && failures.Count == 0; step++)
        {
            var action = await sim.StepAsync();
            failures.AddRange((await sim.QuickCheckAsync()).Select(f => $"bước {step} ({action}): {f}"));
            if (step % 300 == 0 || step == Ops) failures.AddRange(await sim.FullCheckAsync($"bước {step}"));
        }

        output.WriteLine(sim.Report());
        Assert.True(failures.Count == 0, string.Join("\n", failures.Take(30)));
        Assert.True(sim.Placed > Ops / 5, $"Quá ít đơn đặt thành công ({sim.Placed}) — mô phỏng không bắn đủ việc");
    }

    internal static string DataPath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "SevenEleven.Web", "Data"))) dir = dir.Parent;
        return dir is null ? throw new DirectoryNotFoundException("Không thấy SevenEleven.Web/Data") : Path.Combine(dir.FullName, "SevenEleven.Web", "Data");
    }
}

/// <summary>Trạng thái và thao tác của một lượt mô phỏng.</summary>
internal sealed class Simulation(Func<AppDbContext> fresh, Random rng)
{
    private readonly Dictionary<string, int> _counts = [];
    private Dictionary<(string Store, string Product), int> _stockStart = [];
    private long _movementStart;
    private Dictionary<string, (int Orders, int Spent)> _customerStart = [];
    private readonly Dictionary<string, (int Orders, int Spent)> _customerExpected = [];
    private List<Store> _stores = [];
    private List<string> _cashiers = [];

    public int Placed { get; private set; }

    public async Task SnapshotAsync()
    {
        await using var db = fresh();
        _stockStart = await db.StockLevels.ToDictionaryAsync(s => (s.StoreId, s.ProductId), s => s.Quantity);
        _movementStart = await db.StockMovements.MaxAsync(m => (long?)m.Id) ?? 0;
        _customerStart = await db.Customers.ToDictionaryAsync(c => c.Id, c => (c.OrderCount, c.TotalSpent));
        _stores = await db.Stores.AsNoTracking().ToListAsync();
        _cashiers = await db.Employees.Where(e => e.Role == StaffRole.Cashier && e.Status == EmployeeStatus.Active).Select(e => e.Id).ToListAsync();
    }

    private void Count(string what) => _counts[what] = _counts.GetValueOrDefault(what) + 1;

    public string Report() => string.Join(", ", _counts.OrderBy(k => k.Key).Select(k => $"{k.Key}={k.Value}"));

    private T Pick<T>(IReadOnlyList<T> list) => list[rng.Next(list.Count)];

    // ------------------------------------------------------------------ thao tác

    public async Task<string> StepAsync()
    {
        var roll = rng.Next(100);
        var name = roll switch
        {
            < 26 => "online",
            < 50 => "tai-quay",
            < 66 => "chuyen-buoc",
            < 74 => "huy",
            < 79 => "nhap-hang",
            < 84 => "dieu-chinh",
            < 87 => "kiem-ke",
            < 89 => "xuat-huy",
            < 94 => "doi-sao",
            < 96 => "xet-hang",
            _ => "ca",
        };
        var ok = name switch
        {
            "online" => await PlaceAsync(SalesChannel.Online),
            "tai-quay" => await PlaceAsync(SalesChannel.InStore),
            "chuyen-buoc" => await AdvanceAsync(),
            "huy" => await CancelAsync(),
            "nhap-hang" => await PurchaseAsync(),
            "dieu-chinh" => await AdjustAsync(),
            "kiem-ke" => await StocktakeAsync(),
            "xuat-huy" => await DiscardAsync(),
            "doi-sao" => await RedeemAsync(),
            "xet-hang" => await ReviewAsync(),
            _ => await ShiftAsync(),
        };
        Count(ok ? name : name + "-bi-tu-choi");
        return name;
    }

    private async Task<bool> PlaceAsync(SalesChannel channel)
    {
        await using var db = fresh();
        var store = Pick(_stores.Where(s => s.Status == StoreStatus.Active).ToList());
        var inStock = await db.StockLevels.Where(s => s.StoreId == store.Id && s.Quantity > 0 && s.Product!.IsActive)
            .Select(s => new { s.ProductId, s.Quantity }).ToListAsync();
        if (inStock.Count == 0) return false;
        var lines = Enumerable.Range(0, rng.Next(1, 6)).Select(_ => Pick(inStock)).DistinctBy(x => x.ProductId)
            .Select(x => new CartLine(x.ProductId, Math.Min(x.Quantity, rng.Next(1, 4))))
            .ToList();
        // Thỉnh thoảng cố tình mua quá tồn để chắc rằng máy chủ chặn được.
        if (rng.Next(20) == 0) lines[0] = lines[0] with { Quantity = 500 };

        string? customerId = null;
        if (channel == SalesChannel.Online || rng.Next(2) == 0)
            customerId = await db.Customers.OrderBy(c => c.Id).Skip(rng.Next(await db.Customers.CountAsync())).Select(c => c.Id).FirstAsync();
        string? code = null;
        if (rng.Next(4) == 0)
        {
            var codes = await db.Promotions.Where(p => p.Code != null && p.OwnerId == null).Select(p => p.Code!).ToListAsync();
            if (codes.Count > 0) code = Pick(codes);
        }
        PaymentMethod payment = channel == SalesChannel.Online
            ? Pick(new[] { PaymentMethod.Cod, PaymentMethod.Ewallet, PaymentMethod.Card })
            : Pick(new[] { PaymentMethod.Cash, PaymentMethod.Card, PaymentMethod.Ewallet, PaymentMethod.BankTransfer });
        var delivery = channel == SalesChannel.Online
            ? new DeliveryInput("Khách mô phỏng", "0900000000", "1 Đường Thử", null, Math.Round(rng.NextDouble() * 6, 2))
            : null;
        var employee = channel == SalesChannel.InStore
            ? await db.Employees.Where(e => e.StoreId == store.Id && e.Role == StaffRole.Cashier).Select(e => e.Id).FirstOrDefaultAsync()
            : null;
        var cash = payment == PaymentMethod.Cash ? 2_000_000 : (int?)null;

        var result = await new OrderService(db).PlaceAsync(new PlaceOrderInput(channel, store.Id, lines, payment, customerId, code, delivery, employee, cash));
        if (!result.Ok) return false;
        Placed++;
        if (customerId is not null)
        {
            var (orders, spent) = _customerExpected.GetValueOrDefault(customerId, _customerStart[customerId]);
            _customerExpected[customerId] = (orders + 1, spent + result.Order!.Total);
        }
        return true;
    }

    private async Task<Order?> RandomOrderAsync(AppDbContext db, Func<IQueryable<Order>, IQueryable<Order>> filter)
    {
        var ids = await filter(db.Orders).OrderByDescending(o => o.CreatedAt).Take(60).Select(o => o.Id).ToListAsync();
        return ids.Count == 0 ? null : await db.Orders.FindAsync(Pick(ids));
    }

    private async Task<bool> AdvanceAsync()
    {
        await using var db = fresh();
        var order = await RandomOrderAsync(db, q => q.Where(o => o.Channel == SalesChannel.Online && o.Status < OrderStatus.Completed));
        if (order is null || OrderFlow.Next(order.Status) is not OrderStatus next) return false;
        return (await new OrderService(db).ChangeStatusAsync(order.Id, next, "Mô phỏng", null)).Ok;
    }

    private async Task<bool> CancelAsync()
    {
        await using var db = fresh();
        // Cả đơn huỷ được lẫn đơn đã xong/đã huỷ: đơn không huỷ được phải bị từ chối, không đổi gì.
        var anyChannel = rng.Next(2) == 0;
        var order = await RandomOrderAsync(db, q => q.Where(o => anyChannel || o.Channel == SalesChannel.Online));
        if (order is null) return false;
        var before = order.Status;
        var customerId = order.CustomerId;
        var total = order.Total;
        var result = await new OrderService(db).ChangeStatusAsync(order.Id, OrderStatus.Cancelled, "Mô phỏng", "Khách yêu cầu huỷ");
        if (result.Ok != OrderFlow.CanCancel(before) && before != OrderStatus.Cancelled)
            throw new InvalidOperationException($"Huỷ đơn {order.Code} ở bước {before}: kết quả {result.Ok} sai luật");
        if (result.Ok && before != OrderStatus.Cancelled && customerId is not null)
        {
            var (orders, spent) = _customerExpected.GetValueOrDefault(customerId, _customerStart[customerId]);
            _customerExpected[customerId] = (Math.Max(0, orders - 1), Math.Max(0, spent - total));
        }
        return result.Ok && before != OrderStatus.Cancelled;
    }

    private async Task<bool> PurchaseAsync()
    {
        await using var db = fresh();
        var store = Pick(_stores.Where(s => s.Status == StoreStatus.Active).ToList());
        var supplier = Pick(await db.Suppliers.Where(s => s.Status == SupplierStatus.Active).Select(s => s.Id).ToListAsync());
        var service = new PurchasingService(db);
        var draft = await service.CreateDraftAsync(supplier, store.Id, "Mô phỏng", null);
        if (!draft.Ok) return false;
        if (draft.Order!.Items.Count == 0)
        {
            var product = await db.Products.Where(p => p.IsActive).OrderBy(p => p.Id).Skip(rng.Next(50)).Select(p => p.Id).FirstAsync();
            await service.AddItemAsync(draft.Order.Id, product, rng.Next(1, 30));
        }
        if (!(await service.PlaceAsync(draft.Order.Id)).Ok) return false;
        if (rng.Next(5) == 0) return (await service.CancelAsync(draft.Order.Id)).Ok;
        return (await service.ReceiveAsync(draft.Order.Id, "Mô phỏng")).Ok;
    }

    private async Task<bool> AdjustAsync()
    {
        await using var db = fresh();
        var store = Pick(_stores);
        var level = await db.StockLevels.Where(s => s.StoreId == store.Id).OrderBy(s => s.ProductId).Skip(rng.Next(100)).FirstOrDefaultAsync();
        if (level is null) return false;
        var target = Math.Max(0, level.Quantity + rng.Next(-8, 9));
        var reason = Pick(InventoryService.AdjustReasons);
        var result = await new InventoryService(db).AdjustAsync(store.Id, level.ProductId, target, reason, reason == "Khác" ? "Mô phỏng điều chỉnh" : null, "Mô phỏng");
        return result.Ok;
    }

    private async Task<bool> StocktakeAsync()
    {
        await using var db = fresh();
        var store = Pick(_stores);
        var service = new InventoryService(db);
        var levels = await db.StockLevels.Where(s => s.StoreId == store.Id).OrderBy(s => s.ProductId).Skip(rng.Next(60)).Take(rng.Next(1, 8)).ToListAsync();
        foreach (var l in levels) await service.SetCountAsync(store.Id, l.ProductId, Math.Max(0, l.Quantity + rng.Next(-3, 4)), "Mô phỏng");
        await service.ApplyCountsAsync(store.Id, "Mô phỏng");
        return levels.Count > 0;
    }

    private async Task<bool> DiscardAsync()
    {
        await using var db = fresh();
        var ids = await db.InventoryBatches.OrderBy(b => b.ExpiresAt).Take(40).Select(b => b.Id).ToListAsync();
        if (ids.Count == 0) return false;
        return await new InventoryService(db).DiscardBatchAsync(Pick(ids), null, "Mô phỏng") is not null;
    }

    private async Task<bool> RedeemAsync()
    {
        await using var db = fresh();
        var rich = await db.Customers.Where(c => c.Stars >= 10).OrderBy(c => c.Id).Take(80).Select(c => c.Id).ToListAsync();
        if (rich.Count == 0) return false;
        return (await new LoyaltyService(db).RedeemAsync(Pick(rich), Pick(StarService.Rewards).Id)).Ok;
    }

    private async Task<bool> ReviewAsync()
    {
        await using var db = fresh();
        await new MembershipReviewService(db).RunAsync(DateTime.Now);
        // Chạy lại ngay phải không đổi gì nữa.
        await using var again = fresh();
        var second = await new MembershipReviewService(again).RunAsync(DateTime.Now);
        if (second != 0) throw new InvalidOperationException($"Xét hạng chạy lần hai vẫn đổi {second} khách");
        return true;
    }

    private async Task<bool> ShiftAsync()
    {
        await using var db = fresh();
        var employee = await db.Employees.FindAsync(Pick(_cashiers));
        var store = employee?.StoreId is null ? null : await db.Stores.FindAsync(employee.StoreId);
        if (employee is null || store is null) return false;
        var shifts = new ShiftService(db);
        var current = await shifts.CurrentAsync(employee.Id, store.Id);
        if (current is null) return (await shifts.PosCheckInAsync(employee, store, 2_000_000, DateTime.Now)).Ok;
        var summary = await shifts.PosSummaryAsync(current);
        return (await shifts.CheckOutAsync(current.Id, (int)summary.Expected + rng.Next(-1, 2) * 10_000, null, false, DateTime.Now)).Ok;
    }

    // ------------------------------------------------------------------ bất biến

    /// <summary>Kiểm nhanh sau mỗi bước.</summary>
    public async Task<List<string>> QuickCheckAsync()
    {
        await using var db = fresh();
        var failures = new List<string>();
        var negative = await db.StockLevels.Where(s => s.Quantity < 0).Select(s => new { s.StoreId, s.ProductId, s.Quantity }).ToListAsync();
        failures.AddRange(negative.Select(n => $"tồn âm {n.StoreId}/{n.ProductId} = {n.Quantity}"));
        if (await db.InventoryBatches.AnyAsync(b => b.Quantity < 0)) failures.Add("lô có số lượng âm");
        if (await db.Customers.AnyAsync(c => c.Stars < 0)) failures.Add("khách có số sao âm");
        var overused = await db.Promotions.Where(p => p.UsageLimit != null && p.UsageCount > p.UsageLimit).Select(p => p.Code).ToListAsync();
        failures.AddRange(overused.Select(c => $"mã {c} dùng quá số lượt"));
        var doubleShift = await db.Shifts.Where(s => s.Status == ShiftStatus.InProgress)
            .GroupBy(s => s.EmployeeId).Where(g => g.Count() > 1).Select(g => g.Key).ToListAsync();
        failures.AddRange(doubleShift.Select(e => $"nhân viên {e} đang ở hai ca cùng lúc"));
        return failures;
    }

    /// <summary>Kiểm toàn bộ cơ sở dữ liệu.</summary>
    public async Task<List<string>> FullCheckAsync(string when)
    {
        await using var db = fresh();
        var failures = new List<string>();
        void Fail(string message) { if (failures.Count < 40) failures.Add($"[{when}] {message}"); }

        // Tồn kho và nhật ký kho khớp nhau: thay đổi của mỗi mặt hàng từ đầu mô phỏng = tổng biến động đã ghi.
        var stock = await db.StockLevels.AsNoTracking().ToListAsync();
        var moves = await db.StockMovements.AsNoTracking().Where(m => m.Id > _movementStart)
            .GroupBy(m => new { m.StoreId, m.ProductId })
            .Select(g => new { g.Key.StoreId, g.Key.ProductId, Sum = g.Sum(m => m.Delta), LastId = g.Max(m => m.Id) })
            .ToListAsync();
        var moveMap = moves.ToDictionary(m => (m.StoreId, m.ProductId));
        var lastAfter = await db.StockMovements.AsNoTracking().Where(m => m.Id > _movementStart)
            .GroupBy(m => new { m.StoreId, m.ProductId }).Select(g => g.OrderByDescending(m => m.Id).First())
            .ToDictionaryAsync(m => (m.StoreId, m.ProductId), m => m.QuantityAfter);
        foreach (var s in stock)
        {
            var start = _stockStart.GetValueOrDefault((s.StoreId, s.ProductId));
            var logged = moveMap.TryGetValue((s.StoreId, s.ProductId), out var m) ? m.Sum : 0;
            if (s.Quantity - start != logged) Fail($"kho {s.StoreId}/{s.ProductId}: tồn đổi {s.Quantity - start} nhưng nhật ký ghi {logged}");
            if (lastAfter.TryGetValue((s.StoreId, s.ProductId), out var after) && after != s.Quantity)
                Fail($"kho {s.StoreId}/{s.ProductId}: dòng nhật ký cuối ghi còn {after} nhưng tồn là {s.Quantity}");
        }

        // Tổng các lô không vượt tồn thực tế.
        var lots = await db.InventoryBatches.AsNoTracking().GroupBy(b => new { b.StoreId, b.ProductId })
            .Select(g => new { g.Key.StoreId, g.Key.ProductId, Sum = g.Sum(b => b.Quantity) }).ToListAsync();
        var stockMap = stock.ToDictionary(s => (s.StoreId, s.ProductId), s => s.Quantity);
        foreach (var l in lots)
            if (l.Sum > stockMap.GetValueOrDefault((l.StoreId, l.ProductId)))
                Fail($"lô {l.StoreId}/{l.ProductId}: tổng lô {l.Sum} > tồn {stockMap.GetValueOrDefault((l.StoreId, l.ProductId))}");

        // Thành viên: hạng đúng theo chi tiêu tích luỹ; sổ sao khớp số sao; đếm đơn và chi tiêu đi đúng theo thao tác.
        var customers = await db.Customers.AsNoTracking().ToListAsync();
        var ledger = await db.StarEntries.GroupBy(e => e.CustomerId).Select(g => new { g.Key, Sum = g.Sum(e => e.Delta) }).ToDictionaryAsync(x => x.Key, x => x.Sum);
        foreach (var c in customers)
        {
            if (c.Tier != MembershipService.TierForSpend(c.TierSpend)) Fail($"khách {c.Id}: hạng {c.Tier} nhưng chi tiêu {c.TierSpend}");
            if (ledger.GetValueOrDefault(c.Id) != c.Stars) Fail($"khách {c.Id}: {c.Stars} sao nhưng sổ sao cộng ra {ledger.GetValueOrDefault(c.Id)}");
            if (c.StarCarry is < 0 or >= StarService.StarSpend) Fail($"khách {c.Id}: phần lẻ sao {c.StarCarry} ngoài khoảng");
            if (_customerExpected.TryGetValue(c.Id, out var expected) && (c.OrderCount, c.TotalSpent) != expected)
                Fail($"khách {c.Id}: số đơn/chi tiêu {(c.OrderCount, c.TotalSpent)} khác kỳ vọng {expected}");
        }

        // Đơn hàng: tiền cộng đúng, tiến trình khớp trạng thái, trạng thái thanh toán đúng luật.
        var orders = await db.Orders.AsNoTracking().Include(o => o.Items).Include(o => o.Timeline).AsSplitQuery().ToListAsync();
        foreach (var o in orders)
        {
            var goods = o.Items.Sum(i => i.LineTotal);
            var itemDiscount = o.Items.Sum(i => i.Discount);
            var orderDiscount = o.Discount - itemDiscount;
            if (o.Subtotal != o.Items.Sum(i => i.UnitPrice * i.Quantity)) Fail($"đơn {o.Code}: tạm tính {o.Subtotal} khác tổng đơn giá × SL");
            if (o.Items.Any(i => i.LineTotal != i.UnitPrice * i.Quantity - i.Discount)) Fail($"đơn {o.Code}: thành tiền một dòng không khớp");
            if (orderDiscount < 0) Fail($"đơn {o.Code}: giảm giá cả đơn âm ({orderDiscount})");
            if (o.Total != goods - orderDiscount + o.ShippingFee) Fail($"đơn {o.Code}: tổng {o.Total} ≠ {goods} − {orderDiscount} + {o.ShippingFee}");
            if (o.Total < 0) Fail($"đơn {o.Code}: tổng âm");
            if (o.Channel == SalesChannel.InStore && o.ShippingFee != 0) Fail($"đơn {o.Code}: bán tại quầy mà có phí giao");
            var last = o.Timeline.OrderBy(t => t.At).ThenBy(t => t.Id).LastOrDefault();
            if (last is null || last.Status != o.Status) Fail($"đơn {o.Code}: tiến trình cuối {last?.Status} khác trạng thái {o.Status}");
            var expectedPayment = o switch
            {
                { Channel: SalesChannel.InStore } => PaymentStatus.Paid,
                { PaymentMethod: PaymentMethod.Cod, Status: OrderStatus.Completed } => PaymentStatus.Paid,
                { PaymentMethod: PaymentMethod.Cod } => PaymentStatus.Unpaid,
                { Status: OrderStatus.Cancelled } => PaymentStatus.Refunded,
                _ => PaymentStatus.Paid,
            };
            if (o.PaymentStatus != expectedPayment) Fail($"đơn {o.Code}: thanh toán {o.PaymentStatus}, đúng ra {expectedPayment}");
            if (o.PaymentMethod == PaymentMethod.Cash && (o.CashReceived is not int cash || cash < o.Total || o.ChangeGiven != cash - o.Total))
                Fail($"đơn {o.Code}: tiền mặt khách đưa / thối lại không khớp");
        }

        // Mã giảm giá: số lượt đã dùng = số đơn chưa huỷ dùng mã đó.
        var used = orders.Where(o => o.PromotionCode is not null && o.Status != OrderStatus.Cancelled)
            .GroupBy(o => o.PromotionCode!).ToDictionary(g => g.Key, g => g.Count());
        foreach (var p in await db.Promotions.AsNoTracking().Where(p => p.Code != null).ToListAsync())
            if (p.UsageCount != used.GetValueOrDefault(p.Code!)) Fail($"mã {p.Code}: đếm {p.UsageCount} lượt nhưng có {used.GetValueOrDefault(p.Code!)} đơn dùng");

        return failures;
    }
}
