using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public class PromotionInput
{
    public string? Id { get; set; }
    public PromotionType Type { get; set; } = PromotionType.Percent;
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Code { get; set; }
    public string? Value { get; set; }
    public string? MaxDiscount { get; set; }
    public string? MinOrderValue { get; set; }
    public string? BuyQuantity { get; set; } = "2";
    public string? GetQuantity { get; set; } = "1";
    public string? DailyStart { get; set; }
    public string? DailyEnd { get; set; }
    public List<string> ProductIds { get; set; } = [];
    public List<string> CategoryIds { get; set; } = [];
    public List<string> Tiers { get; set; } = [];
    public List<string> Channels { get; set; } = ["online", "in-store"];
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? UsageLimit { get; set; }

    public static PromotionInput From(Promotion p) => new()
    {
        Id = p.Id, Type = p.Type, Name = p.Name, Description = p.Description, Code = p.Code,
        Value = p.Value > 0 ? p.Value.ToString() : null, MaxDiscount = p.MaxDiscount?.ToString(), MinOrderValue = p.MinOrderValue?.ToString(),
        BuyQuantity = p.BuyQuantity?.ToString() ?? "2", GetQuantity = p.GetQuantity?.ToString() ?? "1", DailyStart = p.DailyStart, DailyEnd = p.DailyEnd,
        ProductIds = [.. PricingService.Split(p.ProductIds)], CategoryIds = [.. PricingService.Split(p.CategoryIds)],
        Tiers = [.. PricingService.Split(p.Tiers)], Channels = [.. PricingService.Split(p.Channels)],
        StartDate = p.StartsAt.Date, EndDate = p.EndsAt.Date, UsageLimit = p.UsageLimit?.ToString(),
    };
}

/// <summary>
/// Tạo, sửa, tạm dừng/chạy lại khuyến mãi, chuyển từ khuyen-mai/promotion-form-sheet.tsx. Loại khuyến
/// mãi không đổi được sau khi tạo; voucher đổi sao (có chủ) không quản lý ở đây.
/// </summary>
public partial class PromotionAdminService(AppDbContext db)
{
    [GeneratedRegex(@"^[A-Z0-9]{4,20}$")] private static partial Regex CodePattern();

    public static readonly string[] TierKeys = ["bronze", "silver", "gold", "diamond"];

    public static string TypeLabel(PromotionType t) => t switch
    {
        PromotionType.FlashSale => "Flash sale",
        PromotionType.Percent => "Giảm %",
        PromotionType.Fixed => "Giảm tiền",
        PromotionType.BuyXGetY => "Mua X tặng Y",
        _ => "Voucher thành viên",
    };

    public static string TypeHint(PromotionType t) => t switch
    {
        PromotionType.FlashSale => "Giảm % theo khung giờ mỗi ngày, tự áp dụng",
        PromotionType.Percent => "Khách nhập mã để giảm theo %, có mức giảm tối đa",
        PromotionType.Fixed => "Khách nhập mã để giảm một số tiền cố định",
        PromotionType.BuyXGetY => "Tự tặng thêm sản phẩm khi mua đủ số lượng",
        _ => "Giảm mỗi ly đồ uống theo hạng thành viên",
    };

    public static string StatusLabel(PromotionStatus s) => s switch
    {
        PromotionStatus.Scheduled => "Sắp diễn ra",
        PromotionStatus.Active => "Đang chạy",
        PromotionStatus.Paused => "Tạm dừng",
        _ => "Đã kết thúc",
    };

    public static string StatusTone(PromotionStatus s) => s switch
    {
        PromotionStatus.Scheduled => "info",
        PromotionStatus.Active => "fresh",
        PromotionStatus.Paused => "warning",
        _ => "neutral",
    };

    /// <summary>Mã ngẫu nhiên "7E" + 6 ký tự dễ đọc (không có 0/O/1/I).</summary>
    public static string NewCode() => "7E" + Text.Random(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");

    /// <summary>Làm sạch mã khách gõ: bỏ dấu, viết hoa, chỉ giữ A–Z và 0–9, tối đa 20 ký tự.</summary>
    public static string CleanCode(string? code)
    {
        var folded = Text.Fold(code).ToUpperInvariant();
        var clean = new string(folded.Where(c => c is >= 'A' and <= 'Z' or >= '0' and <= '9').ToArray());
        return clean.Length > 20 ? clean[..20] : clean;
    }

    private static int MinutesOf(string hhmm) => int.Parse(hhmm[..2]) * 60 + int.Parse(hhmm[3..]);

    public async Task<SaveResult<Promotion>> SaveAsync(PromotionInput input, DateTime now)
    {
        var errors = new FormErrors();
        var existing = input.Id is null ? null : await db.Promotions.FirstOrDefaultAsync(p => p.Id == input.Id && p.OwnerId == null);
        if (input.Id is not null && existing is null) errors.Set("Name", "Không tìm thấy khuyến mãi");
        var type = existing?.Type ?? input.Type;

        var name = input.Name?.Trim() ?? "";
        if (name.Length < 3) errors.Set(nameof(input.Name), "Nhập tên chương trình (tối thiểu 3 ký tự)");
        else if (name.Length > 80) errors.Set(nameof(input.Name), "Tối đa 80 ký tự");
        var description = input.Description?.Trim() ?? "";
        if (description.Length > 240) errors.Set(nameof(input.Description), "Tối đa 240 ký tự");
        var channels = input.Channels.Where(c => c is "online" or "in-store").Distinct().ToList();
        if (channels.Count == 0) errors.Set(nameof(input.Channels), "Chọn ít nhất một kênh bán");
        if (input.StartDate is null) errors.Set(nameof(input.StartDate), "Chọn ngày bắt đầu");
        if (input.EndDate is null) errors.Set(nameof(input.EndDate), "Chọn ngày kết thúc");
        else if (input.StartDate is DateTime s && input.EndDate < s) errors.Set(nameof(input.EndDate), "Ngày kết thúc phải từ ngày bắt đầu trở đi");
        else if (existing is null && input.EndDate < now.Date) errors.Set(nameof(input.EndDate), "Ngày kết thúc đã qua");

        var value = Text.ParseInt(input.Value);
        int? maxDiscount = null, minOrder = null, buy = null, get = null;
        string? code = null;
        if (type is PromotionType.Percent or PromotionType.FlashSale)
        {
            if (value is null or < 1 or > 90) errors.Set(nameof(input.Value), "Mức giảm từ 1% đến 90%");
        }
        if (type == PromotionType.Percent && !Text.IsBlank(input.MaxDiscount))
        {
            maxDiscount = Text.ParseInt(input.MaxDiscount);
            if (maxDiscount is null or < 1_000) errors.Set(nameof(input.MaxDiscount), "Giảm tối đa từ 1.000 ₫, hoặc để trống");
        }
        if (type is PromotionType.Percent or PromotionType.Fixed && !Text.IsBlank(input.MinOrderValue))
        {
            minOrder = Text.ParseInt(input.MinOrderValue);
            if (minOrder is null) errors.Set(nameof(input.MinOrderValue), "Chỉ nhập số");
        }
        if (type == PromotionType.Fixed)
        {
            if (value is null or < 1_000) errors.Set(nameof(input.Value), "Số tiền giảm tối thiểu 1.000 ₫");
            else if (minOrder is int min && value >= min) errors.Set(nameof(input.Value), "Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu");
        }
        if (type == PromotionType.BuyXGetY)
        {
            buy = Text.ParseInt(input.BuyQuantity);
            get = Text.ParseInt(input.GetQuantity);
            if (buy is null or < 1 or > 50) errors.Set(nameof(input.BuyQuantity), "Số lượng mua từ 1 đến 50");
            if (get is null or < 1 or > 10) errors.Set(nameof(input.GetQuantity), "Số lượng tặng từ 1 đến 10");
        }
        var tiers = input.Tiers.Where(TierKeys.Contains).Distinct().OrderBy(t => Array.IndexOf(TierKeys, t)).ToList();
        if (type == PromotionType.MemberVoucher && tiers.Count == 0) errors.Set(nameof(input.Tiers), "Chọn ít nhất một hạng thành viên");
        if (type is PromotionType.Percent or PromotionType.Fixed)
        {
            code = CleanCode(input.Code);
            if (!CodePattern().IsMatch(code)) errors.Set(nameof(input.Code), "Mã 4–20 ký tự, chỉ gồm chữ in hoa không dấu và số");
            else if (await db.Promotions.AnyAsync(p => p.Id != input.Id && p.Code != null && p.Code.ToUpper() == code))
                errors.Set(nameof(input.Code), $"Mã {code} đang được dùng cho khuyến mãi khác");
        }
        string? dailyStart = null, dailyEnd = null;
        if (type == PromotionType.FlashSale)
        {
            dailyStart = ValidTime(input.DailyStart, false);
            dailyEnd = ValidTime(input.DailyEnd, true);
            if (dailyStart is null) errors.Set(nameof(input.DailyStart), "Chọn giờ bắt đầu");
            if (dailyEnd is null) errors.Set(nameof(input.DailyEnd), "Chọn giờ kết thúc");
            else if (dailyStart is not null && MinutesOf(dailyEnd) <= MinutesOf(dailyStart)) errors.Set(nameof(input.DailyEnd), "Giờ kết thúc phải sau giờ bắt đầu");
        }
        var productIds = type == PromotionType.MemberVoucher ? [] : await db.Products.Where(p => input.ProductIds.Contains(p.Id)).Select(p => p.Id).ToListAsync();
        var categoryIds = type == PromotionType.MemberVoucher ? ["tra-sua"] : await db.Categories.Where(c => input.CategoryIds.Contains(c.Id)).OrderBy(c => c.SortOrder).Select(c => c.Id).ToListAsync();
        if (type is PromotionType.FlashSale or PromotionType.BuyXGetY && productIds.Count == 0 && categoryIds.Count == 0)
            errors.Set(nameof(input.ProductIds), "Chọn ít nhất một sản phẩm hoặc danh mục");
        int? limit = null;
        if (!Text.IsBlank(input.UsageLimit))
        {
            limit = Text.ParseInt(input.UsageLimit);
            if (limit is null or < 1) errors.Set(nameof(input.UsageLimit), "Tối thiểu 1 lượt, hoặc để trống nếu không giới hạn");
            else if (existing is not null && limit < existing.UsageCount) errors.Set(nameof(input.UsageLimit), $"Không được nhỏ hơn số lượt đã dùng ({existing.UsageCount})");
        }
        if (errors.Count > 0) return SaveResult<Promotion>.Fail(errors);

        var promotion = existing ?? new Promotion { Id = "pr-" + Text.Random(8), Type = type, Status = PromotionStatus.Active };
        if (existing is null) db.Promotions.Add(promotion);
        promotion.Name = name;
        promotion.Description = description;
        promotion.Code = code;
        promotion.Value = type is PromotionType.BuyXGetY or PromotionType.MemberVoucher ? 0 : value!.Value;
        promotion.MaxDiscount = type == PromotionType.Percent ? maxDiscount : null;
        promotion.MinOrderValue = type is PromotionType.Percent or PromotionType.Fixed ? minOrder : null;
        promotion.BuyQuantity = type == PromotionType.BuyXGetY ? buy : null;
        promotion.GetQuantity = type == PromotionType.BuyXGetY ? get : null;
        promotion.DailyStart = dailyStart;
        promotion.DailyEnd = dailyEnd;
        promotion.ProductIds = string.Join(",", productIds);
        promotion.CategoryIds = string.Join(",", categoryIds);
        promotion.Tiers = type is PromotionType.FlashSale or PromotionType.BuyXGetY ? "" : string.Join(",", tiers);
        promotion.Channels = string.Join(",", new[] { "online", "in-store" }.Where(channels.Contains));
        // Ngày không đổi thì giữ nguyên giờ cũ; ngày mới thì từ 00:00 tới 23:59:59.
        if (existing is null || promotion.StartsAt.Date != input.StartDate!.Value.Date) promotion.StartsAt = input.StartDate!.Value.Date;
        if (existing is null || promotion.EndsAt.Date != input.EndDate!.Value.Date) promotion.EndsAt = input.EndDate!.Value.Date.AddDays(1).AddMilliseconds(-1);
        promotion.UsageLimit = limit;
        await db.SaveChangesAsync();
        return new SaveResult<Promotion>(promotion, errors);
    }

    /// <summary>"HH:mm" theo bước 30 phút; giờ kết thúc được phép là 24:00.</summary>
    private static string? ValidTime(string? value, bool allowMidnight)
    {
        if (value is null || !Regex.IsMatch(value, @"^\d{2}:\d{2}$")) return null;
        var minutes = MinutesOf(value);
        if (minutes % 30 != 0) return null;
        return minutes < 24 * 60 || (allowMidnight && minutes == 24 * 60) ? value : null;
    }

    /// <summary>Bật/tắt (tạm dừng) một chương trình; chương trình đã hết hạn thì không bật lại được.</summary>
    public async Task<Promotion?> SetPausedAsync(string id, bool paused, DateTime now)
    {
        var promotion = await db.Promotions.FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == null);
        if (promotion is null) return null;
        // Bật lại một chương trình đã quá hạn thì nó chuyển sang "Đã kết thúc" (trạng thái suy ra từ ngày).
        promotion.Status = paused ? PromotionStatus.Paused : PromotionStatus.Active;
        await db.SaveChangesAsync();
        return promotion;
    }
}
