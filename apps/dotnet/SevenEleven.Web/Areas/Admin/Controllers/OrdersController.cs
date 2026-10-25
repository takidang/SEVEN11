using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Xử lý đơn: bảng đơn online đang chạy theo từng bước, danh sách mọi đơn có bộ lọc, chi tiết
/// một đơn. Nút chuyển bước và huỷ đều đi qua OrderService để kho, sao và hạng luôn khớp.
/// </summary>
public class OrdersController(AppDbContext db, OrderService orders, ReturnService returns) : AdminController(db)
{
    private const int PageSize = 20;

    public static readonly OrderStatus[] BoardLanes =
        [OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Preparing, OrderStatus.Delivering];

    public async Task<IActionResult> Index(string? view, string? tab, SalesChannel? channel, string? period, string? q, int page = 1)
    {
        var scope = ScopeStoreId;
        var now = DateTime.Now;
        var scoped = Db.Orders.AsNoTracking();
        if (scope is not null) scoped = scoped.Where(o => o.StoreId == scope);
        ViewData["Title"] = "Đơn hàng";

        if (view != "list")
        {
            var running = await scoped
                .Include(o => o.Items).Include(o => o.Customer).Include(o => o.Delivery).Include(o => o.Store)
                .Where(o => o.Channel == SalesChannel.Online && BoardLanes.Contains(o.Status))
                .OrderBy(o => o.CreatedAt)
                .AsSplitQuery()
                .ToListAsync();
            var doneToday = await scoped.CountAsync(o => o.Channel == SalesChannel.Online && o.Status == OrderStatus.Completed && o.UpdatedAt >= now.Date);
            return View("Board", new BoardModel(running, doneToday, now, scope is null));
        }

        period = ListPeriods.Any(x => x.Key == period) ? period! : "hom-nay";
        var since = period switch
        {
            "7-ngay" => now.Date.AddDays(-6),
            "30-ngay" => now.Date.AddDays(-29),
            "tat-ca" => (DateTime?)null,
            _ => now.Date,
        };
        // Đơn chưa xong (chờ xác nhận → đang giao) luôn hiện, dù đặt từ hôm nào.
        var query = scoped.Where(o => since == null || o.CreatedAt >= since || BoardLanes.Contains(o.Status));
        if (channel is SalesChannel c) query = query.Where(o => o.Channel == c);
        var rows = await query.Select(o => new OrderRow(o.Id, o.Code, o.Status, o.CreatedAt, o.Total,
                o.Customer != null ? o.Customer.FullName : null, o.Customer != null ? o.Customer.Phone : null,
                o.Delivery != null ? o.Delivery.Recipient : null, o.Delivery != null ? o.Delivery.Phone : null))
            .ToListAsync();
        if (!string.IsNullOrWhiteSpace(q)) rows = rows.Where(r => r.Matches(q)).ToList();
        var counts = rows.GroupBy(r => r.Status).ToDictionary(g => g.Key, g => g.Count());
        var statusTab = StatusTabs.FirstOrDefault(t => t.Key == tab);
        if (statusTab.Statuses is { } statuses) rows = rows.Where(r => statuses.Contains(r.Status)).ToList();

        // Đơn chờ xác nhận lên đầu, chờ lâu nhất trước; còn lại mới nhất trước.
        rows = rows.OrderBy(r => r.Status == OrderStatus.Pending ? 0 : 1)
            .ThenBy(r => r.Status == OrderStatus.Pending ? r.CreatedAt.Ticks : -r.CreatedAt.Ticks).ToList();
        var total = rows.Count;
        var revenue = rows.Where(r => r.Status != OrderStatus.Cancelled).Sum(r => (long)r.Total);
        var pages = Math.Max(1, (int)Math.Ceiling(total / (double)PageSize));
        page = Math.Clamp(page, 1, pages);
        var ids = rows.Skip((page - 1) * PageSize).Take(PageSize).Select(r => r.Id).ToList();
        var loaded = await Db.Orders.AsNoTracking().Include(o => o.Customer).Include(o => o.Store).Include(o => o.Delivery)
            .Where(o => ids.Contains(o.Id)).ToDictionaryAsync(o => o.Id);
        var list = ids.Select(id => loaded[id]).ToList();
        return View("List", new OrderListModel(list, counts, total, revenue, page, pages, statusTab.Key ?? "all", channel, period, q, now, scope is null));
    }

    public static readonly (string Key, string Label, OrderStatus[]? Statuses)[] StatusTabs =
    [
        ("all", "Tất cả", null),
        ("pending", "Chờ xác nhận", [OrderStatus.Pending]),
        ("processing", "Đang xử lý", [OrderStatus.Confirmed, OrderStatus.Preparing]),
        ("delivering", "Đang giao", [OrderStatus.Delivering]),
        ("completed", "Hoàn thành", [OrderStatus.Completed]),
        ("cancelled", "Đã huỷ", [OrderStatus.Cancelled]),
    ];

    public static readonly (string Key, string Label)[] ListPeriods =
        [("hom-nay", "Hôm nay"), ("7-ngay", "7 ngày qua"), ("30-ngay", "30 ngày qua"), ("tat-ca", "Tất cả thời gian")];

    /// <summary>Đơn online chờ xác nhận của phạm vi đang xem, để mọi trang quản lý báo khi có đơn mới.</summary>
    public async Task<IActionResult> Feed()
    {
        var scope = ScopeStoreId;
        var pending = await Db.Orders.AsNoTracking()
            .Where(o => o.Channel == SalesChannel.Online && o.Status == OrderStatus.Pending && (scope == null || o.StoreId == scope))
            .OrderByDescending(o => o.CreatedAt).Select(o => o.Code).ToListAsync();
        return Json(new { count = pending.Count, codes = pending.Take(20) });
    }

    public async Task<IActionResult> Detail(string id)
    {
        var order = await Db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Timeline)
            .Include(o => o.Delivery)
            .Include(o => o.Store)
            .Include(o => o.Customer)
            .Include(o => o.Returns).ThenInclude(r => r.Items)
            .AsSplitQuery()
            .FirstOrDefaultAsync(o => o.Code == id);
        if (order is null || !CanTouch(order.StoreId))
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            ViewData["Title"] = "Không tìm thấy đơn hàng";
            return View("NotFound", id);
        }
        ViewBag.Employee = order.EmployeeId is null ? null : await Db.Employees.FindAsync(order.EmployeeId);
        ViewData["Title"] = $"Đơn {order.Code}";
        return View(order);
    }

    /// <summary>Đẩy đơn sang bước kế tiếp.</summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Advance(string id, OrderStatus to, string? returnUrl)
    {
        var order = await Db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id);
        if (order is null || !CanTouch(order.StoreId)) return NotFound();
        var result = await orders.ChangeStatusAsync(id, to, Staff.Name, null);
        if (result.Ok) Toast($"Đơn {order.Code}: {Labels.Status(to).ToLower()}");
        else Error(result.Error);
        return Back(returnUrl, "/Admin/Orders");
    }

    /// <summary>
    /// Trả hàng cho đơn đã hoàn thành: số trả mỗi dòng gửi lên dạng qty[mã dòng], cách xử lý dạng how[mã dòng]
    /// (nhập lại kho / xuất huỷ).
    /// </summary>
    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Return(string id, Dictionary<int, string>? qty, Dictionary<int, ReturnDisposition>? how, string? reason, string? note)
    {
        var order = await Db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id);
        if (order is null || !CanTouch(order.StoreId)) return NotFound();
        var lines = new List<ReturnLine>();
        foreach (var (itemId, value) in qty ?? [])
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (Text.ParseInt(value) is not int n) { Error("Số lượng trả chỉ nhập số nguyên"); return RedirectToAction(nameof(Detail), new { id = order.Code }); }
            lines.Add(new ReturnLine(itemId, n, how?.GetValueOrDefault(itemId) ?? ReturnDisposition.Restock));
        }
        var result = await returns.CreateAsync(id, lines, reason, note, Staff.Name, DateTime.Now);
        if (result.Ok)
        {
            var r = result.Return!;
            Toast($"Đã tạo phiếu trả {r.Code}: {r.Items.Sum(i => i.Quantity)} sản phẩm, hoàn {Money.Format(r.Refund)}"
                  + (r.StarsTaken > 0 || r.SpendTaken > 0 ? $" · trừ {r.StarsTaken} sao, {Money.Format(r.SpendTaken)} chi tiêu xét hạng" : ""));
        }
        else Error(result.Error);
        return Redirect($"/Admin/Orders/Detail/{order.Code}#tra-hang");
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Cancel(string id, string? reason, string? returnUrl)
    {
        var order = await Db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id);
        if (order is null || !CanTouch(order.StoreId)) return NotFound();
        var note = string.IsNullOrWhiteSpace(reason) ? "Cửa hàng huỷ" : reason.Trim();
        var result = await orders.ChangeStatusAsync(id, OrderStatus.Cancelled, Staff.Name, note);
        if (result.Ok) Toast($"Đã huỷ đơn {order.Code}, hàng đã trả về kho");
        else Error(result.Error);
        return Back(returnUrl, "/Admin/Orders");
    }
}

public record BoardModel(List<Order> Orders, int CompletedToday, DateTime Now, bool IsChain);

public record OrderListModel(
    List<Order> Orders, Dictionary<OrderStatus, int> Counts, int Total, long Revenue, int Page, int Pages,
    string Tab, SalesChannel? Channel, string Period, string? Query, DateTime Now, bool IsChain)
{
    public bool Filtered => Channel is not null || Period != "hom-nay" || !string.IsNullOrWhiteSpace(Query);

    public int CountOf(OrderStatus[]? statuses) => statuses is null ? Counts.Values.Sum() : statuses.Sum(st => Counts.GetValueOrDefault(st));
}

/// <summary>Một dòng đơn đọc gọn để lọc và sắp xếp trong bộ nhớ (tìm tên không dấu).</summary>
public record OrderRow(string Id, string Code, OrderStatus Status, DateTime CreatedAt, int Total,
    string? CustomerName, string? CustomerPhone, string? Recipient, string? DeliveryPhone)
{
    /// <summary>Mã đơn chứa chuỗi tìm; tên thành viên hoặc người nhận (không phân biệt dấu); SĐT khi gõ từ 3 số.</summary>
    public bool Matches(string q)
    {
        var term = q.Trim();
        if (Code.Contains(term, StringComparison.OrdinalIgnoreCase)) return true;
        var folded = Text.Fold(term);
        if (folded.Length > 0 && (Text.Fold(CustomerName).Contains(folded) || Text.Fold(Recipient).Contains(folded))) return true;
        var digits = Text.Digits(term);
        return digits.Length >= 3 && ((CustomerPhone?.Contains(digits) ?? false) || (DeliveryPhone?.Contains(digits) ?? false));
    }
}
