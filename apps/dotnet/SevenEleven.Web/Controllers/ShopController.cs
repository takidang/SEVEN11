using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;

namespace SevenEleven.Web.Controllers;

/// <summary>Gốc chung cho các trang cửa hàng: nạp menu danh mục cho layout.</summary>
public abstract class ShopController(AppDbContext db) : Controller
{
    protected AppDbContext Db { get; } = db;

    protected async Task FillMenuAsync(string? activeSlug = null)
    {
        ViewBag.Categories = await Db.Categories.OrderBy(c => c.SortOrder).ToListAsync();
        ViewBag.ActiveCategory = activeSlug;
    }
}
