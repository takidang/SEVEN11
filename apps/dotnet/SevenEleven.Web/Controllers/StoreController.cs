using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;
using SevenEleven.Web.Models.Shop;

namespace SevenEleven.Web.Controllers;

/// <summary>Hệ thống cửa hàng (/cua-hang): lọc tỉnh, tìm, xếp theo khoảng cách, chọn cửa hàng giao đơn online.</summary>
public class StoreController(AppDbContext db, ShopContext shop, CartStore cart) : ShopController(db)
{
    public async Task<IActionResult> Index(string? tinh, string? q)
    {
        var stores = await Db.Stores.AsNoTracking().OrderBy(s => s.Code).ToListAsync();
        await FillMenuAsync();
        ViewData["Title"] = "Hệ thống cửa hàng";
        var delivery = shop.Delivery;
        // Mặc định mở đúng tỉnh khách đang giao tới, thay vì cả nước.
        var province = tinh == "tat-ca" ? null : stores.Any(s => s.Province == tinh) ? tinh : delivery.Address?.Province;
        return View(new StoreDirectoryModel
        {
            Stores = stores,
            Province = province,
            Query = q?.Trim() ?? "",
            Selected = delivery.Store,
            Point = delivery.Address is { Lat: double lat, Lng: double lng } ? (lat, lng) : null,
        });
    }

    /// <summary>"Giao từ cửa hàng này": đơn online sau đó chuẩn bị và giao từ cửa hàng khách chọn.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Choose(string id, string? tinh)
    {
        var store = await Db.Stores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
        if (store is null || store.Status != StoreStatus.Active)
        {
            this.ToastError("Cửa hàng này đang tạm ngưng nhận đơn");
            return RedirectToAction(nameof(Index), new { tinh });
        }
        cart.SetStore(store.Id);
        this.Toast($"Đã chọn cửa hàng {store.Code} – {store.Name}", "Đơn online của bạn sẽ được chuẩn bị và giao từ cửa hàng này.");
        return RedirectToAction(nameof(Index), new { tinh });
    }
}
