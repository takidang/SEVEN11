namespace SevenEleven.Core.Services;

/// <summary>Một khoản trong ngân sách tháng.</summary>
public record BudgetLine(string Id, string Label, long Monthly, bool FromPurchaseOrders, string Note);

public record BudgetRow(string Id, string Label, string Note, long Budget, long Spent)
{
    /// <summary>0–1, có thể vượt 1 khi chi quá ngân sách.</summary>
    public double Used => Budget > 0 ? (double)Spent / Budget : 0;
}

/// <summary>Vốn điều lệ đang nằm ở đâu: tài sản cố định, hàng trong kho, còn lại là tiền mặt.</summary>
public record CapitalBreakdown(long Capital, long FixedAssets, long Inventory, long Cash);

public record OperatingCosts(long Payroll, long Rent, long Utilities, long Marketing)
{
    public long Total => Payroll + Rent + Utilities + Marketing;
}

/// <summary>Một dòng của báo cáo kết quả kinh doanh; chi phí mang số âm.</summary>
public record ProfitLine(string Id, string Label, long Amount, bool IsTotal = false, string? Note = null);

public record ProfitAndLoss(List<ProfitLine> Lines, long NetProfit, double GrossMargin, double NetMargin);

/// <summary>
/// Số liệu công ty và ngân sách, chuyển từ data/company.ts và lib/budget.ts. Đây là giả định của
/// nhóm cho một chuỗi 10 cửa hàng, ước theo mặt bằng bán lẻ Việt Nam — không phải số thật của 7-Eleven.
/// </summary>
public static class BudgetService
{
    public const string CompanyName = "Công ty Cổ phần 7-Eleven Việt Nam";
    /// <summary>Vốn điều lệ: không nằm yên trong két mà đã thành tài sản cố định, hàng trên kệ và tiền mặt.</summary>
    public const long CharterCapital = 50_000_000_000;
    /// <summary>Đặt cọc mặt bằng, sửa chữa, tủ mát, kệ, máy POS của 10 cửa hàng — khoảng 3 tỷ mỗi cửa hàng.</summary>
    public const long FixedAssets = 30_000_000_000;

    /// <summary>Mỗi cửa hàng mỗi tháng: 1 quản lý 15 triệu + 3 thu ngân 7,5 triệu.</summary>
    public const long StorePayroll = 37_500_000;
    public const long StoreRent = 20_000_000;
    /// <summary>Tủ mát, tủ đông và điều hoà chạy 24/7.</summary>
    public const long StoreUtilities = 12_000_000;
    /// <summary>Lương khối văn phòng: giám đốc chuỗi, kế toán, thu mua.</summary>
    public const long HeadOfficePayroll = 60_000_000;

    public static readonly BudgetLine[] Lines =
    [
        new("purchasing", "Nhập hàng", 2_900_000_000, true, "Tiền trả nhà cung cấp, lấy từ các phiếu nhập trong tháng"),
        new("payroll", "Lương nhân viên", 480_000_000, false, "41 nhân viên cửa hàng và khối văn phòng"),
        new("rent", "Thuê mặt bằng", 220_000_000, false, "10 cửa hàng"),
        new("utilities", "Điện nước", 130_000_000, false, "Tủ mát và điều hoà 24/7"),
        new("marketing", "Marketing & khuyến mãi", 60_000_000, false, "Quảng cáo, thẻ thành viên, voucher"),
    ];

    /// <summary>Phần tháng đã trôi qua, để chi phí cố định cộng dồn theo ngày.</summary>
    public static double MonthProgress(DateTime now)
    {
        var days = DateTime.DaysInMonth(now.Year, now.Month);
        return Math.Min(1, (now.Day - 1 + now.Hour / 24.0) / days);
    }

    /// <summary>
    /// Ngân sách tháng và số đã chi. Nhập hàng lấy từ phiếu nhập thật; chi phí cố định cộng dồn theo
    /// ngày từ định mức, vì dự án chưa có phân hệ chi phí. Một cửa hàng nhận phần chia đều của chuỗi.
    /// </summary>
    public static List<BudgetRow> Build(long purchasingSpent, int storeCount, bool singleStore, DateTime now)
    {
        var share = singleStore ? 1.0 / Math.Max(1, storeCount) : 1;
        var progress = MonthProgress(now);
        var stores = singleStore ? 1 : storeCount;
        return Lines.Select(line =>
        {
            var budget = (long)Math.Round(line.Monthly * share, MidpointRounding.AwayFromZero);
            var spent = line.Id switch
            {
                "purchasing" => purchasingSpent,
                "payroll" => (long)Math.Round((StorePayroll * stores + (singleStore ? 0 : HeadOfficePayroll)) * progress, MidpointRounding.AwayFromZero),
                "rent" => (long)Math.Round(StoreRent * stores * progress, MidpointRounding.AwayFromZero),
                "utilities" => (long)Math.Round(StoreUtilities * stores * progress, MidpointRounding.AwayFromZero),
                _ => (long)Math.Round(budget * progress, MidpointRounding.AwayFromZero),
            };
            return new BudgetRow(line.Id, line.Label, line.Note, budget, spent);
        }).ToList();
    }

    public static CapitalBreakdown Capital(long inventoryCost) =>
        new(CharterCapital, FixedAssets, inventoryCost, CharterCapital - FixedAssets - inventoryCost);

    /// <summary>
    /// Chi phí vận hành cho một khoảng ngày, chia theo định mức tháng. Chọn một cửa hàng thì gồm
    /// lương, mặt bằng, điện nước của riêng nó cộng phần chia văn phòng và marketing.
    /// </summary>
    public static OperatingCosts Costs(int days, int storeCount, bool singleStore) =>
        CostsFor(days, singleStore ? 1 : storeCount, singleStore ? 1.0 / Math.Max(1, storeCount) : 1);

    /// <summary>Chi phí vận hành của riêng một cửa hàng.</summary>
    public static OperatingCosts PerStoreCosts(int days, int storeCount) => CostsFor(days, 1, 1.0 / Math.Max(1, storeCount));

    private static OperatingCosts CostsFor(int days, int stores, double share)
    {
        var months = days / 30.0;
        var marketing = Lines.First(l => l.Id == "marketing").Monthly;
        return new OperatingCosts(
            (long)Math.Round((StorePayroll * stores + HeadOfficePayroll * share) * months, MidpointRounding.AwayFromZero),
            (long)Math.Round(StoreRent * stores * months, MidpointRounding.AwayFromZero),
            (long)Math.Round(StoreUtilities * stores * months, MidpointRounding.AwayFromZero),
            (long)Math.Round(marketing * share * months, MidpointRounding.AwayFromZero));
    }

    /// <summary>Kết quả kinh doanh: doanh thu và giá vốn lấy từ đơn thật, chi phí vận hành từ định mức.</summary>
    public static ProfitAndLoss Statement(long revenue, long grossProfit, int days, int storeCount, bool singleStore)
    {
        var costs = Costs(days, storeCount, singleStore);
        var net = grossProfit - costs.Total;
        List<ProfitLine> lines =
        [
            new("revenue", "Doanh thu", revenue),
            new("cogs", "Giá vốn hàng bán", -(revenue - grossProfit)),
            new("gross", "Lãi gộp", grossProfit, true),
            new("payroll", "Lương nhân viên", -costs.Payroll, Note: "Gồm cả nhân viên giao hàng"),
            new("rent", "Thuê mặt bằng", -costs.Rent),
            new("utilities", "Điện nước", -costs.Utilities),
            new("marketing", "Marketing & khuyến mãi", -costs.Marketing),
            new("net", "Lãi thuần", net, true),
        ];
        return new ProfitAndLoss(lines, net, revenue > 0 ? (double)grossProfit / revenue : 0, revenue > 0 ? (double)net / revenue : 0);
    }
}
