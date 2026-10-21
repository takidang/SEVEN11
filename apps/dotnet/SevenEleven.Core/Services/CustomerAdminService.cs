using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public record CustomerRow(Customer Customer, KeepStatus Keep);

public record CustomerStats(int Total, int JoinedLast30Days, Dictionary<MemberTier, int> ByTier, int AtRisk, long Stars, int CanRedeem);

public record CustomerDetail(
    Customer Customer, KeepStatus Keep, TierProgress Progress, List<StarEntry> Stars, int StarCount, List<Promotion> Vouchers,
    List<TierChange> TierHistory, List<Order> RecentOrders, int OrderTotal, (string Name, int Quantity)? Favourite, DateTime? LastOrderAt);

public enum CustomerSort { TierSpend, MonthSpend, Stars, TotalSpent, Orders, Joined, Name }

/// <summary>Danh sách và hồ sơ thành viên cho khu quản lý, chuyển từ khach-hang của bản Next.js.</summary>
public class CustomerAdminService(AppDbContext db)
{
    public static readonly (CustomerSort Sort, string Label)[] Sorts =
    [
        (CustomerSort.TierSpend, "Chi tiêu tích luỹ"), (CustomerSort.MonthSpend, "Chi tiêu tháng này"), (CustomerSort.Stars, "Sao vàng"),
        (CustomerSort.TotalSpent, "Tổng chi tiêu"), (CustomerSort.Orders, "Số đơn"), (CustomerSort.Joined, "Mới tham gia"), (CustomerSort.Name, "Tên A–Z"),
    ];

    /// <summary>Chi tiêu xét hạng của từng thành viên trong tháng (cả chuỗi, không tính đơn huỷ).</summary>
    public async Task<Dictionary<string, int>> MonthSpendAsync(DateTime now, IEnumerable<string>? customerIds = null)
    {
        var start = new DateTime(now.Year, now.Month, 1);
        var orders = db.Orders.Where(o => o.CustomerId != null && o.MemberSpend != null && o.Status != OrderStatus.Cancelled && o.CreatedAt >= start);
        if (customerIds is not null)
        {
            var ids = customerIds.ToList();
            orders = orders.Where(o => ids.Contains(o.CustomerId!));
        }
        return await orders.GroupBy(o => o.CustomerId!).Select(g => new { g.Key, Spend = g.Sum(o => o.MemberSpend!.Value) }).ToDictionaryAsync(x => x.Key, x => x.Spend);
    }

    /// <summary>Thành viên trong phạm vi: khi chọn một cửa hàng và bật "khách của cửa hàng" thì chỉ người đã từng mua ở đó.</summary>
    public async Task<List<CustomerRow>> ScopedAsync(string? storeId, bool storeOnly, DateTime now)
    {
        var customers = db.Customers.AsNoTracking();
        if (storeId is not null && storeOnly)
        {
            var buyers = db.Orders.Where(o => o.StoreId == storeId && o.CustomerId != null).Select(o => o.CustomerId!).Distinct();
            customers = customers.Where(c => buyers.Contains(c.Id));
        }
        var list = await customers.ToListAsync();
        var spend = await MonthSpendAsync(now);
        return list.Select(c => new CustomerRow(c, MembershipService.Keep(c, spend.GetValueOrDefault(c.Id), now))).ToList();
    }

    public static CustomerStats Stats(List<CustomerRow> rows, DateTime now)
    {
        var minStars = StarService.Rewards.Min(r => r.Stars);
        return new CustomerStats(
            rows.Count,
            rows.Count(r => r.Customer.JoinedAt >= now.AddDays(-30)),
            MembershipService.Order.ToDictionary(t => t, t => rows.Count(r => r.Customer.Tier == t)),
            rows.Count(r => r.Keep.AtRisk),
            rows.Sum(r => (long)r.Customer.Stars),
            rows.Count(r => r.Customer.Stars >= minStars));
    }

    /// <summary>Tìm: có từ 3 chữ số thì so với số điện thoại; còn lại mọi từ phải có trong tên hoặc email.</summary>
    public static IEnumerable<CustomerRow> Filter(IEnumerable<CustomerRow> rows, string? query, MemberTier? tier, bool atRiskOnly)
    {
        var digits = Text.Digits(query);
        return rows.Where(r =>
        {
            if (tier is MemberTier t && r.Customer.Tier != t) return false;
            if (atRiskOnly && !r.Keep.AtRisk) return false;
            if (Text.IsBlank(query)) return true;
            if (digits.Length >= 3 && r.Customer.Phone.Contains(digits)) return true;
            return Text.MatchesAllWords($"{r.Customer.FullName} {r.Customer.Email}", query);
        });
    }

    public static IEnumerable<CustomerRow> Sort(IEnumerable<CustomerRow> rows, CustomerSort sort) => sort switch
    {
        CustomerSort.MonthSpend => rows.OrderByDescending(r => r.Keep.Spent),
        CustomerSort.Stars => rows.OrderByDescending(r => r.Customer.Stars),
        CustomerSort.TotalSpent => rows.OrderByDescending(r => r.Customer.TotalSpent),
        CustomerSort.Orders => rows.OrderByDescending(r => r.Customer.OrderCount),
        CustomerSort.Joined => rows.OrderByDescending(r => r.Customer.JoinedAt),
        CustomerSort.Name => rows.OrderBy(r => Text.Fold(r.Customer.FullName), StringComparer.Ordinal),
        _ => rows.OrderByDescending(r => r.Customer.TierSpend),
    };

    public async Task<CustomerDetail?> DetailAsync(string id, DateTime now)
    {
        var customer = await db.Customers.AsNoTracking().Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null) return null;
        var spend = (await MonthSpendAsync(now, [id])).GetValueOrDefault(id);
        var stars = await db.StarEntries.AsNoTracking().Where(e => e.CustomerId == id).OrderByDescending(e => e.At).ThenByDescending(e => e.Id).ToListAsync();
        var vouchers = await db.Promotions.AsNoTracking().Where(p => p.OwnerId == id).OrderByDescending(p => p.StartsAt).ToListAsync();
        var history = await db.TierChanges.AsNoTracking().Where(t => t.CustomerId == id).OrderByDescending(t => t.At).ThenByDescending(t => t.Id).ToListAsync();
        var orders = db.Orders.AsNoTracking().Where(o => o.CustomerId == id);
        var recent = await orders.Include(o => o.Store).OrderByDescending(o => o.CreatedAt).Take(8).ToListAsync();
        var favourite = await db.OrderItems.Where(i => i.Order!.CustomerId == id && i.Order.Status != OrderStatus.Cancelled)
            .GroupBy(i => i.Product!.Category!.Name)
            .Select(g => new { Name = g.Key, Quantity = g.Sum(i => i.Quantity) })
            .OrderByDescending(x => x.Quantity)
            .FirstOrDefaultAsync();
        return new CustomerDetail(customer, MembershipService.Keep(customer, spend, now), MembershipService.Progress(customer), stars.Take(6).ToList(),
            stars.Count, vouchers, history, recent, await orders.CountAsync(), favourite is null ? null : (favourite.Name, favourite.Quantity),
            recent.FirstOrDefault()?.CreatedAt);
    }

    /// <summary>Sửa họ tên, email, ngày sinh. Số điện thoại là tài khoản đăng nhập nên không sửa được.</summary>
    public async Task<FormErrors> UpdateProfileAsync(string id, string? fullName, string? email, DateTime? birthday, DateTime now, bool storefront)
    {
        var errors = new FormErrors();
        var name = fullName?.Trim() ?? "";
        if (name.Length < 2) errors.Set("FullName", storefront ? "Nhập họ và tên" : "Nhập họ tên (tối thiểu 2 ký tự)");
        else if (name.Length > 60) errors.Set("FullName", "Họ tên tối đa 60 ký tự");
        var mail = email?.Trim() ?? "";
        if (mail.Length > 120) errors.Set("Email", "Email tối đa 120 ký tự");
        else if (mail.Length > 0 && !Text.IsEmail(mail)) errors.Set("Email", storefront ? "Email chưa đúng định dạng" : "Email không hợp lệ");
        var earliest = storefront ? new DateTime(1900, 1, 1) : new DateTime(1920, 1, 1);
        if (birthday is DateTime b && (b.Date < earliest || b.Date > now.Date)) errors.Set("Birthday", "Ngày sinh không hợp lệ");
        if (errors.Count > 0) return errors;

        var customer = await db.Customers.FindAsync(id);
        if (customer is null)
        {
            errors.Set("FullName", "Không tìm thấy khách hàng");
            return errors;
        }
        customer.FullName = name;
        customer.Email = mail.Length == 0 ? null : mail;
        customer.Birthday = birthday?.Date;
        await db.SaveChangesAsync();
        return errors;
    }
}
