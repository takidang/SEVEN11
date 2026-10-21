using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>Khuyến mãi toàn chuỗi. Quản trị tạo/sửa/tạm dừng; quản lý chỉ xem. Voucher đổi sao không hiện ở đây.</summary>
public class PromotionsController(AppDbContext db, PromotionAdminService promotions) : AdminController(db)
{
    public static readonly (string Key, string Label, PromotionStatus? Status)[] Tabs =
    [
        ("dang-chay", "Đang chạy", PromotionStatus.Active), ("sap-dien-ra", "Sắp diễn ra", PromotionStatus.Scheduled),
        ("tam-dung", "Tạm dừng", PromotionStatus.Paused), ("da-ket-thuc", "Đã kết thúc", PromotionStatus.Ended), ("tat-ca", "Tất cả", null),
    ];

    public async Task<IActionResult> Index(string? tab, string? q, PromotionType? type)
    {
        var now = DateTime.Now;
        var all = await Db.Promotions.AsNoTracking().Where(p => p.OwnerId == null).ToListAsync();
        var matching = all.Where(p => (type is null || p.Type == type) && Text.MatchesAllWords($"{p.Name} {p.Code} {p.Description}", q))
            .Select(p => (Promotion: p, Status: PricingService.EffectiveStatus(p, now))).ToList();
        var current = Tabs.FirstOrDefault(t => t.Key == tab);
        if (current.Key is null) current = Tabs[0];
        var shown = matching.Where(x => current.Status is null || x.Status == current.Status)
            .OrderBy(x => x.Status switch { PromotionStatus.Active => 0, PromotionStatus.Scheduled => 1, PromotionStatus.Paused => 2, _ => 3 })
            .ThenBy(x => x.Status == PromotionStatus.Scheduled ? x.Promotion.StartsAt : DateTime.MinValue)
            .ThenByDescending(x => x.Status == PromotionStatus.Ended ? x.Promotion.EndsAt : DateTime.MinValue)
            .ThenBy(x => x.Status is PromotionStatus.Active or PromotionStatus.Paused ? x.Promotion.EndsAt : DateTime.MinValue)
            .ToList();
        var counts = Tabs.ToDictionary(t => t.Key, t => matching.Count(x => t.Status is null || x.Status == t.Status));
        var ids = shown.SelectMany(x => PricingService.Split(x.Promotion.ProductIds)).Distinct().ToList();
        var products = await Db.Products.AsNoTracking().Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var categories = await Db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        ViewData["Title"] = "Khuyến mãi";
        return View(new PromotionListModel(shown, counts, current.Key, q, type, products, categories, now));
    }

    public async Task<IActionResult> Edit(string? id)
    {
        if (!CanManage) return RedirectToAction(nameof(Index));
        PromotionInput input;
        Promotion? existing = null;
        if (id is null)
        {
            var today = DateTime.Today;
            input = new PromotionInput { StartDate = today, EndDate = today.AddDays(30) };
        }
        else
        {
            existing = await Db.Promotions.FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == null);
            if (existing is null) return NotFound();
            input = PromotionInput.From(existing);
        }
        return await FormAsync(input, existing, null);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Save(PromotionInput input)
    {
        var result = await promotions.SaveAsync(input, DateTime.Now);
        if (!result.Ok)
        {
            var existing = input.Id is null ? null : await Db.Promotions.AsNoTracking().FirstOrDefaultAsync(p => p.Id == input.Id);
            return await FormAsync(input, existing, result.Errors);
        }
        Toast(input.Id is null ? $"Đã tạo khuyến mãi “{result.Value!.Name}”" : $"Đã lưu thay đổi “{result.Value!.Name}”");
        return RedirectToAction(nameof(Index), new { tab = "tat-ca", q = result.Value.Name });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Toggle(string id, bool paused, string? returnUrl)
    {
        var promotion = await promotions.SetPausedAsync(id, paused, DateTime.Now);
        if (promotion is null) return NotFound();
        Toast(paused ? $"Đã tạm dừng “{promotion.Name}”" : $"Đã bật lại “{promotion.Name}”");
        return Back(returnUrl, "/Admin/Promotions");
    }

    /// <summary>Tìm sản phẩm cho ô chọn phạm vi khuyến mãi (chỉ hàng đang bán, tối đa 60 kết quả).</summary>
    public async Task<IActionResult> ProductSearch(string? q)
    {
        var term = q?.Trim() ?? "";
        var active = await Db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Name).ToListAsync();
        var found = active.Where(p => term.Length == 0 || p.Sku.Equals(term, StringComparison.OrdinalIgnoreCase) || p.Barcode == term
                                      || Text.MatchesAllWords($"{p.Name} {p.Brand}", term)).ToList();
        return Json(new
        {
            total = found.Count,
            items = found.Take(60).Select(p => new { id = p.Id, name = p.Name, sku = p.Sku, price = Money.Format(p.Price), image = p.Image }),
        });
    }

    private async Task<IActionResult> FormAsync(PromotionInput input, Promotion? existing, FormErrors? errors)
    {
        var categories = await Db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ToListAsync();
        var picked = await Db.Products.AsNoTracking().Where(p => input.ProductIds.Contains(p.Id)).ToListAsync();
        ViewData["Title"] = existing is null ? "Tạo khuyến mãi" : $"Sửa khuyến mãi: {existing.Name}";
        return View("Edit", new PromotionFormModel(input, existing, categories, picked, errors ?? new FormErrors()));
    }
}

public record PromotionListModel(
    List<(Promotion Promotion, PromotionStatus Status)> Promotions, Dictionary<string, int> Counts, string Tab, string? Query, PromotionType? Type,
    Dictionary<string, Product> Products, Dictionary<string, string> Categories, DateTime Now);

public record PromotionFormModel(PromotionInput Input, Promotion? Existing, List<Category> Categories, List<Product> Picked, FormErrors Errors);
