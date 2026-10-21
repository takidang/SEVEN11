using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

/// <summary>
/// Việc định kỳ của chương trình thành viên, chuyển từ reviewMemberships trong stores/db.ts: xét giữ
/// hạng cho mọi tháng đã kết thúc mà chưa xét, và cho hết hạn sao nhận quá 12 tháng. Chạy bao nhiêu lần
/// cũng được — tháng nào xét rồi thì bỏ qua.
/// </summary>
public class MembershipReviewService(AppDbContext db)
{
    /// <summary>Trả về số thành viên bị đổi (tụt hạng hoặc mất sao hết hạn).</summary>
    public async Task<int> RunAsync(DateTime now)
    {
        var current = MembershipService.MonthKey(now);
        var previous = MembershipService.ShiftMonth(current, -1);
        // Khoá ghi trong lúc xét: đơn đặt cùng lúc phải chờ, không bị bản đọc cũ của việc xét ghi đè sao / chi tiêu.
        await using var tx = await db.Database.BeginTransactionAsync();
        var customers = await db.Customers.ToListAsync();
        var changed = new HashSet<string>();

        // 1. Giữ hạng: mỗi tháng đã kết thúc mà chưa xét.
        var due = customers.Where(c => string.IsNullOrEmpty(c.ReviewedMonth) || string.CompareOrdinal(c.ReviewedMonth, previous) < 0).ToList();
        if (due.Count > 0)
        {
            foreach (var c in due.Where(c => string.IsNullOrEmpty(c.ReviewedMonth))) c.ReviewedMonth = previous;
            var first = due.Min(c => c.ReviewedMonth)!;
            var from = MembershipService.MonthStart(MembershipService.ShiftMonth(first, 1));
            var to = MembershipService.MonthStart(current);
            var ids = due.Select(c => c.Id).ToList();
            var spend = (await db.Orders
                    .Where(o => o.CustomerId != null && ids.Contains(o.CustomerId) && o.MemberSpend != null
                                && o.Status != OrderStatus.Cancelled && o.CreatedAt >= from && o.CreatedAt < to)
                    .Select(o => new { o.CustomerId, o.CreatedAt, o.MemberSpend })
                    .ToListAsync())
                .GroupBy(o => (o.CustomerId!, MembershipService.MonthKey(o.CreatedAt)))
                .ToDictionary(g => g.Key, g => g.Sum(o => o.MemberSpend ?? 0));

            foreach (var c in due)
            {
                for (var month = MembershipService.ShiftMonth(c.ReviewedMonth, 1); string.CompareOrdinal(month, current) < 0; month = MembershipService.ShiftMonth(month, 1))
                {
                    var at = MembershipService.MonthStart(MembershipService.ShiftMonth(month, 1));
                    if (MembershipService.CheckKeepTier(c, month, spend.GetValueOrDefault((c.Id, month)), at)) changed.Add(c.Id);
                    c.ReviewedMonth = month;
                }
            }
        }

        // 2. Sao hết hạn: chỉ những ai còn sao nhận từ hơn 12 tháng trước.
        var cutoff = now.AddMonths(-StarService.StarValidMonths);
        var withOldStars = await db.StarEntries.Where(e => e.At < cutoff).Select(e => e.CustomerId).Distinct().ToListAsync();
        if (withOldStars.Count > 0)
        {
            var entries = (await db.StarEntries.Where(e => withOldStars.Contains(e.CustomerId)).ToListAsync()).ToLookup(e => e.CustomerId);
            foreach (var c in customers.Where(c => withOldStars.Contains(c.Id)))
            {
                var expire = Math.Min(c.Stars, StarService.StarsToExpire(entries[c.Id], now));
                if (expire <= 0) continue;
                c.Stars -= expire;
                db.StarEntries.Add(new StarEntry
                {
                    CustomerId = c.Id, At = now, Delta = -expire, Kind = StarEntryKind.Expire,
                    Note = $"Sao nhận quá {StarService.StarValidMonths} tháng đã hết hạn",
                });
                changed.Add(c.Id);
            }
        }

        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return changed.Count;
    }
}
