using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Bảng điều khiển: số hôm nay, xu hướng 30 ngày, việc cần xử lý, ngân sách tháng.</summary>
[Authorize(AuthenticationSchemes = StaffAuth.Scheme, Roles = Roles.Managers)]
public class DashboardController(AppDbContext db, InventoryService inventory) : AdminController(db)
{
    public async Task<IActionResult> Index()
    {
        var now = DateTime.Now;
        var today = now.Date;
        var scope = ScopeStoreId;
        var products = await Db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id);
        var stores = await Db.Stores.AsNoTracking().OrderBy(s => s.Code).ToListAsync();
        var data = await SalesData.LoadAsync(Db, today.AddDays(-29), now.AddMinutes(1), scope, null, products);
        // Các khối "7 ngày" (gồm hôm nay tới hiện tại) đọc riêng để khỏi lọc lại 30 ngày.
        var week = await SalesData.LoadAsync(Db, today.AddDays(-6), now.AddMinutes(1), scope, null, products);
        var categories = await Db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);

        // Hôm nay tới giờ này, so với hôm qua tới đúng giờ này: so nửa ngày với nửa ngày.
        var todaySales = data.Summary(today, now.AddMinutes(1));
        var yesterday = data.Summary(today.AddDays(-1), now.AddDays(-1));

        var pendingQuery = Db.Orders.Where(o => o.Channel == SalesChannel.Online && o.Status == OrderStatus.Pending);
        if (scope is not null) pendingQuery = pendingQuery.Where(o => o.StoreId == scope);
        var oldestPending = await pendingQuery.MinAsync(o => (DateTime?)o.CreatedAt);

        var stock = Db.StockLevels.Where(s => s.Product!.IsActive);
        var batches = Db.InventoryBatches.Where(b => b.Quantity > 0 && b.ExpiresAt != null && b.ExpiresAt < now.AddHours(24));
        var awaiting = Db.PurchaseOrders.Where(p => p.Status == PurchaseOrderStatus.Ordered);
        var monthStart = new DateTime(now.Year, now.Month, 1);
        var purchased = Db.PurchaseOrders.Where(p =>
            (p.Status == PurchaseOrderStatus.Ordered || p.Status == PurchaseOrderStatus.Received) && (p.ReceivedAt ?? p.CreatedAt) >= monthStart);
        var live = Db.Orders.Include(o => o.Store).Include(o => o.Customer).Include(o => o.Delivery)
            .Where(o => o.Channel == SalesChannel.Online && o.Status != OrderStatus.Completed && o.Status != OrderStatus.Cancelled);
        if (scope is not null)
        {
            stock = stock.Where(s => s.StoreId == scope);
            batches = batches.Where(b => b.StoreId == scope);
            awaiting = awaiting.Where(p => p.StoreId == scope);
            purchased = purchased.Where(p => p.StoreId == scope);
            live = live.Where(o => o.StoreId == scope);
        }

        // Mỗi cửa hàng tự gánh lương, mặt bằng, điện nước: cả chuỗi có lãi vẫn có thể có cửa hàng lỗ.
        var perStore = BudgetService.PerStoreCosts(30, stores.Count).Total;
        var storeRows = scope is null
            ? data.ByStore(stores).Select(r => new StoreProfit(r, r.GrossProfit - perStore)).ToList()
            : [];
        var weekCosts = BudgetService.PerStoreCosts(7, stores.Count).Total;
        var weekStores = scope is null
            ? week.ByStore(stores).Select(r => new StoreProfit(r, r.GrossProfit - weekCosts)).ToList()
            : [];

        // Trung bình cùng giờ của 7 ngày trước hôm nay.
        var average = new double[24];
        for (var d = 1; d <= 7; d++)
        {
            var hours = data.Hourly(today.AddDays(-d));
            for (var h = 0; h < 24; h++) average[h] += hours[h] / 7.0;
        }
        var weekCounted = week.Orders.Where(o => o.Counts).ToList();
        var channels = new[] { SalesChannel.InStore, SalesChannel.Online }.Select(ch =>
        {
            var list = weekCounted.Where(o => o.Channel == ch).ToList();
            return new ChannelShare(ch, list.Count, list.Sum(o => (long)o.Total), weekCounted.Count, weekCounted.Sum(o => (long)o.Total));
        }).ToList();
        var liveCount = await live.CountAsync();

        var inventoryCost = await inventory.InventoryCostAsync(scope);
        var model = new DashboardModel
        {
            Now = now,
            Today = todaySales,
            Yesterday = yesterday,
            Month = data.Summary(),
            Daily = data.Daily(today.AddDays(-29), today.AddDays(1)),
            Hourly = data.Hourly(today),
            PendingOnline = await pendingQuery.CountAsync(),
            OldestPending = oldestPending,
            StockOut = await stock.CountAsync(s => s.Quantity <= 0),
            StockLow = await stock.CountAsync(s => s.Quantity > 0 && s.Quantity <= s.MinQuantity),
            BatchesExpiring = await batches.CountAsync(),
            BatchesExpired = await batches.CountAsync(b => b.ExpiresAt <= now),
            PurchasesAwaiting = await awaiting.CountAsync(),
            PurchasesLate = await awaiting.CountAsync(p => p.ExpectedAt < now),
            Stores = storeRows,
            LiveOrders = await live.OrderByDescending(o => o.CreatedAt).Take(scope is null ? 8 : 6).ToListAsync(),
            LiveCount = liveCount,
            HourlyAverage = average,
            Channels = channels,
            WeekStores = weekStores,
            WeekProducts = week.TopProducts(8, byQuantity: true),
            CategoryNames = categories,
            InventoryCost = inventoryCost,
            Budget = BudgetService.Build(await purchased.SumAsync(p => (long)p.Total), stores.Count, scope is not null, now),
            Capital = BudgetService.Capital(scope is null ? inventoryCost : await inventory.InventoryCostAsync(null)),
            IsChain = scope is null,
        };
        ViewData["Title"] = "Tổng quan";
        return View(model);
    }
}

public record StoreProfit(StoreSales Sales, long NetProfit);

/// <summary>Một kênh bán trong 7 ngày: phần doanh thu và phần số đơn trên tổng.</summary>
public record ChannelShare(SalesChannel Channel, int Orders, long Revenue, int TotalOrders, long TotalRevenue)
{
    public double OrderShare => TotalOrders > 0 ? (double)Orders / TotalOrders : 0;
    public double RevenueShare => TotalRevenue > 0 ? (double)Revenue / TotalRevenue : 0;
    public double Aov => Orders > 0 ? (double)Revenue / Orders : 0;
}

public class DashboardModel
{
    public DateTime Now { get; init; }
    public SalesSummary Today { get; init; } = null!;
    public SalesSummary Yesterday { get; init; } = null!;
    public SalesSummary Month { get; init; } = null!;
    public List<DailySales> Daily { get; init; } = [];
    public long[] Hourly { get; init; } = [];
    public int PendingOnline { get; init; }
    public DateTime? OldestPending { get; init; }
    public int StockOut { get; init; }
    public int StockLow { get; init; }
    public int BatchesExpiring { get; init; }
    public int BatchesExpired { get; init; }
    public int PurchasesAwaiting { get; init; }
    public int PurchasesLate { get; init; }
    public List<StoreProfit> Stores { get; init; } = [];
    public List<Order> LiveOrders { get; init; } = [];
    public int LiveCount { get; init; }
    public double[] HourlyAverage { get; init; } = [];
    public List<ChannelShare> Channels { get; init; } = [];
    public List<StoreProfit> WeekStores { get; init; } = [];
    public List<ProductSales> WeekProducts { get; init; } = [];
    public Dictionary<string, string> CategoryNames { get; init; } = [];
    public long InventoryCost { get; init; }
    public List<BudgetRow> Budget { get; init; } = [];
    public CapitalBreakdown Capital { get; init; } = null!;
    public bool IsChain { get; init; }
}
