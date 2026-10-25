using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Services;

public enum StockState { Ok, Low, Out }

public enum BatchState { Fresh, ExpiringToday, Expired }

public record StockResult(bool Ok, string? Error, int Before = 0, int After = 0)
{
    public static StockResult Fail(string error) => new(false, error);
}

/// <summary>Kết quả cân bằng kho sau một phiên kiểm kê.</summary>
public record StocktakeResult(int Counted, int Matched, int Over, int Short, int OverUnits, int ShortUnits, long ValueDifference);

/// <summary>
/// Tồn kho theo cửa hàng, lô hàng có hạn dùng, điều chỉnh có lý do, kiểm kê và nhật ký biến động kho.
/// Chuyển từ các action kho của stores/db.ts; khác bản Next.js ở chỗ lý do điều chỉnh được lưu lại.
/// </summary>
public class InventoryService(AppDbContext db)
{
    public const int DefaultMinQuantity = 6;
    public const int MaxMinQuantity = 9_999;

    /// <summary>Lý do điều chỉnh tồn, theo đúng danh sách của bản Next.js.</summary>
    public static readonly string[] AdjustReasons = ["Kiểm kê", "Hàng hỏng/vỡ", "Hàng hết hạn", "Khác"];

    /// <summary>Hết hàng khi còn 0; sắp hết khi bằng hoặc dưới mức tối thiểu (giống stockState bên Next.js).</summary>
    public static StockState StateOf(int quantity, int minQuantity) =>
        quantity <= 0 ? StockState.Out : quantity <= minQuantity ? StockState.Low : StockState.Ok;

    public static string Label(StockState s) => s switch
    {
        StockState.Out => "Hết hàng",
        StockState.Low => "Sắp hết",
        _ => "Còn hàng",
    };

    public static BatchState StateOf(InventoryBatch batch, DateTime now)
    {
        if (batch.ExpiresAt is not DateTime at) return BatchState.Fresh;
        if (at <= now) return BatchState.Expired;
        return at.Date == now.Date ? BatchState.ExpiringToday : BatchState.Fresh;
    }

    public static string KindLabel(StockMovementKind k) => k switch
    {
        StockMovementKind.Sale => "Bán hàng",
        StockMovementKind.CancelReturn => "Huỷ đơn, trả về kho",
        StockMovementKind.Receive => "Nhập hàng",
        StockMovementKind.Adjust => "Điều chỉnh",
        StockMovementKind.Stocktake => "Cân bằng kiểm kê",
        StockMovementKind.Discard => "Xuất huỷ",
        StockMovementKind.TransferOut => "Chuyển kho đi",
        _ => "Nhận chuyển kho",
    };

    private async Task<StockLevel> LevelAsync(string storeId, string productId)
    {
        var level = await db.StockLevels.FirstOrDefaultAsync(s => s.StoreId == storeId && s.ProductId == productId);
        if (level is null)
        {
            level = new StockLevel { StoreId = storeId, ProductId = productId, MinQuantity = DefaultMinQuantity };
            db.StockLevels.Add(level);
        }
        return level;
    }

    /// <summary>
    /// Điều chỉnh tồn về số đếm thực tế, kèm lý do. Lý do "Khác" phải ghi chú; số không đổi thì không làm gì.
    /// </summary>
    public async Task<StockResult> AdjustAsync(string storeId, string productId, int? quantity, string? reason, string? note, string? by)
    {
        if (quantity is null || quantity < 0) return StockResult.Fail("Nhập số lượng thực tế (số nguyên từ 0)");
        note = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        if (note?.Length > 200) return StockResult.Fail("Ghi chú tối đa 200 ký tự");
        reason = AdjustReasons.Contains(reason) ? reason : AdjustReasons[0];
        if (reason == "Khác" && note is null) return StockResult.Fail("Ghi rõ lý do điều chỉnh");
        if (!await db.Products.AnyAsync(p => p.Id == productId)) return StockResult.Fail("Không tìm thấy sản phẩm");

        // Đọc tồn trong cùng giao dịch với lúc ghi để dòng nhật ký (trước → sau) đúng cả khi quầy đang bán.
        await using var tx = await db.Database.BeginTransactionAsync();
        var level = await LevelAsync(storeId, productId);
        var before = level.Quantity;
        if (before == quantity) return StockResult.Fail("Số lượng không đổi, không cần điều chỉnh");
        level.Quantity = quantity.Value;
        await TrimBatchesAsync(storeId, productId, quantity.Value);
        db.StockMovements.Add(new StockMovement
        {
            StoreId = storeId, ProductId = productId, At = DateTime.Now, Delta = quantity.Value - before, QuantityAfter = quantity.Value,
            Kind = StockMovementKind.Adjust, Reason = reason, Note = note, By = by,
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new StockResult(true, null, before, quantity.Value);
    }

    /// <summary>
    /// Tồn giảm (đếm thiếu, hàng hỏng) thì các lô cũng phải giảm theo, để tổng các lô không bao giờ vượt tồn
    /// thực tế: trừ vào lô hết hạn sớm nhất trước, giống khi bán.
    /// </summary>
    private async Task TrimBatchesAsync(string storeId, string productId, int quantity)
    {
        var lots = await db.InventoryBatches
            .Where(b => b.StoreId == storeId && b.ProductId == productId && b.Quantity > 0)
            .OrderBy(b => b.ExpiresAt)
            .ToListAsync();
        var excess = lots.Sum(b => b.Quantity) - quantity;
        foreach (var lot in lots)
        {
            if (excess <= 0) break;
            var take = Math.Min(lot.Quantity, excess);
            lot.Quantity -= take;
            excess -= take;
            if (lot.Quantity == 0) db.InventoryBatches.Remove(lot);
        }
    }

    /// <summary>Đổi định mức tối thiểu: tồn bằng hoặc dưới mức này là "Sắp hết" và được gợi ý nhập hàng.</summary>
    public async Task<StockResult> SetMinAsync(string storeId, string productId, int? minQuantity)
    {
        if (minQuantity is null || minQuantity < 0) return StockResult.Fail("Nhập định mức (số nguyên từ 0)");
        if (minQuantity > MaxMinQuantity) return StockResult.Fail("Định mức tối đa 9.999");
        var level = await LevelAsync(storeId, productId);
        var before = level.MinQuantity;
        level.MinQuantity = minQuantity.Value;
        await db.SaveChangesAsync();
        return new StockResult(true, null, before, minQuantity.Value);
    }

    /// <summary>Xuất huỷ một lô (hết hạn, hư hỏng): bỏ lô và trừ đúng số đó khỏi tồn kho.</summary>
    public async Task<InventoryBatch?> DiscardBatchAsync(int batchId, string? storeId, string? by = null)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var batch = await db.InventoryBatches.Include(b => b.Product).FirstOrDefaultAsync(b => b.Id == batchId);
        if (batch is null || (storeId is not null && batch.StoreId != storeId)) return null;
        var level = await db.StockLevels.FirstOrDefaultAsync(s => s.StoreId == batch.StoreId && s.ProductId == batch.ProductId);
        if (level is not null)
        {
            var taken = Math.Min(level.Quantity, batch.Quantity);
            level.Quantity -= taken;
            db.StockMovements.Add(new StockMovement
            {
                StoreId = batch.StoreId, ProductId = batch.ProductId, At = DateTime.Now, Delta = -taken, QuantityAfter = level.Quantity,
                Kind = StockMovementKind.Discard, Ref = batch.LotCode, By = by,
                Reason = batch.ExpiresAt <= DateTime.Now ? "Hàng hết hạn" : "Xuất huỷ lô",
            });
        }
        db.InventoryBatches.Remove(batch);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return batch;
    }

    /// <summary>Giá vốn của toàn bộ hàng đang có trong kho (storeId null là cả chuỗi).</summary>
    public async Task<long> InventoryCostAsync(string? storeId)
    {
        var query = db.StockLevels.Where(s => s.Quantity > 0);
        if (storeId is not null) query = query.Where(s => s.StoreId == storeId);
        return await query.SumAsync(s => (long)s.Quantity * s.Product!.CostPrice);
    }

    // ------------------------------------------------------------------ kiểm kê

    /// <summary>Ghi số đếm của một mặt hàng trong phiên kiểm kê đang dở; null là xoá số đếm.</summary>
    public async Task<StockResult> SetCountAsync(string storeId, string productId, int? counted, string? by)
    {
        if (counted is < 0 or > 99_999) return StockResult.Fail("Số đếm từ 0 đến 99.999");
        var row = await db.StocktakeCounts.FirstOrDefaultAsync(c => c.StoreId == storeId && c.ProductId == productId);
        if (counted is null)
        {
            if (row is not null) db.StocktakeCounts.Remove(row);
        }
        else
        {
            if (row is null)
            {
                row = new StocktakeCount { StoreId = storeId, ProductId = productId };
                db.StocktakeCounts.Add(row);
            }
            row.Counted = counted.Value;
            row.UpdatedAt = DateTime.Now;
            row.By = by;
        }
        await db.SaveChangesAsync();
        return new StockResult(true, null);
    }

    /// <summary>Làm lại: xoá hết số đã đếm, tồn hệ thống không đổi.</summary>
    public async Task<int> ResetCountsAsync(string storeId)
    {
        var rows = await db.StocktakeCounts.Where(c => c.StoreId == storeId).ToListAsync();
        db.StocktakeCounts.RemoveRange(rows);
        await db.SaveChangesAsync();
        return rows.Count;
    }

    /// <summary>Cân bằng kho: mặt hàng nào lệch thì đặt tồn bằng số đếm và ghi nhật ký; xong thì xoá phiên.</summary>
    public async Task<StocktakeResult> ApplyCountsAsync(string storeId, string? by)
    {
        var now = DateTime.Now;
        await using var tx = await db.Database.BeginTransactionAsync();
        var counts = await db.StocktakeCounts.Include(c => c.Product).Where(c => c.StoreId == storeId).ToListAsync();
        var ids = counts.Select(c => c.ProductId).ToList();
        var levels = await db.StockLevels.Where(s => s.StoreId == storeId && ids.Contains(s.ProductId)).ToDictionaryAsync(s => s.ProductId);
        int matched = 0, over = 0, shortCount = 0, overUnits = 0, shortUnits = 0;
        long value = 0;
        foreach (var c in counts)
        {
            if (!levels.TryGetValue(c.ProductId, out var level))
            {
                level = new StockLevel { StoreId = storeId, ProductId = c.ProductId, MinQuantity = DefaultMinQuantity };
                db.StockLevels.Add(level);
            }
            var diff = c.Counted - level.Quantity;
            if (diff == 0)
            {
                matched++;
                continue;
            }
            if (diff > 0) { over++; overUnits += diff; } else { shortCount++; shortUnits += -diff; }
            value += (long)diff * (c.Product?.CostPrice ?? 0);
            level.Quantity = c.Counted;
            if (diff < 0) await TrimBatchesAsync(storeId, c.ProductId, c.Counted);
            db.StockMovements.Add(new StockMovement
            {
                StoreId = storeId, ProductId = c.ProductId, At = now, Delta = diff, QuantityAfter = c.Counted,
                Kind = StockMovementKind.Stocktake, Reason = "Kiểm kê", By = by,
            });
        }
        db.StocktakeCounts.RemoveRange(counts);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new StocktakeResult(counts.Count, matched, over, shortCount, overUnits, shortUnits, value);
    }
}
