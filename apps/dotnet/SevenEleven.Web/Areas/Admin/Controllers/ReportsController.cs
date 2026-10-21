using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Báo cáo theo kỳ: doanh thu, lãi lỗ, hàng hoá, cửa hàng, nhân viên, thanh toán, giao hàng; xuất CSV
/// đúng bảng đang xem. Mọi con số tính từ đơn thật; chi phí vận hành lấy từ định mức trong BudgetService.
/// </summary>
[Authorize(AuthenticationSchemes = StaffAuth.Scheme, Roles = Roles.Managers)]
public class ReportsController(AppDbContext db) : AdminController(db)
{
    public static readonly (string Key, string Label, bool ChainOnly)[] Tabs =
    [
        ("doanh-thu", "Doanh thu", false),
        ("lai-lo", "Lãi lỗ", false),
        ("hang-hoa", "Hàng hoá", false),
        ("cua-hang", "Cửa hàng", true),
        ("nhan-vien", "Nhân viên", false),
        ("thanh-toan", "Thanh toán", false),
        ("giao-hang", "Giao hàng", false),
    ];

    public static readonly (string Key, string Label)[] Presets =
        [("7-ngay", "7 ngày gần nhất"), ("30-ngay", "30 ngày gần nhất"), ("thang-nay", "Tháng này"), ("thang-truoc", "Tháng trước"), ("tuy-chon", "Tuỳ chọn")];

    public async Task<IActionResult> Index(string? tab, string? period, SalesChannel? channel, DateTime? from, DateTime? to)
    {
        var model = await BuildAsync(tab, period, channel, from, to);
        ViewData["Title"] = "Báo cáo";
        return View(model);
    }

    /// <summary>Xuất CSV của tab đang xem, cùng bộ lọc.</summary>
    public async Task<IActionResult> Export(string? tab, string? period, SalesChannel? channel, DateTime? from, DateTime? to)
    {
        var m = await BuildAsync(tab, period, channel, from, to);
        var scopeStore = ScopeStoreId is null ? null : await Db.Stores.FindAsync(ScopeStoreId);
        var csv = new CsvWriter()
            .Row("Báo cáo", Tabs.First(t => t.Key == m.Tab).Label)
            .Row("Phạm vi", scopeStore is null ? "Toàn chuỗi" : $"Cửa hàng {scopeStore.Code} – {scopeStore.Name}")
            .Row("Kỳ báo cáo", $"{m.Range.From:dd/MM/yyyy} – {m.Range.To.AddDays(-1):dd/MM/yyyy}")
            .Row("Kênh bán", m.Channel is SalesChannel c ? Labels.Channel(c) : "Tất cả kênh")
            .Row("Xuất lúc", m.Now.ToString("dd/MM/yyyy HH:mm"));
        WriteSections(csv, m);
        var name = $"bao-cao-{m.Tab}_{m.Range.From:yyyy-MM-dd}_{m.Range.To.AddDays(-1):yyyy-MM-dd}{(scopeStore is null ? "" : $"_ch{scopeStore.Code}")}.csv";
        return File(csv.ToBytes(), "text/csv; charset=utf-8", name);
    }

    private static CsvPercent Pct(double part, double whole) => new(whole > 0 ? part / whole : null);

    private static void WriteSections(CsvWriter csv, ReportModel m)
    {
        var s = m.Summary;
        switch (m.Tab)
        {
            case "doanh-thu":
                csv.Blank().Row("Doanh thu theo ngày").Row("Ngày", "Số đơn", "Doanh thu (₫)", "Giảm giá (₫)", "Lợi nhuận gộp (₫)", "Biên %");
                foreach (var d in m.Daily) csv.Row(d.Date, d.Orders, d.Revenue, d.Discount, d.GrossProfit, Pct(d.GrossProfit, d.Revenue));
                csv.Row("Tổng cộng", s.Orders, s.Revenue, s.Discount, s.GrossProfit, Pct(s.GrossProfit, s.Revenue));
                break;
            case "lai-lo":
                csv.Blank().Row("Lãi lỗ").Row("Khoản mục", "Số tiền (₫)");
                foreach (var line in m.Pnl!.Lines) csv.Row(line.Label, line.Amount);
                break;
            case "hang-hoa":
                csv.Blank().Row("Doanh thu theo danh mục").Row("Danh mục", "SL bán", "Doanh thu (₫)", "Lợi nhuận gộp (₫)", "Biên %", "Tỷ trọng");
                foreach (var c in m.Categories) csv.Row(c.Category.Name, c.Quantity, c.Revenue, c.GrossProfit, Pct(c.GrossProfit, c.Revenue), new CsvPercent(c.Share));
                csv.Row("Tổng cộng", m.Categories.Sum(c => c.Quantity), m.Categories.Sum(c => c.Revenue), m.Categories.Sum(c => c.GrossProfit),
                    Pct(m.Categories.Sum(c => c.GrossProfit), m.Categories.Sum(c => c.Revenue)), new CsvPercent(m.Categories.Count > 0 ? 1 : null));
                csv.Blank().Row("Top 20 sản phẩm theo doanh thu").Row("#", "SKU", "Sản phẩm", "SL", "Doanh thu (₫)", "Lợi nhuận gộp (₫)");
                for (var i = 0; i < m.Products.Count; i++)
                {
                    var p = m.Products[i];
                    csv.Row(i + 1, p.Product.Sku, p.Product.Name, p.Quantity, p.Revenue, p.GrossProfit);
                }
                break;
            case "cua-hang":
                csv.Blank().Row("Doanh thu theo cửa hàng").Row("Cửa hàng", "Số đơn", "Doanh thu (₫)", "TB/đơn (₫)", "Online %", "Lợi nhuận gộp (₫)", "Lãi thuần (₫)");
                foreach (var r in m.Stores)
                    csv.Row($"{r.Sales.Store.Code} – {r.Sales.Store.Name}", r.Sales.Orders, r.Sales.Revenue, (long)Math.Round(r.Sales.Aov), Pct(r.Sales.OnlineOrders, r.Sales.Orders), r.Sales.GrossProfit, r.NetProfit);
                var orders = m.Stores.Sum(r => r.Sales.Orders);
                var revenue = m.Stores.Sum(r => r.Sales.Revenue);
                csv.Row("Toàn chuỗi", orders, revenue, orders > 0 ? (long)Math.Round(revenue / (double)orders) : 0, Pct(m.Stores.Sum(r => r.Sales.OnlineOrders), orders),
                    m.Stores.Sum(r => r.Sales.GrossProfit), m.Stores.Sum(r => r.NetProfit));
                break;
            case "nhan-vien":
                csv.Blank().Row("Doanh thu theo nhân viên").Row("Nhân viên", "Cửa hàng", "Số đơn", "Doanh thu (₫)", "TB/đơn (₫)", "Tỷ lệ tiền mặt");
                foreach (var e in m.Employees)
                    csv.Row($"{e.Employee.FullName} ({e.Employee.Code})", e.Employee.Store?.Code, e.Orders, e.Revenue, (long)Math.Round(e.Aov), Pct(e.CashRevenue, e.Revenue));
                csv.Row("Tổng cộng", "", m.Employees.Sum(e => e.Orders), m.Employees.Sum(e => e.Revenue), "", Pct(m.Employees.Sum(e => e.CashRevenue), m.Employees.Sum(e => e.Revenue)));
                break;
            case "thanh-toan":
                csv.Blank().Row("Doanh thu theo phương thức thanh toán").Row("Phương thức", "Số đơn", "Doanh thu (₫)", "Tỷ trọng");
                foreach (var p in m.Payments) csv.Row(Labels.Payment(p.Method), p.Orders, p.Revenue, new CsvPercent(p.Share));
                csv.Row("Tổng cộng", m.Payments.Sum(p => p.Orders), m.Payments.Sum(p => p.Revenue), new CsvPercent(m.Payments.Sum(p => p.Revenue) > 0 ? 1 : null));
                var cancel = m.Cancellation!;
                csv.Blank().Row("Huỷ đơn online").Row("Chỉ số", "Giá trị")
                    .Row("Đơn online đã đặt", cancel.Placed).Row("Đơn bị huỷ", cancel.Cancelled)
                    .Row("Tỷ lệ huỷ", new CsvPercent(cancel.Placed > 0 ? cancel.Rate : null)).Row("Giá trị đơn bị huỷ (₫)", cancel.CancelledValue);
                break;
            case "giao-hang":
                csv.Blank().Row("Giao hàng theo cửa hàng").Row("Cửa hàng", "Đơn giao", "Quãng TB", "Đơn miễn phí giao", "Phí giao thu được (₫)", "Doanh thu đơn giao (₫)");
                foreach (var d in m.Delivery) csv.Row($"{d.Store.Code} – {d.Store.Name}", d.Orders, d.AvgKm, d.FreeTrips, d.Collected, d.Revenue);
                var trips = m.Delivery.Sum(d => d.Orders);
                csv.Row("Tổng cộng", trips, trips > 0 ? m.Delivery.Sum(d => d.Km) / trips : 0, m.Delivery.Sum(d => d.FreeTrips), m.Delivery.Sum(d => d.Collected), m.Delivery.Sum(d => d.Revenue));
                break;
        }
    }

    private async Task<ReportModel> BuildAsync(string? tab, string? period, SalesChannel? channel, DateTime? from, DateTime? to)
    {
        var now = DateTime.Now;
        var scope = ScopeStoreId;
        var key = Presets.Any(p => p.Key == period) ? period! : "7-ngay";
        tab = Tabs.Any(t => t.Key == tab && (!t.ChainOnly || scope is null)) ? tab! : "doanh-thu";
        Period range;
        if (key == "tuy-chon" && from is DateTime f)
        {
            var last = (to ?? f).Date;
            var first = f.Date;
            if (last < first) (first, last) = (last, first);
            if (last > now.Date) last = now.Date;
            if (first > last) first = last;
            range = Periods.OfDays(first, last, "Tuỳ chọn");
        }
        else
        {
            if (key == "tuy-chon") key = "7-ngay";
            range = key switch
            {
                "30-ngay" => Periods.OfDays(now.Date.AddDays(-29), now.Date, "30 ngày gần nhất"),
                "thang-nay" => Periods.Preset("thang-nay", now),
                "thang-truoc" => Periods.Preset("thang-truoc", now),
                _ => Periods.OfDays(now.Date.AddDays(-6), now.Date, "7 ngày gần nhất"),
            };
        }
        var previous = Periods.Previous(range, now);

        var products = await Db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id);
        var stores = await Db.Stores.AsNoTracking().OrderBy(s => s.Code).ToListAsync();
        var data = await SalesData.LoadAsync(Db, range.From, range.To, scope, channel, products);

        // Kỳ trước chỉ có nghĩa khi dữ liệu đã có từ đầu kỳ đó; thiếu thì không so, tránh tăng ảo.
        var firstOrder = await Db.Orders.MinAsync(o => (DateTime?)o.CreatedAt);
        SalesSummary? before = null;
        if (firstOrder is DateTime firstAt && firstAt <= previous.From)
            before = (await SalesData.LoadAsync(Db, previous.From, previous.To, scope, channel, products)).Summary();

        var model = new ReportModel
        {
            Tab = tab, PeriodKey = key, Range = range, Previous = previous, Channel = channel, Now = now, IsChain = scope is null,
            Summary = data.Summary(), PreviousSummary = before, FirstOrderAt = firstOrder,
        };
        switch (tab)
        {
            case "doanh-thu":
                model.Daily = data.Daily(range.From, range.To);
                break;
            case "lai-lo":
                model.Pnl = BudgetService.Statement(model.Summary.Revenue, model.Summary.GrossProfit, range.Days, stores.Count, scope is not null);
                break;
            case "hang-hoa":
                model.Categories = data.ByCategory(await Db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ToListAsync());
                model.Products = data.TopProducts(20);
                break;
            case "cua-hang":
                var costs = BudgetService.PerStoreCosts(range.Days, stores.Count).Total;
                model.Stores = data.ByStore(stores).Select(r => new StoreProfit(r, r.GrossProfit - costs)).ToList();
                model.StoreCosts = costs;
                break;
            case "nhan-vien":
                var staff = await Db.Employees.AsNoTracking().Include(e => e.Store)
                    .Where(e => e.Role == StaffRole.Cashier && (scope == null || e.StoreId == scope))
                    .OrderBy(e => e.Code).ToListAsync();
                model.Employees = data.ByEmployee(staff);
                break;
            case "thanh-toan":
                model.Payments = data.ByPayment();
                model.Cancellation = data.OnlineCancellation();
                break;
            case "giao-hang":
                model.Delivery = data.Delivery(stores);
                break;
        }
        return model;
    }
}

public class ReportModel
{
    public string Tab { get; init; } = "";
    public string PeriodKey { get; init; } = "";
    public Period Range { get; init; } = null!;
    public Period Previous { get; init; } = null!;
    public SalesChannel? Channel { get; init; }
    public DateTime Now { get; init; }
    public bool IsChain { get; init; }
    public SalesSummary Summary { get; init; } = null!;
    public SalesSummary? PreviousSummary { get; init; }
    public DateTime? FirstOrderAt { get; init; }
    public List<DailySales> Daily { get; set; } = [];
    public ProfitAndLoss? Pnl { get; set; }
    public List<CategorySales> Categories { get; set; } = [];
    public List<ProductSales> Products { get; set; } = [];
    public List<StoreProfit> Stores { get; set; } = [];
    public long StoreCosts { get; set; }
    public List<EmployeeSales> Employees { get; set; } = [];
    public List<PaymentSales> Payments { get; set; } = [];
    public CancellationStats? Cancellation { get; set; }
    public List<DeliverySales> Delivery { get; set; } = [];
}
