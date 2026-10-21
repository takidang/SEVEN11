using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;
using SevenEleven.Web.Models.Shop;

namespace SevenEleven.Web.Controllers;

/// <summary>Theo dõi đơn (/don-hang/{mã}), khách tự huỷ khi cửa hàng chưa xác nhận, "Mua lại".</summary>
public class OrderController(AppDbContext db, OrderService orders, CartStore cart) : ShopController(db)
{
    /// <summary>Câu báo khi đơn vừa đổi bước (nhân viên cập nhật ở khu quản lý trong lúc khách đang xem).</summary>
    private static readonly Dictionary<OrderStatus, string> StatusToast = new()
    {
        [OrderStatus.Confirmed] = "Cửa hàng đã xác nhận đơn hàng của bạn",
        [OrderStatus.Preparing] = "Đơn hàng đang được chuẩn bị",
        [OrderStatus.Delivering] = "Shipper đang giao hàng tới bạn",
        [OrderStatus.Completed] = "Đơn hàng đã được giao thành công",
        [OrderStatus.Cancelled] = "Đơn hàng đã được huỷ",
    };

    public async Task<IActionResult> Detail(string code, int? moi, int? capnhat)
    {
        code = (code ?? "").Trim().ToUpperInvariant();
        var order = await Db.Orders.AsNoTracking()
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Timeline)
            .Include(o => o.Delivery)
            .Include(o => o.Store)
            .AsSplitQuery()
            .FirstOrDefaultAsync(o => o.Code == code);
        await FillMenuAsync();
        if (order is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            ViewData["Title"] = "Không tìm thấy đơn hàng";
            return View("NotFound", code);
        }

        // Ai cũng tra được đơn bằng mã, nhưng chỉ chủ đơn mới thấy đủ tên, số điện thoại và địa chỉ.
        var customerId = User.CustomerId();
        var customer = customerId is null ? null : await Db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId);
        if (capnhat == 1 && StatusToast.TryGetValue(order.Status, out var message))
        {
            if (order.Status == OrderStatus.Cancelled) this.ToastInfo(message, order.Code);
            else this.Toast(message, order.Code);
        }
        ViewData["Title"] = $"Đơn {order.Code}";
        return View(new OrderPageModel
        {
            Order = order,
            IsOwner = customer is not null && order.CustomerId == customer.Id,
            SignedIn = customer is not null,
            FirstName = customer?.FullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).LastOrDefault(),
            JustPlaced = moi == 1,
            Now = DateTime.Now,
            AgeConfirmed = cart.AgeConfirmed(),
        });
    }

    /// <summary>Trạng thái hiện tại, để trang đơn tự làm mới khi cửa hàng chuyển bước.</summary>
    public async Task<IActionResult> Status(string code)
    {
        var status = await Db.Orders.AsNoTracking().Where(o => o.Code == code).Select(o => (OrderStatus?)o.Status).FirstOrDefaultAsync();
        return status is null ? NotFound() : Json(new { status = status.ToString() });
    }

    /// <summary>Khách tự huỷ khi cửa hàng chưa xác nhận đơn.</summary>
    [HttpPost, ValidateAntiForgeryToken, Authorize(Roles = Roles.Customer)]
    public async Task<IActionResult> Cancel(string code)
    {
        var order = await Db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Code == code);
        var customerId = User.CustomerId();
        if (order is null || order.CustomerId != customerId) return NotFound();
        if (!OrderFlow.CustomerCanCancel(order.Status))
        {
            this.ToastError("Cửa hàng vừa xác nhận đơn nên không thể huỷ trên web", "Vui lòng gọi cửa hàng nếu bạn cần hỗ trợ.");
            return Redirect(ShopUrls.Order(order.Code));
        }
        var name = await Db.Customers.Where(c => c.Id == customerId).Select(c => c.FullName).FirstOrDefaultAsync();
        var result = await orders.ChangeStatusAsync(order.Id, OrderStatus.Cancelled, name, "Khách huỷ trên web");
        if (result.Ok) this.ToastInfo(StatusToast[OrderStatus.Cancelled], order.Code);
        else this.ToastError(result.Error!);
        return Redirect(ShopUrls.Order(order.Code));
    }

    /// <summary>"Mua lại": cho lại vào giỏ mọi món còn bán của đơn rồi mở giỏ hàng.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Reorder(string code, bool ageConfirmed)
    {
        var order = await Db.Orders.AsNoTracking().Include(o => o.Items).ThenInclude(i => i.Product).FirstOrDefaultAsync(o => o.Code == code);
        if (order is null) return NotFound();
        var items = order.Items.Where(i => i.Product?.IsActive == true).ToList();
        if (items.Count == 0)
        {
            this.ToastError("Các sản phẩm trong đơn này đã ngừng bán");
            return Redirect(ShopUrls.Order(order.Code));
        }
        if (items.Any(i => i.Product!.AgeRestricted) && !cart.AgeConfirmed())
        {
            if (!ageConfirmed)
            {
                this.ToastError("Đơn có đồ uống có cồn", "Xác nhận bạn đã đủ 18 tuổi để thêm vào giỏ hàng.");
                return Redirect(ShopUrls.Order(order.Code));
            }
            cart.ConfirmAge();
        }
        foreach (var item in items) cart.Add(item.ProductId, item.Quantity);
        var skipped = order.Items.Count - items.Count;
        this.Toast($"Đã thêm {items.Count} sản phẩm vào giỏ hàng", skipped > 0 ? $"{skipped} sản phẩm đã ngừng bán nên không được thêm." : null);
        return Redirect(ShopUrls.Cart);
    }
}
