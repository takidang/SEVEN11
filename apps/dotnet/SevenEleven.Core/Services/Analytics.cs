using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>Khoảng thời gian báo cáo [From, To), tính theo ngày lịch.</summary>
public record Period(DateTime From, DateTime To, string Label)
{
    public int Days => Math.Max(1, (int)Math.Round((To.Date - From.Date).TotalDays));
}

/// <summary>Những gì báo cáo cần của một đơn — đọc gọn thay vì nạp cả đơn.</summary>
public record OrderFact(
    string Id, string Code, string StoreId, SalesChannel Channel, OrderStatus Status, PaymentMethod Payment,
    DateTime CreatedAt, int Total, int Discount, int ShippingFee, string? EmployeeId, bool HasDelivery, double? DistanceKm)
{
    /// <summary>Đơn tính vào doanh thu: mọi đơn trừ đơn đã huỷ.</summary>
    public bool Counts => Status != OrderStatus.Cancelled;
}

public record ItemFact(string OrderId, string ProductId, int Quantity, int LineTotal);

public record SalesSummary(int Orders, long Revenue, long Discount, long GrossProfit, int Quantity)
{
    public double Aov => Orders > 0 ? (double)Revenue / Orders : 0;
    public double Margin => Revenue > 0 ? (double)GrossProfit / Revenue : 0;
}

public record DailySales(DateTime Date, int Orders, long Revenue, long Discount, long GrossProfit)
{
    public double Aov => Orders > 0 ? (double)Revenue / Orders : 0;
    public double Margin => Revenue > 0 ? (double)GrossProfit / Revenue : 0;
}

public record StoreSales(Store Store, int Orders, long Revenue, int OnlineOrders, long GrossProfit)
{
    public double Aov => Orders > 0 ? (double)Revenue / Orders : 0;
    public double OnlineShare => Orders > 0 ? (double)OnlineOrders / Orders : 0;
    public double Margin => Revenue > 0 ? (double)GrossProfit / Revenue : 0;
}

public record CategorySales(Category Category, int Quantity, long Revenue, long GrossProfit, double Share)
{
    public double Margin => Revenue > 0 ? (double)GrossProfit / Revenue : 0;
}

public record ProductSales(Product Product, int Quantity, long Revenue, long GrossProfit)
{
    public double Margin => Revenue > 0 ? (double)GrossProfit / Revenue : 0;
}

public record PaymentSales(PaymentMethod Method, int Orders, long Revenue, double Share);

public record EmployeeSales(Employee Employee, int Orders, long Revenue, long CashRevenue)
{
    public double Aov => Orders > 0 ? (double)Revenue / Orders : 0;
}

public record DeliverySales(Store Store, int Orders, long Revenue, long Collected, int FreeTrips, double Km)
{
    public double AvgKm => Orders > 0 ? Km / Orders : 0;
}

public record CancellationStats(int Placed, int Cancelled, long CancelledValue)
{
    public double Rate => Placed > 0 ? (double)Cancelled / Placed : 0;
}

/// <summary>
/// Đơn và dòng hàng của một khoảng thời gian, đã lọc theo cửa hàng và kênh bán, kèm các phép
/// tổng hợp chuyển từ lib/analytics.ts. Lãi gộp = tiền dòng hàng − giá vốn hiện tại × số lượng.
/// </summary>
public class SalesData
{
    public List<OrderFact> Orders { get; }
    private readonly IReadOnlyDictionary<string, Product> _products;
    private readonly Dictionary<string, List<ItemFact>> _itemsByOrder;

    public SalesData(List<OrderFact> orders, List<ItemFact> items, IReadOnlyDictionary<string, Product> products)
    {
        Orders = orders;
        _products = products;
        _itemsByOrder = items.GroupBy(i => i.OrderId).ToDictionary(g => g.Key, g => g.ToList());
    }

    public static async Task<SalesData> LoadAsync(
        AppDbContext db, DateTime from, DateTime to, string? storeId, SalesChannel? channel,
        IReadOnlyDictionary<string, Product> products)
    {
        var orders = db.Orders.AsNoTracking().Where(o => o.CreatedAt >= from && o.CreatedAt < to);
        if (storeId is not null) orders = orders.Where(o => o.StoreId == storeId);
        if (channel is SalesChannel c) orders = orders.Where(o => o.Channel == c);

        var facts = await orders
            .Select(o => new OrderFact(o.Id, o.Code, o.StoreId, o.Channel, o.Status, o.PaymentMethod, o.CreatedAt,
                o.Total, o.Discount, o.ShippingFee, o.EmployeeId, o.Delivery != null, o.Delivery != null ? o.Delivery.DistanceKm : null))
            .ToListAsync();
        var items = await orders
            .Where(o => o.Status != OrderStatus.Cancelled)
            .SelectMany(o => o.Items)
            .Select(i => new ItemFact(i.OrderId, i.ProductId, i.Quantity, i.LineTotal))
            .ToListAsync();
        return new SalesData(facts, items, products);
    }

    private IEnumerable<ItemFact> ItemsOf(OrderFact order) =>
        _itemsByOrder.TryGetValue(order.Id, out var list) ? list : [];

    private long Cost(ItemFact item) => (long)(_products.TryGetValue(item.ProductId, out var p) ? p.CostPrice : 0) * item.Quantity;

    public long GrossProfit(OrderFact order) => ItemsOf(order).Sum(i => i.LineTotal - Cost(i));

    private IEnumerable<OrderFact> Counted(DateTime? from = null, DateTime? to = null) =>
        Orders.Where(o => o.Counts && (from is null || o.CreatedAt >= from) && (to is null || o.CreatedAt < to));

    public SalesSummary Summary(DateTime? from = null, DateTime? to = null)
    {
        int orders = 0, quantity = 0;
        long revenue = 0, discount = 0, gross = 0;
        foreach (var o in Counted(from, to))
        {
            orders++;
            revenue += o.Total;
            discount += o.Discount;
            foreach (var i in ItemsOf(o))
            {
                gross += i.LineTotal - Cost(i);
                quantity += i.Quantity;
            }
        }
        return new SalesSummary(orders, revenue, discount, gross, quantity);
    }

    /// <summary>Mỗi ngày lịch trong khoảng một dòng, kể cả ngày không bán được gì; cũ nhất trước.</summary>
    public List<DailySales> Daily(DateTime from, DateTime to)
    {
        var byDay = Counted(from, to).GroupBy(o => o.CreatedAt.Date).ToDictionary(g => g.Key, g => g.ToList());
        var rows = new List<DailySales>();
        for (var d = from.Date; d < to; d = d.AddDays(1))
        {
            var list = byDay.GetValueOrDefault(d) ?? [];
            rows.Add(new DailySales(d, list.Count, list.Sum(o => (long)o.Total), list.Sum(o => (long)o.Discount), list.Sum(GrossProfit)));
        }
        return rows;
    }

    /// <summary>Doanh thu theo giờ trong ngày (chỉ số 0 là 00:00–00:59).</summary>
    public long[] Hourly(DateTime day)
    {
        var hours = new long[24];
        foreach (var o in Counted(day.Date, day.Date.AddDays(1))) hours[o.CreatedAt.Hour] += o.Total;
        return hours;
    }

    /// <summary>Mỗi cửa hàng một dòng, kể cả cửa hàng chưa bán được gì; doanh thu cao nhất trước.</summary>
    public List<StoreSales> ByStore(IEnumerable<Store> stores)
    {
        var groups = Counted().GroupBy(o => o.StoreId).ToDictionary(g => g.Key, g => g.ToList());
        return stores.Select(s =>
        {
            var list = groups.GetValueOrDefault(s.Id) ?? [];
            return new StoreSales(s, list.Count, list.Sum(o => (long)o.Total), list.Count(o => o.Channel == SalesChannel.Online), list.Sum(GrossProfit));
        }).OrderByDescending(r => r.Revenue).ToList();
    }

    public List<CategorySales> ByCategory(IEnumerable<Category> categories)
    {
        var rows = categories.ToDictionary(c => c.Id, c => (Category: c, Quantity: 0, Revenue: 0L, Gross: 0L));
        long total = 0;
        foreach (var o in Counted())
        {
            foreach (var i in ItemsOf(o))
            {
                if (!_products.TryGetValue(i.ProductId, out var p) || !rows.TryGetValue(p.CategoryId, out var row)) continue;
                rows[p.CategoryId] = (row.Category, row.Quantity + i.Quantity, row.Revenue + i.LineTotal, row.Gross + i.LineTotal - Cost(i));
                total += i.LineTotal;
            }
        }
        return rows.Values
            .Select(r => new CategorySales(r.Category, r.Quantity, r.Revenue, r.Gross, total > 0 ? (double)r.Revenue / total : 0))
            .OrderByDescending(r => r.Revenue)
            .ToList();
    }

    public List<ProductSales> TopProducts(int take, bool byQuantity = false)
    {
        var rows = Counted()
            .SelectMany(ItemsOf)
            .GroupBy(i => i.ProductId)
            .Where(g => _products.ContainsKey(g.Key))
            .Select(g => new ProductSales(_products[g.Key], g.Sum(i => i.Quantity), g.Sum(i => (long)i.LineTotal), g.Sum(i => i.LineTotal - Cost(i))));
        rows = byQuantity
            ? rows.OrderByDescending(r => r.Quantity).ThenByDescending(r => r.Revenue)
            : rows.OrderByDescending(r => r.Revenue).ThenByDescending(r => r.Quantity);
        return rows.Take(take).ToList();
    }

    public List<PaymentSales> ByPayment()
    {
        var counted = Counted().ToList();
        long total = counted.Sum(o => (long)o.Total);
        return Enum.GetValues<PaymentMethod>()
            .Select(m =>
            {
                var list = counted.Where(o => o.Payment == m).ToList();
                var revenue = list.Sum(o => (long)o.Total);
                return new PaymentSales(m, list.Count, revenue, total > 0 ? (double)revenue / total : 0);
            })
            .OrderByDescending(r => r.Revenue)
            .ToList();
    }

    /// <summary>Doanh thu theo nhân viên đứng quầy hoặc xác nhận đơn online; ai chưa bán cũng có dòng.</summary>
    public List<EmployeeSales> ByEmployee(IEnumerable<Employee> employees)
    {
        var groups = Counted().Where(o => o.EmployeeId is not null).GroupBy(o => o.EmployeeId!).ToDictionary(g => g.Key, g => g.ToList());
        return employees.Select(e =>
        {
            var list = groups.GetValueOrDefault(e.Id) ?? [];
            return new EmployeeSales(e, list.Count, list.Sum(o => (long)o.Total), list.Where(o => o.Payment == PaymentMethod.Cash).Sum(o => (long)o.Total));
        }).OrderByDescending(r => r.Revenue).ThenByDescending(r => r.Orders).ToList();
    }

    /// <summary>Đơn đã giao theo cửa hàng: bao nhiêu chuyến, quãng đường, phí giao khách đã trả.</summary>
    public List<DeliverySales> Delivery(IEnumerable<Store> stores)
    {
        var groups = Counted().Where(o => o.HasDelivery).GroupBy(o => o.StoreId).ToDictionary(g => g.Key, g => g.ToList());
        return stores
            .Where(s => groups.ContainsKey(s.Id))
            .Select(s =>
            {
                var list = groups[s.Id];
                return new DeliverySales(s, list.Count, list.Sum(o => (long)o.Total), list.Sum(o => (long)o.ShippingFee),
                    list.Count(o => o.ShippingFee == 0), list.Sum(o => o.DistanceKm ?? 0));
            })
            .OrderByDescending(r => r.Orders)
            .ToList();
    }

    /// <summary>Tỉ lệ huỷ của đơn online (đơn tại quầy không huỷ được).</summary>
    public CancellationStats OnlineCancellation()
    {
        var online = Orders.Where(o => o.Channel == SalesChannel.Online).ToList();
        var cancelled = online.Where(o => o.Status == OrderStatus.Cancelled).ToList();
        return new CancellationStats(online.Count, cancelled.Count, cancelled.Sum(o => (long)o.Total));
    }
}

/// <summary>Các khoảng thời gian báo cáo dựng sẵn, giống presetPeriod / previousPeriod bên Next.js.</summary>
public static class Periods
{
    public static readonly (string Key, string Label)[] Presets =
    [
        ("hom-nay", "Hôm nay"),
        ("7-ngay", "7 ngày qua"),
        ("30-ngay", "30 ngày qua"),
        ("thang-nay", "Tháng này"),
        ("thang-truoc", "Tháng trước"),
    ];

    /// <summary>Các ngày lịch từ first tới last, tính cả hai đầu.</summary>
    public static Period OfDays(DateTime first, DateTime last, string label) => new(first.Date, last.Date.AddDays(1), label);

    public static Period Preset(string? key, DateTime now)
    {
        var today = now.Date;
        var monthStart = new DateTime(today.Year, today.Month, 1);
        return key switch
        {
            "hom-nay" => OfDays(today, today, "Hôm nay"),
            "7-ngay" => OfDays(today.AddDays(-6), today, "7 ngày qua"),
            "thang-nay" => OfDays(monthStart, today, $"Tháng {today:MM/yyyy}"),
            "thang-truoc" => OfDays(monthStart.AddMonths(-1), monthStart.AddDays(-1), $"Tháng {monthStart.AddMonths(-1):MM/yyyy}"),
            _ => OfDays(today.AddDays(-29), today, "30 ngày qua"),
        };
    }

    /// <summary>
    /// Kỳ trước dài bằng kỳ này, ngay trước nó. Kỳ này còn đang chạy thì kỳ trước cũng cắt ở cùng giờ,
    /// để nửa ngày hôm nay so với đúng chừng ấy giờ chứ không phải trọn một ngày.
    /// </summary>
    public static Period Previous(Period period, DateTime now)
    {
        var from = period.From.AddDays(-period.Days);
        var fullEnd = period.To.AddDays(-period.Days);
        var running = now >= period.From && now < period.To;
        var sameTime = now.AddDays(-period.Days);
        return new Period(from, running && sameTime < fullEnd ? sameTime : fullEnd, "Kỳ trước");
    }

    /// <summary>Thay đổi tương đối (0,12 = +12%); null khi không có gì để so.</summary>
    public static double? Change(double current, double previous) => previous > 0 ? (current - previous) / previous : null;
}
