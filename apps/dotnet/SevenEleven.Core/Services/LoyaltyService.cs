using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public record RedeemResult(bool Ok, Promotion? Voucher, string? Error)
{
    public static RedeemResult Fail(string error) => new(false, null, error);
}

/// <summary>Đổi sao vàng lấy voucher, chuyển từ action redeemStars của stores/db.ts.</summary>
public class LoyaltyService(AppDbContext db)
{
    /// <summary>
    /// Trừ sao và tạo một voucher riêng: giảm thẳng một số tiền, dùng một lần, chỉ chủ tài khoản dùng
    /// được, hạn 30 ngày, áp cho cả đơn online lẫn mua tại quầy.
    /// </summary>
    public async Task<RedeemResult> RedeemAsync(string customerId, string rewardId)
    {
        // Đọc số sao trong cùng giao dịch với lúc trừ: mở nhiều thẻ trình duyệt bấm đổi cùng lúc không làm sao bị âm.
        await using var tx = await db.Database.BeginTransactionAsync();
        var customer = await db.Customers.FindAsync(customerId);
        var reward = StarService.Rewards.FirstOrDefault(r => r.Id == rewardId);
        if (customer is null || reward is null) return RedeemResult.Fail("Không tìm thấy phần quà này");
        if (customer.Stars < reward.Stars)
            return RedeemResult.Fail($"Bạn cần thêm {reward.Stars - customer.Stars} sao để đổi voucher này");

        var now = DateTime.Now;
        var code = await NewCodeAsync();
        var voucher = new Promotion
        {
            Id = $"pr-{Guid.NewGuid():N}"[..11],
            Code = code,
            OwnerId = customer.Id,
            Name = $"Voucher đổi sao {Money.Format(reward.Value)}",
            Description = $"Đổi từ {reward.Stars} sao vàng",
            Type = PromotionType.Fixed,
            Value = reward.Value,
            MinOrderValue = reward.MinOrderValue,
            Channels = "online,in-store",
            StartsAt = now,
            EndsAt = now.Date.AddDays(StarService.RewardVoucherDays).AddHours(23).AddMinutes(59).AddSeconds(59),
            Status = PromotionStatus.Active,
            UsageLimit = 1,
        };

        customer.Stars -= reward.Stars;
        db.Promotions.Add(voucher);
        db.StarEntries.Add(new StarEntry
        {
            CustomerId = customer.Id, At = now, Delta = -reward.Stars, Kind = StarEntryKind.Redeem,
            Note = $"Đổi voucher {Money.Format(reward.Value)}", Ref = code,
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new RedeemResult(true, voucher, null);
    }

    /// <summary>Voucher riêng của khách, mới nhất trước.</summary>
    public Task<List<Promotion>> VouchersOfAsync(string customerId) =>
        db.Promotions.Where(p => p.OwnerId == customerId).OrderByDescending(p => p.StartsAt).ToListAsync();

    /// <summary>Mã dạng SAO + 5 ký tự, không trùng mã nào đang có.</summary>
    private async Task<string> NewCodeAsync()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        while (true)
        {
            var code = "SAO" + string.Concat(Enumerable.Range(0, 5).Select(_ => alphabet[Random.Shared.Next(alphabet.Length)]));
            if (!await db.Promotions.AnyAsync(p => p.Code == code)) return code;
        }
    }
}
