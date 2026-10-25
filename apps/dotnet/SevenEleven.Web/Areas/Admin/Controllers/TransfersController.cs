using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Areas.Admin.Controllers;

/// <summary>
/// Chuyển kho giữa các cửa hàng: lập phiếu (kho bên gửi trừ ngay), cửa hàng nhận xác nhận (kho bên nhận
/// cộng), huỷ khi hàng còn trên đường. Quản lý gửi từ và nhận về cửa hàng của mình; quản trị chọn cửa hàng
/// ở thanh đầu trang.
/// </summary>
public class TransfersController(AppDbContext db, StockTransferService transfers) : AdminController(db)
{
    public static readonly (string Key, string Label)[] Tabs = [("cho-nhan", "Chờ nhận"), ("da-gui", "Đã gửi đi"), ("tat-ca", "Tất cả")];

    private Actor Actor => new(Staff.Id, Staff.Role, Staff.StoreId);

    public async Task<IActionResult> Index(string? tab)
    {
        var scope = ScopeStoreId;
        tab = Tabs.Any(t => t.Key == tab) ? tab! : "cho-nhan";
        var query = Db.StockTransfers.AsNoTracking().Include(t => t.FromStore).Include(t => t.ToStore).Include(t => t.Items).AsQueryable();
        if (scope is not null) query = query.Where(t => t.FromStoreId == scope || t.ToStoreId == scope);
        var incoming = query.Where(t => t.Status == StockTransferStatus.InTransit && (scope == null || t.ToStoreId == scope));
        var outgoing = scope is null ? query : query.Where(t => t.FromStoreId == scope);
        var counts = new Dictionary<string, int>
        {
            ["cho-nhan"] = await incoming.CountAsync(),
            ["da-gui"] = await outgoing.CountAsync(),
            ["tat-ca"] = await query.CountAsync(),
        };
        var shown = tab switch { "cho-nhan" => incoming, "da-gui" => outgoing, _ => query };
        var list = await shown.OrderByDescending(t => t.CreatedAt).Take(100).AsSplitQuery().ToListAsync();
        ViewData["Title"] = "Chuyển kho";
        return View(new TransferListModel(list, counts, tab, scope));
    }

    public async Task<IActionResult> New(string? q) => await NewViewAsync(q, null, null, new Dictionary<string, string>());

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(string? toStoreId, string? note, Dictionary<string, string>? qty, string? q)
    {
        if (ScopeStoreId is not string from) return RedirectToAction(nameof(New));
        var entered = qty ?? [];
        var lines = new List<(string, int)>();
        foreach (var (productId, value) in entered)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (Text.ParseInt(value) is not int n) return await NewViewAsync(q, toStoreId, note, entered, "Số lượng chỉ nhập số nguyên");
            lines.Add((productId, n));
        }
        var result = await transfers.SendAsync(from, toStoreId ?? "", lines, note, Actor, Staff.Name, DateTime.Now);
        if (!result.Ok) return await NewViewAsync(q, toStoreId, note, entered, result.Error);
        var t = result.Transfer!;
        var to = await Db.Stores.FindAsync(t.ToStoreId);
        Toast($"Đã gửi phiếu {t.Code}: {t.Items.Sum(i => i.Quantity)} sản phẩm tới cửa hàng {to?.Code} – {to?.Name}. Kho cửa hàng gửi đã trừ, chờ bên nhận xác nhận.");
        return RedirectToAction(nameof(Detail), new { id = t.Id });
    }

    public async Task<IActionResult> Detail(string id)
    {
        var t = await Db.StockTransfers.AsNoTracking().Include(x => x.FromStore).Include(x => x.ToStore)
            .Include(x => x.Items).ThenInclude(i => i.Product).Include(x => x.Items).ThenInclude(i => i.Lots)
            .AsSplitQuery().FirstOrDefaultAsync(x => x.Id == id);
        if (t is null || !(CanTouch(t.FromStoreId) || CanTouch(t.ToStoreId))) return NotFound();
        ViewData["Title"] = $"Phiếu chuyển {t.Code}";
        var open = t.Status == StockTransferStatus.InTransit;
        return View(new TransferDetailModel(t, open && CanTouch(t.ToStoreId), open && CanTouch(t.FromStoreId)));
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Receive(string id)
    {
        var result = await transfers.ReceiveAsync(id, Actor, Staff.Name, DateTime.Now);
        if (result.Ok) Toast($"Đã nhận phiếu {result.Transfer!.Code}: {result.Transfer.Items.Sum(i => i.Quantity)} sản phẩm đã cộng vào kho");
        else Error(result.Error);
        return RedirectToAction(nameof(Detail), new { id });
    }

    [HttpPost, ValidateAntiForgeryToken]
    public async Task<IActionResult> Cancel(string id)
    {
        var result = await transfers.CancelAsync(id, Actor, Staff.Name, DateTime.Now);
        if (result.Ok) Toast($"Đã huỷ phiếu {result.Transfer!.Code}, hàng đã về lại kho cửa hàng gửi");
        else Error(result.Error);
        return RedirectToAction(nameof(Detail), new { id });
    }

    /// <summary>Form lập phiếu: hàng đang có ở cửa hàng gửi (tìm theo tên / SKU), mỗi dòng một ô số lượng.</summary>
    private async Task<IActionResult> NewViewAsync(string? q, string? toStoreId, string? note, Dictionary<string, string> entered, string? error = null)
    {
        ViewData["Title"] = "Lập phiếu chuyển kho";
        var from = ScopeStoreId is string id ? await Db.Stores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id) : null;
        if (from is null) return View("New", new TransferFormModel(null, [], [], q, toStoreId, note, entered, error, DateTime.Now));

        var now = DateTime.Now;
        var levels = await Db.StockLevels.AsNoTracking().Include(s => s.Product)
            .Where(s => s.StoreId == from.Id && s.Quantity > 0 && s.Product!.IsActive).ToListAsync();
        var picked = entered.Where(e => !string.IsNullOrWhiteSpace(e.Value)).Select(e => e.Key).ToHashSet();
        var rows = levels
            .Where(s => picked.Contains(s.ProductId) || string.IsNullOrWhiteSpace(q) || Text.MatchesAllWords(s.Product!.Name, q)
                        || s.Product!.Sku.Equals(q.Trim(), StringComparison.OrdinalIgnoreCase) || s.Product.Barcode == q.Trim())
            .OrderByDescending(s => picked.Contains(s.ProductId)).ThenBy(s => s.Product!.Name)
            .Take(60).ToList();
        var ids = rows.Select(r => r.ProductId).ToList();
        var fresh = (await Db.InventoryBatches.AsNoTracking().Where(b => b.StoreId == from.Id && ids.Contains(b.ProductId) && b.Quantity > 0).ToListAsync())
            .Where(b => b.ExpiresAt is null || b.ExpiresAt > now)
            .GroupBy(b => b.ProductId).ToDictionary(g => g.Key, g => (Quantity: g.Sum(b => b.Quantity), Soonest: g.Min(b => b.ExpiresAt)));
        // Hàng không chuyển được (mọi lô đã hết hạn) xếp cuối để không lẫn với hàng chuyển được.
        var lines = rows.Select(s => new TransferStockRow(s.Product!, s.Quantity,
                s.Product!.ShelfLifeDays is null ? s.Quantity : fresh.GetValueOrDefault(s.ProductId).Quantity,
                fresh.TryGetValue(s.ProductId, out var f) ? f.Soonest : null))
            .OrderBy(r => r.Movable == 0).ToList();
        var stores = await Db.Stores.AsNoTracking().Where(s => s.Id != from.Id && s.Status != StoreStatus.Closed).OrderBy(s => s.Code).ToListAsync();
        return View("New", new TransferFormModel(from, stores, lines, q, toStoreId, note, entered, error, now));
    }
}

public record TransferListModel(List<StockTransfer> Transfers, Dictionary<string, int> Counts, string Tab, string? ScopeStoreId);

public record TransferDetailModel(StockTransfer Transfer, bool CanReceive, bool CanCancel);

/// <summary>Một mặt hàng có thể chuyển: tồn hiện có, số chuyển được (hàng có hạn dùng: chỉ phần còn hạn theo lô), hạn gần nhất.</summary>
public record TransferStockRow(Product Product, int OnHand, int Movable, DateTime? SoonestExpiry);

public record TransferFormModel(
    Store? From, List<Store> Stores, List<TransferStockRow> Rows, string? Query, string? ToStoreId, string? Note,
    Dictionary<string, string> Entered, string? Error, DateTime Now);
