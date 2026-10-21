using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;
using SevenEleven.Web.Models.Shop;

namespace SevenEleven.Web.Controllers;

/// <summary>Giỏ hàng (/gio-hang) và đặt hàng online.</summary>
public class CartController(AppDbContext db, CartStore cart, OrderService orders, ShopContext shop) : ShopController(db)
{
    /// <summary>Ngành hàng hợp với hầu hết giỏ hàng tiện lợi, theo thứ tự ưu tiên ("Có thể bạn cần thêm").</summary>
    private static readonly string[] AddOnCategories = ["tra-sua", "do-uong-dong-chai", "do-an-vat", "cac-loai-banh", "san-pham-tu-sua"];
    private static readonly string[] ExcludedSubcategories = ["tra-sua--topping"];
    private const int SuggestionLimit = 12;
    private const string ErrorsKey = "CheckoutErrors";

    public async Task<IActionResult> Index(string? voucher)
    {
        ViewData["Title"] = "Giỏ hàng";
        var model = await BuildAsync(voucher == "1");
        return View(model);
    }

    // ------------------------------------------------------------------ thêm, bớt, xoá

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Add(string productId, int quantity = 1, string? returnUrl = null, bool ageConfirmed = false, bool silent = false)
    {
        var product = await Db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == productId);
        var back = SafeReturn(returnUrl, ShopUrls.Cart);
        if (product is null || !product.IsActive)
        {
            var error = new Toast("Sản phẩm này đã ngừng bán", Tone: "error");
            if (Request.IsFetch()) return Json(new { ok = false, toast = error, cartCount = cart.Count() });
            Toasts.Add(TempData, error);
            return LocalRedirect(back);
        }

        quantity = Math.Clamp(quantity, 1, 99);
        // Đồ uống có cồn: khách phải xác nhận đủ 18 tuổi (một lần mỗi phiên) trước khi vào giỏ.
        if (product.AgeRestricted && !cart.AgeConfirmed())
        {
            if (!ageConfirmed)
            {
                if (Request.IsFetch()) return Json(new { ok = false, needsAge = true });
                return LocalRedirect($"{ShopUrls.Product(product.Slug)}?tuoi=1&sl={quantity}");
            }
            cart.ConfirmAge();
        }

        cart.Add(product.Id, quantity);
        var toast = new Toast("Đã thêm vào giỏ hàng", product.Name, Action: new ToastAction("Xem giỏ", ShopUrls.Cart));
        if (Request.IsFetch())
        {
            var inCart = cart.Lines().Where(l => l.ProductId == product.Id).Sum(l => l.Quantity);
            return Json(new { ok = true, cartCount = cart.Count(), productId = product.Id, quantity = inCart, toast = silent ? null : toast, ageConfirmed = cart.AgeConfirmed() });
        }
        if (!silent) Toasts.Add(TempData, toast);
        return LocalRedirect(back);
    }

    /// <summary>Nút − / + trên thẻ sản phẩm: cộng/trừ một, về 0 thì bỏ khỏi giỏ.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Step(string productId, int delta, string? returnUrl = null, bool ageConfirmed = false)
    {
        var current = cart.Lines().Where(l => l.ProductId == productId).Sum(l => l.Quantity);
        var next = Math.Clamp(current + Math.Sign(delta), 0, 99);
        // Chưa có trong giỏ thì đi đường "Thêm" để kiểm tra sản phẩm còn bán và độ tuổi.
        if (current == 0 && next > 0) return await Add(productId, next, returnUrl, ageConfirmed);
        cart.Set(productId, next);
        if (Request.IsFetch()) return Json(new { ok = true, cartCount = cart.Count(), productId, quantity = next });
        return LocalRedirect(SafeReturn(returnUrl, ShopUrls.Cart));
    }

    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Update(string productId, int quantity)
    {
        cart.Set(productId, quantity);
        return Redirect(ShopUrls.Cart);
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Remove(string productId)
    {
        var quantity = cart.Lines().Where(l => l.ProductId == productId).Sum(l => l.Quantity);
        cart.Set(productId, 0);
        var name = await Db.Products.Where(p => p.Id == productId).Select(p => p.Name).FirstOrDefaultAsync();
        if (quantity > 0)
        {
            Toasts.Add(TempData, new Toast("Đã xoá khỏi giỏ hàng", name, "info", new ToastAction("Hoàn tác", "/Cart/Add",
                new Dictionary<string, string> { ["productId"] = productId, ["quantity"] = quantity.ToString(), ["returnUrl"] = ShopUrls.Cart, ["silent"] = "true", ["ageConfirmed"] = "true" })));
        }
        return Redirect(ShopUrls.Cart);
    }

    /// <summary>"Xoá tất cả": sản phẩm, mã khuyến mãi và ghi chú.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Clear()
    {
        cart.Clear();
        return Redirect(ShopUrls.Cart);
    }

    // ------------------------------------------------------------------ mã giảm giá

    /// <summary>Gắn mã vào giỏ (kiểu cũ: ô mã giảm giá); để trống là gỡ mã. Điều kiện được kiểm ở giỏ hàng.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Code(string? code)
    {
        cart.SetCode(code);
        return Redirect(ShopUrls.Cart);
    }

    /// <summary>"Dùng ngay" ở trang Khuyến mãi: gắn mã vào giỏ, điều kiện kiểm khi đặt hàng.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult AttachCode(string code, string? returnUrl)
    {
        var value = (code ?? "").Trim().ToUpperInvariant();
        cart.SetCode(value);
        var toast = new Toast($"Đã gắn mã {value} vào giỏ hàng", "Mã được kiểm tra điều kiện khi bạn đặt hàng.", Action: new ToastAction("Xem giỏ", ShopUrls.Cart));
        if (Request.IsFetch()) return Json(new { ok = true, toast });
        Toasts.Add(TempData, toast);
        return LocalRedirect(SafeReturn(returnUrl, ShopUrls.Promotions) + "#ma-giam-gia");
    }

    /// <summary>Ô chọn voucher: chọn trong danh sách hoặc nhập mã. Mã chưa dùng được thì không gắn, báo lý do.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> ApplyVoucher(string? code)
    {
        var value = (code ?? "").Trim().ToUpperInvariant();
        if (value.Length == 0) return PickerError("Nhập mã voucher", value);
        var model = await BuildAsync(false);
        var lines = model.Rows.Where(r => r.Priced is not null).Select(r => r.Line).ToList();
        var products = model.Rows.Where(r => r.Priced is not null).ToDictionary(r => r.Product!.Id, r => r.Product!);
        var result = PricingService.PriceCart(lines, products, shop.Promotions, SalesChannel.Online, model.Customer, value, delivery: true, shop.Now);
        if (result.CodeError is string error) return PickerError(error, value);
        cart.SetCode(value);
        var saving = result.Discounts.FirstOrDefault(d => d.Kind == DiscountKind.Code)?.Amount ?? 0;
        this.Toast($"Đã áp dụng voucher {value}", $"Giảm {Fmt.Vnd(saving)} cho đơn hàng này");
        return Redirect(ShopUrls.Cart);
    }

    private RedirectResult PickerError(string error, string draft)
    {
        TempData["VoucherError"] = error;
        TempData["VoucherDraft"] = draft;
        return Redirect(ShopUrls.Cart + "?voucher=1");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult RemoveVoucher()
    {
        var code = cart.Code();
        cart.SetCode(null);
        if (code is not null) this.Toast($"Đã bỏ voucher {code}");
        return Redirect(ShopUrls.Cart);
    }

    // ------------------------------------------------------------------ giao hàng

    /// <summary>Chọn địa chỉ giao trong sổ địa chỉ của khách (đổi luôn cửa hàng phục vụ).</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Address(string addressId, string? returnUrl)
    {
        cart.SetAddress(addressId);
        return LocalRedirect(SafeReturn(returnUrl, ShopUrls.Cart));
    }

    /// <summary>Lưu phần khách đang điền (ghi chú, người nhận, thanh toán) để trang tải lại không mất.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Draft(string? note, string? recipient, string? phone, string? paymentMethod)
    {
        cart.SetNote(note);
        cart.SetDraft(new CheckoutDraft { Recipient = recipient?.Trim(), Phone = phone?.Trim(), Payment = paymentMethod });
        return Json(new { ok = true });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Checkout(string? recipient, string? phone, string? note, string? paymentMethod)
    {
        var customerId = User.CustomerId();
        if (customerId is null) return Reply(redirect: ShopUrls.SignInNext(ShopUrls.Cart));

        var payment = paymentMethod switch { "Ewallet" => PaymentMethod.Ewallet, "Card" => PaymentMethod.Card, _ => PaymentMethod.Cod };
        cart.SetNote(note);
        cart.SetDraft(new CheckoutDraft { Recipient = recipient?.Trim(), Phone = phone?.Trim(), Payment = payment.ToString() });

        var model = await BuildAsync(false);
        var errors = new FormErrors();
        var name = (recipient ?? "").Trim();
        if (name.Length < 2) errors.Set("recipient", "Nhập họ tên người nhận");
        else if (name.Length > 60) errors.Set("recipient", "Họ tên tối đa 60 ký tự");
        var normalizedPhone = Phone.Normalize(phone);
        if (string.IsNullOrWhiteSpace(phone)) errors.Set("phone", "Nhập số điện thoại");
        else if (!Phone.IsValid(normalizedPhone)) errors.Set("phone", Phone.Rule);
        if (errors.Count > 0)
        {
            TempData[ErrorsKey] = JsonSerializer.Serialize(errors);
            return Fail("Vui lòng kiểm tra thông tin người nhận");
        }

        var address = model.Delivery.Address;
        var store = model.Delivery.Store;
        if (address is null) return Fail("Vui lòng nhập địa chỉ giao hàng");
        if (model.Rows.Count == 0) return Fail("Giỏ hàng đang trống");
        if (model.HasUnavailable) return Fail("Giỏ hàng có sản phẩm đã ngừng bán", "Xoá các sản phẩm đó để tiếp tục đặt hàng.");
        if (store is null || store.Status != StoreStatus.Active) return Fail("Cửa hàng phục vụ đang tạm ngưng nhận đơn", "Vui lòng chọn địa chỉ giao hàng khác.");
        if (model.Delivery.OutOfRange && model.Delivery.DistanceKm is double km)
            return Fail("Địa chỉ ngoài vùng giao hàng", $"{(cart.StoreId() is null ? "Cửa hàng gần nhất" : $"Cửa hàng {store.Code} bạn chọn")} cách {DeliveryService.FormatDistance(km)}, quá {DeliveryService.RadiusKm:0} km nên không giao trong 24 phút được.");
        if (model.ShortRows.Count > 0)
            return Fail($"Cửa hàng {store.Code} không đủ hàng cho {model.ShortRows.Count} sản phẩm", "Giảm số lượng hoặc xoá các sản phẩm được đánh dấu.");
        if (model.Code is string code && model.Pricing.CodeError is string codeError)
            return Fail($"Chưa dùng được mã {code}", $"{codeError}. Gỡ mã để tiếp tục.");

        var result = await orders.PlaceAsync(new PlaceOrderInput(
            SalesChannel.Online,
            store.Id,
            model.Rows.Select(r => r.Line).ToList(),
            payment,
            customerId,
            model.Code,
            new DeliveryInput(name, normalizedPhone, $"{address.Line}, {address.Ward}, {address.Province}",
                string.IsNullOrWhiteSpace(note) ? null : note.Trim()[..Math.Min(note.Trim().Length, CartStore.NoteMaxLength)],
                model.Delivery.DistanceKm is double d ? Math.Round(d, 1, MidpointRounding.AwayFromZero) : null)));
        if (!result.Ok) return Fail("Chưa đặt được hàng", result.Error);

        cart.Clear();
        var orderCode = result.Order!.Code;
        return Reply(redirect: $"{ShopUrls.Order(orderCode)}?moi=1", message: $"Đặt hàng thành công, đang mở đơn {orderCode}…");
    }

    private IActionResult Fail(string title, string? desc = null)
    {
        Toasts.Add(TempData, new Toast(title, desc, "error"));
        return Reply(reload: true);
    }

    /// <summary>Trả lời cả hai kiểu gửi: fetch (JSON cho shop.js) và form thường (chuyển trang).</summary>
    private IActionResult Reply(string? redirect = null, string? message = null, bool reload = false)
    {
        if (Request.IsFetch()) return Json(new { redirect, message, reload });
        return Redirect(redirect ?? ShopUrls.Cart);
    }

    private string SafeReturn(string? returnUrl, string fallback) =>
        !string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl) ? returnUrl : fallback;

    // ------------------------------------------------------------------ dựng trang giỏ

    /// <summary>Giỏ hàng được tính giá lại ở mỗi lần xem, bằng chính bộ máy dùng khi đặt hàng.</summary>
    private async Task<CartModel> BuildAsync(bool openPicker)
    {
        var now = shop.Now;
        var lines = cart.Lines();
        var ids = lines.Select(l => l.ProductId).ToList();
        var all = await Db.Products.AsNoTracking().Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        // Sản phẩm khu quản lý đã ngừng bán vẫn hiện trong giỏ nhưng không tính tiền, không đặt được.
        var active = all.Values.Where(p => p.IsActive).ToDictionary(p => p.Id);
        var orderable = lines.Where(l => active.ContainsKey(l.ProductId)).ToList();
        var promotions = shop.Promotions;
        var customer = shop.Customer;
        var delivery = shop.Delivery;
        var store = shop.ServingStore;
        var code = cart.Code();

        PricingResult Price(string? withCode) =>
            PricingService.PriceCart(orderable, active, (IReadOnlyCollection<Promotion>)promotions, SalesChannel.Online, customer, withCode, delivery: true, now);
        var pricing = Price(code);

        var stock = store is null
            ? new Dictionary<string, int>()
            : await Db.StockLevels.AsNoTracking().Where(s => s.StoreId == store.Id && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId, s => s.Quantity);
        var priced = pricing.Lines.ToDictionary(l => l.Product.Id);
        var rows = lines.Select(l => new CartRow(l, all.GetValueOrDefault(l.ProductId), priced.GetValueOrDefault(l.ProductId), stock.GetValueOrDefault(l.ProductId))).ToList();

        var errors = TempData[ErrorsKey] is string json ? JsonSerializer.Deserialize<FormErrors>(json) : null;
        var pickerError = TempData["VoucherError"] as string;

        return new CartModel
        {
            Pricing = pricing,
            Rows = rows,
            Customer = customer,
            Delivery = delivery,
            Store = store,
            Code = code,
            Vouchers = ShopPromos.Options(promotions, now, customer, pricing, Price),
            MemberVoucherLive = customer is not null && promotions.Any(p =>
                p.Type == PromotionType.MemberVoucher && PricingService.Tiers(p).Contains(customer.Tier) && PricingService.IsLive(p, now, SalesChannel.Online)),
            Suggestions = lines.Count > 0 ? Suggestions(ids) : [],
            Discounted = lines.Count == 0 ? ShopPromos.Discounted(shop.Products).Take(16).ToList() : [],
            Note = cart.Note(),
            Draft = cart.Draft(),
            Now = now,
            OpenPicker = openPicker || pickerError is not null,
            PickerError = pickerError,
            PickerDraft = TempData["VoucherDraft"] as string,
            Errors = errors,
        };
    }

    /// <summary>
    /// "Có thể bạn cần thêm": món thêm nhanh từ các ngành hàng giỏ chưa có (ngành chưa có xếp trước), mỗi
    /// ngành góp lần lượt từng món: đang giảm giá trước, hàng mới, rồi giá thấp. Không gợi ý món đã có
    /// trong giỏ, đồ có cồn hay topping.
    /// </summary>
    private List<Product> Suggestions(List<string> inCartIds)
    {
        var inCart = inCartIds.ToHashSet();
        var products = shop.Products;
        var cartCategories = products.Where(p => inCart.Contains(p.Id)).Select(p => p.CategoryId).ToHashSet();
        static int Score(Product p) => (p.CompareAtPrice is int c && c > p.Price ? 2 : 0) + (p.IsNew ? 1 : 0);
        var queues = AddOnCategories
            .OrderBy(c => cartCategories.Contains(c) ? 1 : 0)
            .Select(c => products
                .Where(p => p.CategoryId == c && !inCart.Contains(p.Id) && !p.AgeRestricted && !ExcludedSubcategories.Contains(p.SubcategoryId))
                .OrderByDescending(Score).ThenBy(p => p.Price)
                .ToList())
            .ToList();
        var picked = new List<Product>();
        for (var round = 0; picked.Count < SuggestionLimit && queues.Any(q => q.Count > round); round++)
            foreach (var queue in queues)
                if (round < queue.Count && picked.Count < SuggestionLimit) picked.Add(queue[round]);
        return picked;
    }
}
