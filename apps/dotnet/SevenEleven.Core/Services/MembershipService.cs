using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>Quyền lợi và ngưỡng của một hạng.</summary>
public record TierInfo(
    MemberTier Id,
    string Label,
    /// <summary>Chi tiêu tích luỹ để đạt hạng này.</summary>
    int MinSpend,
    /// <summary>Chi tối thiểu mỗi tháng để giữ hạng (0 là không cần giữ).</summary>
    int KeepPerMonth,
    /// <summary>Giảm cho mỗi ly đồ uống.</summary>
    int DrinkVoucher,
    int VouchersPerMonth,
    double BirthdayDrinkDiscount,
    string FreeDrink);

/// <summary>
/// Luật hạng thành viên, chuyển 1-1 từ lib/membership.ts:
/// Đồng → Bạc (1 triệu) → Vàng (3 triệu) → Kim cương (5 triệu), đạt mốc là lên hạng ngay.
/// Ngày 1 hằng tháng xét chi tiêu tháng trước; thiếu mức giữ hạng thì tụt một hạng và chi tiêu
/// tích luỹ kéo về đúng mốc hạng mới. Tháng vừa lên hạng được miễn xét.
/// </summary>
public static class MembershipService
{
    public static readonly IReadOnlyDictionary<MemberTier, TierInfo> Tiers = new Dictionary<MemberTier, TierInfo>
    {
        [MemberTier.Bronze] = new(MemberTier.Bronze, "Đồng", 0, 0, 2_000, 5, 0.2, "Gói quà khách mới: tới 3 ly nước miễn phí"),
        [MemberTier.Silver] = new(MemberTier.Silver, "Bạc", 1_000_000, 200_000, 3_000, 10, 0.3, "1 ly nước miễn phí mỗi tháng (hoá đơn từ 58.000 ₫)"),
        [MemberTier.Gold] = new(MemberTier.Gold, "Vàng", 3_000_000, 350_000, 6_000, 20, 0.4, "2 ly nước miễn phí mỗi tháng (hoá đơn từ 58.000 ₫)"),
        [MemberTier.Diamond] = new(MemberTier.Diamond, "Kim cương", 5_000_000, 500_000, 9_000, 30, 0.5, "1 ly nước miễn phí mỗi tuần (hoá đơn từ 58.000 ₫)"),
    };

    public static readonly MemberTier[] Order = [MemberTier.Bronze, MemberTier.Silver, MemberTier.Gold, MemberTier.Diamond];

    /// <summary>Ngành hàng tính là "đồ uống" cho voucher thành viên.</summary>
    public static readonly string[] DrinkCategoryIds = ["tra-sua"];

    /// <summary>Ngành hàng không tính vào chi tiêu hạng (đồ uống có cồn).</summary>
    public static readonly string[] NonEligibleCategoryIds = ["do-uong-co-con"];

    public const int MaxDrinkVouchersPerOrder = 3;

    public static TierInfo Info(MemberTier tier) => Tiers[tier];

    /// <summary>Hạng cao nhất mà chi tiêu tích luỹ đã chạm tới.</summary>
    public static MemberTier TierForSpend(int spend) =>
        Order.Reverse().FirstOrDefault(t => spend >= Tiers[t].MinSpend, MemberTier.Bronze);

    public static TierInfo? Next(MemberTier tier)
    {
        var i = Array.IndexOf(Order, tier);
        return i < Order.Length - 1 ? Tiers[Order[i + 1]] : null;
    }

    public static MemberTier? Previous(MemberTier tier)
    {
        var i = Array.IndexOf(Order, tier);
        return i > 0 ? Order[i - 1] : null;
    }

    /// <summary>"2026-09"</summary>
    public static string MonthKey(DateTime date) => date.ToString("yyyy-MM");

    /// <summary>
    /// Cộng chi tiêu của một đơn vào hạng. Đạt mốc là lên ngay, và tháng đó được miễn xét giữ hạng.
    /// </summary>
    public static void AddTierSpend(Customer customer, int amount, DateTime at)
    {
        if (amount <= 0) return;
        customer.TierSpend += amount;
        var reached = TierForSpend(customer.TierSpend);
        if (Array.IndexOf(Order, reached) <= Array.IndexOf(Order, customer.Tier)) return;
        customer.TierChanges.Add(new TierChange
        {
            CustomerId = customer.Id, At = at, From = customer.Tier, To = reached,
            Reason = $"Chi tiêu tích luỹ đạt {Money.Format(Tiers[reached].MinSpend)}",
        });
        customer.Tier = reached;
        customer.TierSince = at;
        customer.GraceMonth = MonthKey(at);
    }

    /// <summary>
    /// Huỷ đơn: trừ lại chi tiêu của đơn, giống removeTierSpend trong lib/membership.ts. Đơn đặt trước lần
    /// tụt hạng gần nhất thì thôi (lần tụt hạng đã kéo chi tiêu về mốc rồi). Còn trên mốc hạng hiện tại thì
    /// giữ hạng; xuống dưới mốc thì hạng đi theo chi tiêu.
    /// </summary>
    public static void RemoveTierSpend(Customer customer, int amount, DateTime orderAt, DateTime? lastDropAt, DateTime at)
    {
        if (lastDropAt is DateTime drop && orderAt < drop) return;
        customer.TierSpend = Math.Max(0, customer.TierSpend - Math.Max(0, amount));
        if (customer.TierSpend >= Tiers[customer.Tier].MinSpend) return;
        var to = TierForSpend(customer.TierSpend);
        customer.TierChanges.Add(new TierChange
        {
            CustomerId = customer.Id, At = at, From = customer.Tier, To = to,
            Reason = "Đơn hàng bị huỷ, chi tiêu tích luỹ không còn đủ mốc",
        });
        customer.Tier = to;
        customer.TierSince = at;
        customer.GraceMonth = null;
    }

    // ---------------------------------------------------------------- giữ hạng theo tháng

    public static DateTime MonthStart(string key) => DateTime.ParseExact(key + "-01", "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>Tháng sau n tháng (n âm là lùi lại).</summary>
    public static string ShiftMonth(string key, int n) => MonthKey(MonthStart(key).AddMonths(n));

    /// <summary>"09/2026"</summary>
    public static string MonthLabel(string key) => $"{key[5..]}/{key[..4]}";

    /// <summary>
    /// Xét giữ hạng cho một tháng đã kết thúc (chạy ngày 1 tháng sau). Chi chưa đủ mức tối thiểu của hạng
    /// thì tụt một hạng và chi tiêu tích luỹ kéo về đúng mốc hạng mới, để lên lại phải chi thêm từ đầu.
    /// Tháng vừa lên hạng, hoặc tháng trước khi có hạng này, thì không xét. Trả về true khi tụt hạng.
    /// </summary>
    public static bool CheckKeepTier(Customer c, string month, int spend, DateTime at)
    {
        var keep = Tiers[c.Tier].KeepPerMonth;
        var to = Previous(c.Tier);
        if (keep == 0 || to is not MemberTier lower || spend >= keep) return false;
        if (c.GraceMonth == month || string.CompareOrdinal(MonthKey(c.TierSince), month) > 0) return false;
        c.TierChanges.Add(new TierChange
        {
            CustomerId = c.Id, At = at, From = c.Tier, To = lower,
            Reason = $"Tháng {MonthLabel(month)} chi {Money.Format(spend)}, chưa đủ {Money.Format(keep)} để giữ hạng {Tiers[c.Tier].Label}",
        });
        c.Tier = lower;
        c.TierSpend = Tiers[lower].MinSpend;
        c.TierSince = at;
        c.GraceMonth = null;
        return true;
    }

    /// <summary>Tiến độ lên hạng kế tiếp: tỉ lệ 0–1 và số tiền còn thiếu (hạng cao nhất thì 1 và 0).</summary>
    public static TierProgress Progress(Customer c)
    {
        var tier = Tiers[c.Tier];
        var next = Next(c.Tier);
        if (next is null) return new TierProgress(null, 1, 0);
        var ratio = Math.Clamp((c.TierSpend - tier.MinSpend) / (double)(next.MinSpend - tier.MinSpend), 0, 1);
        return new TierProgress(next, ratio, Math.Max(0, next.MinSpend - c.TierSpend));
    }

    /// <summary>Ngày xét giữ hạng của tháng (ngày 1 tháng sau).</summary>
    public static DateTime ReviewDay(string month) => MonthStart(ShiftMonth(month, 1));

    /// <summary>Thành viên đang đứng đâu so với mức giữ hạng của tháng này.</summary>
    public static KeepStatus Keep(Customer c, int spentThisMonth, DateTime now)
    {
        var month = MonthKey(now);
        var required = Tiers[c.Tier].KeepPerMonth;
        var daysLeft = DateTime.DaysInMonth(now.Year, now.Month) - now.Day + 1;
        KeepExemption? exempt = required == 0 ? KeepExemption.BaseTier : c.GraceMonth == month ? KeepExemption.UpgradeMonth : null;
        return new KeepStatus(month, required, spentThisMonth, daysLeft, exempt, exempt is null ? Previous(c.Tier) : null);
    }
}

public record TierProgress(TierInfo? Next, double Ratio, int Missing)
{
    public int Percent => (int)Math.Round(Ratio * 100, MidpointRounding.AwayFromZero);
}

public enum KeepExemption
{
    /// <summary>Hạng Đồng: không cần giữ.</summary>
    BaseTier,
    /// <summary>Vừa lên hạng trong tháng này nên chưa xét.</summary>
    UpgradeMonth,
}

/// <summary>Tình hình giữ hạng trong tháng: phải chi bao nhiêu, đã chi bao nhiêu, còn mấy ngày.</summary>
public record KeepStatus(string Month, int Required, int Spent, int DaysLeft, KeepExemption? Exempt, MemberTier? DropTo)
{
    public int Missing => Math.Max(0, Required - Spent);
    /// <summary>Cuối tháng mà vẫn thiếu thì tụt hạng.</summary>
    public bool AtRisk => Exempt is null && Missing > 0;
}
