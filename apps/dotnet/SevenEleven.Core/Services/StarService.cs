namespace SevenEleven.Core.Services;

/// <summary>Một phần quà đổi bằng sao vàng.</summary>
public record StarReward(string Id, int Stars, int Value, int MinOrderValue);

/// <summary>
/// Sao vàng, chuyển 1-1 từ lib/stars.ts: cứ 45.000 ₫ chi tiêu (sau giảm giá, không tính rượu bia)
/// được 1 sao, phần lẻ cộng dồn sang đơn sau. Sao có hạn 12 tháng; voucher đổi từ sao có hạn 30 ngày.
/// </summary>
public static class StarService
{
    public const int StarSpend = 45_000;
    public const int StarValidMonths = 12;
    public const int RewardVoucherDays = 30;

    public static readonly StarReward[] Rewards =
    [
        new("sao-10", 10, 10_000, 50_000),
        new("sao-20", 20, 22_000, 100_000),
        new("sao-50", 50, 60_000, 200_000),
        new("sao-100", 100, 130_000, 300_000),
    ];

    /// <summary>Số sao một đơn mang lại, và phần chi tiêu lẻ còn dư sang lần sau.</summary>
    public static (int Stars, int Carry) Earn(int carry, int spend)
    {
        var pool = carry + Math.Max(0, spend);
        return (pool / StarSpend, pool % StarSpend);
    }

    /// <summary>
    /// Trả lại phép cộng sao của một đơn bị huỷ. Sao đã đổi quà thì không lấy lại được nên số dư
    /// dừng ở 0; Taken là số sao thực sự bị trừ.
    /// </summary>
    public static (int Stars, int Carry, int Taken) TakeBack(int stars, int carry, int spend, int earned)
    {
        var nextStars = stars - earned;
        var nextCarry = carry - (spend - earned * StarSpend);
        while (nextCarry < 0)
        {
            nextCarry += StarSpend;
            nextStars -= 1;
        }
        while (nextCarry >= StarSpend)
        {
            nextCarry -= StarSpend;
            nextStars += 1;
        }
        var balance = Math.Max(0, nextStars);
        return (balance, nextCarry, stars - balance);
    }

    /// <summary>
    /// Số sao phải hết hạn lúc này: sao nhận quá 12 tháng mà chưa dùng (sao cũ dùng trước), giống
    /// starsToExpire trong lib/stars.ts.
    /// </summary>
    public static int StarsToExpire(IEnumerable<Models.StarEntry> entries, DateTime now)
    {
        var cutoff = now.AddMonths(-StarValidMonths);
        var oldEarned = 0;
        var used = 0;
        foreach (var e in entries)
        {
            if (e.Kind is Models.StarEntryKind.Earn or Models.StarEntryKind.Refund && e.At < cutoff) oldEarned += e.Delta;
            if (e.Kind is Models.StarEntryKind.Redeem or Models.StarEntryKind.Expire) used -= e.Delta;
        }
        return Math.Max(0, oldEarned - used);
    }

    /// <summary>Còn bao nhiêu tiền nữa thì được thêm 1 sao.</summary>
    public static int SpendToNextStar(int carry) => StarSpend - carry % StarSpend;
}
