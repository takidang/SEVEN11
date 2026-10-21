using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Máy bán hàng tại quầy. Hoá đơn đang bấm nằm trong phiên làm việc và luôn được tính lại bằng
/// đúng bộ máy tính giá của cửa hàng online (kênh tại quầy), nên giá ở hai nơi không lệch nhau.
/// Kho được kiểm ngay khi thêm hàng (không bán quá số đang có ở cửa hàng), ca làm không bắt buộc
/// nhưng có sẵn nút vào ca / kết ca để đối chiếu tiền két.
/// </summary>
public partial class PosController(AppDbContext db, PosBillStore bill, OrderService orders, ShiftService shifts) : AdminController(db)
{
    private const int TileCount = 48;

    private PosHoldStore Held => new(HttpContext.Session, bill);

    public async Task<IActionResult> Index(string? q, string? cat)
    {
        var store = await CurrentStoreAsync();
        if (store is null)
        {
            ViewData["Title"] = "Bán tại quầy";
            return View("PickStore", await Db.Stores.AsNoTracking().OrderBy(s => s.Province).ThenBy(s => s.Code).ToListAsync());
        }

        var now = DateTime.Now;
        var categories = await Db.Categories.OrderBy(c => c.SortOrder).ToListAsync();
        var query = Db.Products.Include(p => p.Category).Where(p => p.IsActive);
        List<Product> products;
        string heading;
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            products = await query.Where(p => EF.Functions.Like(p.Name, $"%{term}%") || p.Barcode == term || p.Sku == term)
                .OrderBy(p => p.Name).Take(TileCount).ToListAsync();
            heading = $"Kết quả cho \"{term}\"";
        }
        else if (categories.FirstOrDefault(c => c.Id == cat) is { } category)
        {
            products = await query.Where(p => p.CategoryId == category.Id).OrderBy(p => p.Name).Take(TileCount).ToListAsync();
            heading = category.Name;
        }
        else
        {
            // Mặc định: hàng bán chạy nhất của chính cửa hàng này trong 7 ngày, để thu ngân bấm nhanh.
            var since = now.AddDays(-7);
            var top = await Db.OrderItems
                .Where(i => i.Order!.StoreId == store.Id && i.Order.CreatedAt >= since && i.Order.Status != OrderStatus.Cancelled)
                .GroupBy(i => i.ProductId)
                .OrderByDescending(g => g.Sum(i => i.Quantity))
                .Select(g => g.Key)
                .Take(TileCount)
                .ToListAsync();
            var found = await query.Where(p => top.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
            products = top.Where(found.ContainsKey).Select(id => found[id]).ToList();
            heading = "Bán chạy ở cửa hàng 7 ngày qua";
        }

        var ids = products.Select(p => p.Id).ToList();
        var stock = await Db.StockLevels.Where(s => s.StoreId == store.Id && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        // Hàng hết nằm cuối danh sách, giữ nguyên thứ tự còn lại.
        products = products.OrderBy(p => (stock.GetValueOrDefault(p.Id)?.Quantity ?? 0) <= 0 ? 1 : 0).ToList();
        var promotions = await Db.Promotions.ToListAsync();
        var buyGet = products.ToDictionary(p => p.Id, p => promotions.FirstOrDefault(pr =>
            pr.Type == PromotionType.BuyXGetY && pr.BuyQuantity > 0 && pr.GetQuantity > 0 &&
            PricingService.AppliesTo(pr, p) && PricingService.IsLive(pr, now, SalesChannel.InStore)));

        var shift = await ShiftAsync(store, now);
        ViewData["Title"] = "Bán tại quầy";
        return View(new PosModel(store, categories, products, stock, promotions, buyGet, q, cat, heading, now, await BuildBillAsync(store), shift));
    }

    /// <summary>Quản trị đứng quầy thì phải chọn đang bán cho cửa hàng nào.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult PickStore(string storeId)
    {
        if (Staff.IsAdmin) SetScope(storeId);
        bill.Clear();
        Held.ClearAll();
        return RedirectToAction(nameof(Index));
    }

    /// <summary>Máy quét gõ mã vạch rồi Enter: trùng đúng một mã vạch hoặc SKU thì cho vào hoá đơn luôn.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Scan(string? q)
    {
        var term = q?.Trim() ?? "";
        if (term.Length == 0) return RedirectToAction(nameof(Index));
        var product = await Db.Products.FirstOrDefaultAsync(p => p.Barcode == term || p.Sku == term);
        if (product is null)
        {
            if (Barcode().IsMatch(term))
            {
                Error($"Không tìm thấy sản phẩm có mã vạch {term}");
                return RedirectToAction(nameof(Index));
            }
            return RedirectToAction(nameof(Index), new { q = term });
        }
        var store = await CurrentStoreAsync();
        if (store is null) return RedirectToAction(nameof(Index));
        if (await AddErrorAsync(store, product, 1) is string error) Error(error);
        else
        {
            bill.Add(product.Id, 1);
            Toast($"Đã thêm {product.Name}");
        }
        return RedirectToAction(nameof(Index));
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Add(string productId)
    {
        var store = await CurrentStoreAsync();
        var product = await Db.Products.FindAsync(productId);
        if (store is null || product is null) return await BillResultAsync("Không tìm thấy sản phẩm", true);
        if (await AddErrorAsync(store, product, 1) is string error) return await BillResultAsync(error, true);
        bill.Add(productId, 1);
        return await BillResultAsync();
    }

    /// <summary>Đổi số lượng một dòng; vượt tồn thì báo và chỉnh về đúng số cửa hàng còn.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Set(string productId, int quantity)
    {
        var store = await CurrentStoreAsync();
        var product = await Db.Products.FindAsync(productId);
        if (store is null || product is null) return await BillResultAsync();
        if (quantity > 0)
        {
            var stock = await StockAsync(store.Id, productId);
            if (quantity > stock)
            {
                if (stock >= 1) bill.Set(productId, stock);
                return await BillResultAsync(StockMessage(product, stock), true);
            }
        }
        bill.Set(productId, quantity);
        return await BillResultAsync();
    }

    [HttpPost, ValidateAntiForgeryToken]
    public Task<IActionResult> Clear()
    {
        bill.Clear();
        return BillResultAsync("Đã huỷ hoá đơn");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public Task<IActionResult> Code(string? code)
    {
        bill.SetCode(code);
        return BillResultAsync();
    }

    // ------------------------------------------------------------------ bill đang giữ

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Hold()
    {
        var store = await CurrentStoreAsync();
        if (store is null) return RedirectToAction(nameof(Index));
        if (bill.Lines().Count == 0) return await BillResultAsync("Hoá đơn đang trống, chưa có gì để tạm giữ", true);
        if (Held.IsFull) return await BillResultAsync("Đã giữ tối đa 10 bill, hãy thanh toán hoặc xoá bớt bill đang giữ", true);
        var total = (await BuildBillAsync(store)).Pricing.Total;
        Held.Hold(DateTime.Now);
        return await BillResultAsync($"Đã tạm giữ bill {Money.Format(total)}");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Restore(string id)
    {
        var index = HeldIndex(id);
        return Held.Restore(id, DateTime.Now) is null
            ? await BillResultAsync("Bill này không còn trong danh sách giữ", true)
            : await BillResultAsync($"Đã mở lại bill #{index}");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> DiscardHeld(string id)
    {
        var index = HeldIndex(id);
        return Held.Discard(id)
            ? await BillResultAsync($"Đã xoá bill đang giữ #{index}")
            : await BillResultAsync();
    }

    /// <summary>Số thứ tự hiển thị của bill giữ: bill giữ sớm nhất là #1.</summary>
    private int HeldIndex(string id)
    {
        var held = Held.All();
        var i = held.FindIndex(h => h.Id == id);
        return i < 0 ? 0 : held.Count - i;
    }

    // ------------------------------------------------------------------ thành viên, mã giảm giá

    /// <summary>Khách đọc số điện thoại thành viên để tích sao và dùng ưu đãi hạng.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Member(string? phone)
    {
        var normalized = Phone.Normalize(phone);
        if (!Phone.IsValid(normalized)) return await BillResultAsync(Phone.Rule, true);
        var customer = await Db.Customers.FirstOrDefaultAsync(c => c.Phone == normalized);
        if (customer is null) return await BillResultAsync($"Chưa có thành viên với số {normalized}. Đăng ký nhanh ngay bên dưới.", true, normalized);
        bill.SetCustomer(customer.Id);
        return await BillResultAsync($"Thành viên {customer.FullName} · hạng {MembershipService.Info(customer.Tier).Label}");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public Task<IActionResult> RemoveMember()
    {
        bill.SetCustomer(null);
        bill.SetCode(null);
        return BillResultAsync();
    }

    /// <summary>Đăng ký thành viên tại quầy: chỉ cần tên và số điện thoại, mật khẩu khách tự đặt sau.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Register(string? fullName, string? phone)
    {
        var normalized = Phone.Normalize(phone);
        if (string.IsNullOrWhiteSpace(fullName) || fullName.Trim().Length < 2)
            return await BillResultAsync("Nhập họ tên khách", true, normalized);
        if (fullName.Trim().Length > 60) return await BillResultAsync("Họ tên tối đa 60 ký tự", true, normalized);
        if (!Phone.IsValid(normalized)) return await BillResultAsync(Phone.Rule, true, normalized);
        if (await Db.Customers.AnyAsync(c => c.Phone == normalized))
            return await BillResultAsync("Số điện thoại này đã là thành viên", true, normalized);

        var now = DateTime.Now;
        var customer = new Customer
        {
            Id = $"cu-{Guid.NewGuid():N}"[..11],
            FullName = fullName.Trim(),
            Phone = normalized,
            TierSince = now,
            ReviewedMonth = MembershipService.MonthKey(now.AddMonths(-1)),
            JoinedAt = now,
        };
        Db.Customers.Add(customer);
        await Db.SaveChangesAsync();
        bill.SetCustomer(customer.Id);
        return await BillResultAsync($"Đã đăng ký thành viên hạng Đồng cho {customer.FullName}");
    }

    // ------------------------------------------------------------------ thanh toán

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Checkout(PaymentMethod paymentMethod, string? cashReceived, bool ageConfirmed)
    {
        var store = await CurrentStoreAsync();
        if (store is null) return RedirectToAction(nameof(Index));
        if (store.Status != StoreStatus.Active)
            return await BillResultAsync($"Cửa hàng {store.Code} đang {Labels.Store(store.Status).ToLowerInvariant()}, không thể bán hàng", true);
        var model = await BuildBillAsync(store);
        if (model.Pricing.Lines.Count == 0) return await BillResultAsync("Hoá đơn đang trống", true);
        if (model.Pricing.CodeError is string codeError) return await BillResultAsync(codeError, true);
        foreach (var line in model.Pricing.Lines)
        {
            var left = model.Stock.GetValueOrDefault(line.Product.Id);
            if (line.Quantity > left) return await BillResultAsync($"Cửa hàng không đủ tồn kho: {line.Product.Name} (còn {left})", true);
        }
        if (paymentMethod == PaymentMethod.Cod) paymentMethod = PaymentMethod.Cash;

        int? cash = null;
        if (paymentMethod == PaymentMethod.Cash)
        {
            cash = int.TryParse(new string((cashReceived ?? "").Where(char.IsDigit).ToArray()), out var c) ? c : 0;
            if (cash < model.Pricing.Total) return await BillResultAsync("Tiền khách đưa chưa đủ", true);
        }
        if (model.NeedsAgeCheck && !ageConfirmed) return await BillResultAsync("Cần xác nhận đã kiểm tra tuổi của khách", true);

        var result = await orders.PlaceAsync(new PlaceOrderInput(
            SalesChannel.InStore, store.Id, bill.Lines(), paymentMethod, bill.CustomerId(), bill.Code(), null, Staff.Id, cash));
        if (!result.Ok) return await BillResultAsync(result.Error, true);
        bill.Clear();
        return RedirectToAction(nameof(Receipt), new { id = result.Order!.Code });
    }

    /// <summary>Hoá đơn in cho khách.</summary>
    public async Task<IActionResult> Receipt(string id)
    {
        var order = await Db.Orders
            .Include(o => o.Items)
            .Include(o => o.Store)
            .Include(o => o.Customer)
            .FirstOrDefaultAsync(o => o.Code == id);
        if (order is null || !CanTouch(order.StoreId)) return NotFound();
        ViewBag.Cashier = order.EmployeeId is null ? null : (await Db.Employees.FindAsync(order.EmployeeId))?.FullName;
        ViewData["Title"] = $"Hoá đơn {order.Code}";
        return View(order);
    }

    // ------------------------------------------------------------------ ca làm ở quầy

    /// <summary>Vào ca theo giờ hiện tại: dùng ca đã xếp lịch, chưa có lịch thì tạo ca mới.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> ShiftIn(string? openingCash)
    {
        var store = await CurrentStoreAsync();
        var employee = await Db.Employees.FindAsync(Staff.Id);
        if (store is null || employee is null) return RedirectToAction(nameof(Index));
        var result = await shifts.PosCheckInAsync(employee, store, Text.ParseInt(openingCash), DateTime.Now);
        if (result.Ok) Toast($"Đã vào {ShiftService.Label(result.Shift!.Type).ToLowerInvariant()} · tiền đầu ca {Money.Format(result.Shift.OpeningCash ?? 0)}");
        else Error(result.Error!);
        return RedirectToAction(nameof(Index));
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> ShiftOut(string? closingCash, string? note)
    {
        var store = await CurrentStoreAsync();
        if (store is null) return RedirectToAction(nameof(Index));
        var current = await shifts.CurrentAsync(Staff.Id, store.Id);
        if (current is null)
        {
            Error("Bạn chưa vào ca");
            return RedirectToAction(nameof(Index));
        }
        var result = await shifts.CheckOutAsync(current.Id, Text.ParseInt(closingCash), note, requireNoteWhenOff: false, DateTime.Now);
        if (result.Ok) Toast($"Đã kết {ShiftService.Label(current.Type).ToLowerInvariant()}");
        else Error(result.Error!);
        return RedirectToAction(nameof(Index));
    }

    // ------------------------------------------------------------------ dùng chung

    [GeneratedRegex(@"^\d{8,14}$")]
    private static partial Regex Barcode();

    private async Task<Store?> CurrentStoreAsync()
    {
        var id = ScopeStoreId;
        return id is null ? null : await Db.Stores.FindAsync(id);
    }

    private async Task<int> StockAsync(string storeId, string productId) =>
        await Db.StockLevels.Where(s => s.StoreId == storeId && s.ProductId == productId).Select(s => s.Quantity).FirstOrDefaultAsync();

    private static string StockMessage(Product product, int stock) =>
        stock <= 0 ? $"{product.Name} đã hết hàng tại cửa hàng" : $"Cửa hàng chỉ còn {stock} {product.Unit} {product.Name}";

    /// <summary>Lý do không cho thêm sản phẩm vào hoá đơn: ngừng kinh doanh hoặc cửa hàng không còn đủ hàng.</summary>
    private async Task<string?> AddErrorAsync(Store store, Product product, int quantity)
    {
        if (!product.IsActive) return $"{product.Name} đã ngừng kinh doanh";
        var inBill = bill.Lines().FirstOrDefault(l => l.ProductId == product.Id)?.Quantity ?? 0;
        var stock = await StockAsync(store.Id, product.Id);
        return inBill + quantity > stock ? StockMessage(product, stock) : null;
    }

    private async Task<PosShift?> ShiftAsync(Store store, DateTime now)
    {
        var current = await shifts.CurrentAsync(Staff.Id, store.Id);
        if (current is not null) return new PosShift(current, await shifts.PosSummaryAsync(current), null);
        var (date, type) = ShiftService.SlotAt(now);
        var scheduled = await Db.Shifts.AnyAsync(s => s.EmployeeId == Staff.Id && s.StoreId == store.Id && s.Date == date && s.Type == type && s.Status == ShiftStatus.Scheduled);
        return new PosShift(null, null, new PosSlot(date, type, scheduled));
    }

    private async Task<IActionResult> BillResultAsync(string? message = null, bool error = false, string? phone = null)
    {
        var store = await CurrentStoreAsync();
        if (store is null) return RedirectToAction(nameof(Index));
        if (IsFetch) return PartialView("_Bill", await BuildBillAsync(store, message, error, phone));
        if (message is not null)
        {
            if (error) Error(message);
            else Toast(message);
        }
        return RedirectToAction(nameof(Index));
    }

    private async Task<BillModel> BuildBillAsync(Store store, string? message = null, bool error = false, string? phone = null)
    {
        var now = DateTime.Now;
        var lines = bill.Lines();
        var held = Held.All();
        var ids = lines.Select(l => l.ProductId).Concat(held.SelectMany(h => h.Lines.Select(l => l.ProductId))).Distinct().ToList();
        var products = await Db.Products.Include(p => p.Category).Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var stock = await Db.StockLevels.Where(s => s.StoreId == store.Id && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId, s => s.Quantity);
        var promotions = await Db.Promotions.ToListAsync();
        var customerIds = held.Select(h => h.CustomerId).Append(bill.CustomerId()).OfType<string>().Distinct().ToList();
        var customers = await Db.Customers.Where(c => customerIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id);
        var customer = bill.CustomerId() is string cid ? customers.GetValueOrDefault(cid) : null;
        var pricing = PricingService.PriceCart(lines, products, promotions, SalesChannel.InStore, customer, bill.Code(), delivery: false, now);
        var needsAge = pricing.Lines.Any(l => l.Product.AgeRestricted || l.Product.Category?.AgeRestricted == true);
        var heldRows = held.Select((h, i) =>
        {
            var c = h.CustomerId is string id ? customers.GetValueOrDefault(id) : null;
            var priced = PricingService.PriceCart(h.Lines, products, promotions, SalesChannel.InStore, c, h.Code, delivery: false, now);
            return new HeldRow(h, held.Count - i, priced.Total, priced.ItemCount, c?.FullName, priced.Lines.Select(l => l.Product.Name).ToList());
        }).ToList();
        return new BillModel(store, pricing, customer, bill.Code(), stock, needsAge, message, error, phone, heldRows);
    }
}

public record PosSlot(DateTime Date, ShiftType Type, bool Scheduled);

/// <summary>Ca của người đang đứng quầy: đang trong ca (kèm số liệu két) hoặc ô ca theo giờ hiện tại để vào ca.</summary>
public record PosShift(Shift? Current, PosShiftSummary? Summary, PosSlot? Slot);

public record HeldRow(HeldBill Bill, int Number, int Total, int ItemCount, string? CustomerName, List<string> Names);

public record PosModel(
    Store Store, List<Category> Categories, List<Product> Products, Dictionary<string, StockLevel> Stock,
    List<Promotion> Promotions, Dictionary<string, Promotion?> BuyGet, string? Query, string? Category, string Heading,
    DateTime Now, BillModel Bill, PosShift? Shift);

public record BillModel(
    Store Store, PricingResult Pricing, Customer? Customer, string? Code, Dictionary<string, int> Stock,
    bool NeedsAgeCheck, string? Message, bool IsError, string? Phone, List<HeldRow> Held)
{
    public bool CanSell => Store.Status == StoreStatus.Active;

    /// <summary>Nội dung chuyển khoản: 7E + số trong mã cửa hàng + 4 số cuối tổng tiền + số món.</summary>
    public string TransferRef =>
        $"7E{new string(Store.Id.Where(char.IsDigit).ToArray())}{Pricing.Total.ToString()[^Math.Min(4, Pricing.Total.ToString().Length)..]}{Pricing.ItemCount}";

    /// <summary>Mệnh giá khách hay đưa: đúng số tiền, rồi làm tròn lên các tờ tiền phổ biến.</summary>
    public List<int> QuickCash()
    {
        var total = Pricing.Total;
        if (total <= 0) return [];
        int[] steps = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000];
        return steps.Select(s => (total + s - 1) / s * s).Where(v => v > total).Distinct().Take(4).ToList();
    }
}
