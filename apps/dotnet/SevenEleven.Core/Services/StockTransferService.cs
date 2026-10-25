using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public record TransferResult(bool Ok, StockTransfer? Transfer, string? Error)
{
    public static TransferResult Fail(string error) => new(false, null, error);
}

/// <summary>
/// Chuyển kho giữa các cửa hàng. Gửi: trừ kho bên gửi ngay, hàng có hạn dùng lấy từ lô còn hạn, hết hạn
/// sớm nhất trước (hàng đã hết hạn không chuyển). Nhận: bên nhận xác nhận thì cộng kho và tạo lại lô với
/// đúng mã lô, hạn dùng. Huỷ khi hàng còn trên đường: hàng và lô về lại bên gửi. Mọi thay đổi tồn đều ghi
/// nhật ký kho. Quản trị thao tác mọi cửa hàng; quản lý chỉ gửi từ và nhận về cửa hàng của mình.
/// </summary>
public class StockTransferService(AppDbContext db)
{
    public const int MaxLines = 50;
    public const int MaxQuantity = 9_999;

    public static string Label(StockTransferStatus s) => s switch
    {
        StockTransferStatus.InTransit => "Đang chuyển",
        StockTransferStatus.Received => "Đã nhận",
        _ => "Đã huỷ",
    };

    public static string Tone(StockTransferStatus s) => s switch
    {
        StockTransferStatus.InTransit => "orange",
        StockTransferStatus.Received => "fresh",
        _ => "neutral",
    };

    private static bool Owns(Actor actor, string storeId) =>
        actor.Role == StaffRole.Admin || (actor.Role == StaffRole.Manager && actor.StoreId == storeId);

    /// <summary>Lập phiếu và gửi hàng đi: trừ kho, lấy lô, ghi nhật ký "Chuyển kho đi".</summary>
    public async Task<TransferResult> SendAsync(string fromStoreId, string toStoreId, IEnumerable<(string ProductId, int Quantity)> lines,
        string? note, Actor actor, string by, DateTime now)
    {
        if (!Owns(actor, fromStoreId)) return TransferResult.Fail("Bạn chỉ chuyển được hàng từ cửa hàng của mình");
        if (fromStoreId == toStoreId) return TransferResult.Fail("Chọn cửa hàng nhận khác cửa hàng gửi");
        var from = await db.Stores.FindAsync(fromStoreId);
        var to = await db.Stores.FindAsync(toStoreId);
        if (from is null || from.Status == StoreStatus.Closed) return TransferResult.Fail("Cửa hàng gửi không hoạt động");
        if (to is null || to.Status == StoreStatus.Closed) return TransferResult.Fail("Chọn cửa hàng nhận đang hoạt động");
        var text = note?.Trim();
        if (text?.Length > 200) return TransferResult.Fail("Ghi chú tối đa 200 ký tự");

        // Gộp các dòng trùng mặt hàng, bỏ dòng số lượng 0.
        var wanted = lines.Where(l => l.Quantity != 0).GroupBy(l => l.ProductId).Select(g => (ProductId: g.Key, Quantity: g.Sum(x => x.Quantity))).ToList();
        if (wanted.Count == 0) return TransferResult.Fail("Nhập số lượng cho ít nhất một mặt hàng");
        if (wanted.Count > MaxLines) return TransferResult.Fail($"Mỗi phiếu tối đa {MaxLines} mặt hàng");
        if (wanted.Any(w => w.Quantity < 0 || w.Quantity > MaxQuantity)) return TransferResult.Fail($"Số lượng mỗi mặt hàng từ 1 đến {MaxQuantity}");

        // Khoá trước khi đọc tồn: hai người cùng chuyển (hoặc vừa bán vừa chuyển) không làm âm kho.
        await using var tx = await db.Database.BeginTransactionAsync();
        var ids = wanted.Select(w => w.ProductId).ToList();
        var products = await db.Products.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var levels = await db.StockLevels.Where(s => s.StoreId == fromStoreId && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        var lots = (await db.InventoryBatches.Where(b => b.StoreId == fromStoreId && ids.Contains(b.ProductId) && b.Quantity > 0).ToListAsync())
            .Where(b => b.ExpiresAt is null || b.ExpiresAt > now).OrderBy(b => b.ExpiresAt).ThenBy(b => b.Id).ToList();

        foreach (var (productId, quantity) in wanted)
        {
            if (!products.TryGetValue(productId, out var product)) return TransferResult.Fail("Có mặt hàng không còn tồn tại");
            var have = levels.GetValueOrDefault(productId)?.Quantity ?? 0;
            if (quantity > have) return TransferResult.Fail($"{product.Name}: cửa hàng gửi chỉ còn {have}");
            if (product.ShelfLifeDays is not null)
            {
                var fresh = lots.Where(b => b.ProductId == productId).Sum(b => b.Quantity);
                if (quantity > fresh) return TransferResult.Fail($"{product.Name}: chỉ còn {fresh} sản phẩm còn hạn dùng (theo lô) để chuyển");
            }
        }

        var transfer = new StockTransfer
        {
            Id = $"ck-{Guid.NewGuid():N}"[..11],
            Code = await NextCodeAsync(),
            FromStoreId = fromStoreId,
            ToStoreId = toStoreId,
            Status = StockTransferStatus.InTransit,
            Note = string.IsNullOrEmpty(text) ? null : text,
            CreatedBy = by,
            CreatedAt = now,
        };
        foreach (var (productId, quantity) in wanted)
        {
            var product = products[productId];
            var level = levels[productId];
            level.Quantity -= quantity;
            var item = new StockTransferItem { ProductId = productId, Quantity = quantity };
            if (product.ShelfLifeDays is not null)
            {
                var left = quantity;
                foreach (var lot in lots.Where(b => b.ProductId == productId))
                {
                    if (left == 0) break;
                    var take = Math.Min(lot.Quantity, left);
                    item.Lots.Add(new StockTransferLot { LotCode = lot.LotCode, ReceivedAt = lot.ReceivedAt, ExpiresAt = lot.ExpiresAt, Quantity = take });
                    lot.Quantity -= take;
                    left -= take;
                    if (lot.Quantity == 0) db.InventoryBatches.Remove(lot);
                }
            }
            transfer.Items.Add(item);
            db.StockMovements.Add(new StockMovement
            {
                StoreId = fromStoreId, ProductId = productId, At = now, Delta = -quantity, QuantityAfter = level.Quantity,
                Kind = StockMovementKind.TransferOut, Ref = transfer.Code, By = by, Note = $"Chuyển tới cửa hàng {to.Code} – {to.Name}",
            });
        }
        db.StockTransfers.Add(transfer);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new TransferResult(true, transfer, null);
    }

    /// <summary>Cửa hàng nhận xác nhận đã nhận đủ: cộng kho, tạo lại lô giữ nguyên mã lô và hạn dùng.</summary>
    public async Task<TransferResult> ReceiveAsync(string transferId, Actor actor, string by, DateTime now)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var transfer = await LoadAsync(transferId);
        if (transfer is null) return TransferResult.Fail("Không tìm thấy phiếu chuyển kho");
        if (!Owns(actor, transfer.ToStoreId)) return TransferResult.Fail("Chỉ cửa hàng nhận mới xác nhận được đã nhận hàng");
        if (transfer.Status != StockTransferStatus.InTransit) return TransferResult.Fail("Phiếu này không còn chờ nhận hàng");
        var from = await db.Stores.FindAsync(transfer.FromStoreId);
        await PutBackAsync(transfer, transfer.ToStoreId, now, by, StockMovementKind.TransferIn, $"Nhận từ cửa hàng {from?.Code} – {from?.Name}");
        transfer.Status = StockTransferStatus.Received;
        transfer.ReceivedBy = by;
        transfer.ReceivedAt = now;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new TransferResult(true, transfer, null);
    }

    /// <summary>Bên gửi huỷ khi hàng chưa tới: hàng và lô về lại kho bên gửi.</summary>
    public async Task<TransferResult> CancelAsync(string transferId, Actor actor, string by, DateTime now)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var transfer = await LoadAsync(transferId);
        if (transfer is null) return TransferResult.Fail("Không tìm thấy phiếu chuyển kho");
        if (!Owns(actor, transfer.FromStoreId)) return TransferResult.Fail("Chỉ cửa hàng gửi mới huỷ được phiếu");
        if (transfer.Status != StockTransferStatus.InTransit) return TransferResult.Fail("Phiếu đã nhận hoặc đã huỷ thì không huỷ được nữa");
        await PutBackAsync(transfer, transfer.FromStoreId, now, by, StockMovementKind.TransferIn, "Huỷ phiếu chuyển kho, hàng về lại kho");
        transfer.Status = StockTransferStatus.Cancelled;
        transfer.CancelledBy = by;
        transfer.CancelledAt = now;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new TransferResult(true, transfer, null);
    }

    /// <summary>Cộng hàng của phiếu vào kho một cửa hàng và tạo lại các lô đã mang theo.</summary>
    private async Task PutBackAsync(StockTransfer transfer, string storeId, DateTime now, string by, StockMovementKind kind, string note)
    {
        var ids = transfer.Items.Select(i => i.ProductId).ToList();
        var levels = await db.StockLevels.Where(s => s.StoreId == storeId && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        foreach (var item in transfer.Items)
        {
            if (!levels.TryGetValue(item.ProductId, out var level))
            {
                level = new StockLevel { StoreId = storeId, ProductId = item.ProductId, MinQuantity = InventoryService.DefaultMinQuantity };
                db.StockLevels.Add(level);
                levels[item.ProductId] = level;
            }
            level.Quantity += item.Quantity;
            foreach (var lot in item.Lots)
            {
                db.InventoryBatches.Add(new InventoryBatch
                {
                    StoreId = storeId, ProductId = item.ProductId, LotCode = lot.LotCode, Quantity = lot.Quantity,
                    ReceivedAt = lot.ReceivedAt, ExpiresAt = lot.ExpiresAt,
                });
            }
            db.StockMovements.Add(new StockMovement
            {
                StoreId = storeId, ProductId = item.ProductId, At = now, Delta = item.Quantity, QuantityAfter = level.Quantity,
                Kind = kind, Ref = transfer.Code, By = by, Note = note,
            });
        }
    }

    private Task<StockTransfer?> LoadAsync(string id) =>
        db.StockTransfers.Include(t => t.Items).ThenInclude(i => i.Lots).AsSplitQuery().FirstOrDefaultAsync(t => t.Id == id);

    /// <summary>Mã phiếu CK + 5 chữ số, nối tiếp số lớn nhất đang có.</summary>
    private async Task<string> NextCodeAsync()
    {
        var last = await db.StockTransfers.MaxAsync(t => (string?)t.Code);
        var seq = last is null ? 0 : int.Parse(last[2..]);
        return $"CK{seq + 1:00000}";
    }
}
