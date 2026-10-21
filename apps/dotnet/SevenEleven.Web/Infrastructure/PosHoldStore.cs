using System.Text.Json;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Một hoá đơn thu ngân bấm "Tạm giữ" để phục vụ khách sau, lát nữa mở lại thanh toán tiếp.</summary>
public record HeldBill(string Id, List<CartLine> Lines, string? CustomerId, string? Code, DateTime HeldAt);

/// <summary>
/// Các bill đang giữ của máy bán hàng, nằm trong phiên làm việc cạnh hoá đơn đang bấm (giống bản
/// Next.js giữ trong sessionStorage). Tối đa 10 bill, mới giữ nằm trên cùng.
/// </summary>
public class PosHoldStore(ISession session, PosBillStore bill)
{
    public const int Max = 10;
    private const string Key = "pos.held";

    public List<HeldBill> All()
    {
        var json = session.GetString(Key);
        return string.IsNullOrEmpty(json) ? [] : JsonSerializer.Deserialize<List<HeldBill>>(json) ?? [];
    }

    public bool IsFull => All().Count >= Max;

    /// <summary>Cất hoá đơn đang bấm vào danh sách giữ rồi để trống quầy; null khi hoá đơn trống hoặc đã đủ 10 bill.</summary>
    public HeldBill? Hold(DateTime now)
    {
        var held = All();
        var lines = bill.Lines();
        if (lines.Count == 0 || held.Count >= Max) return null;
        var parked = Park(lines, now);
        held.Insert(0, parked);
        Save(held);
        bill.Clear();
        return parked;
    }

    /// <summary>Mở lại một bill đang giữ; hoá đơn đang bấm dở (nếu có) được giữ thay vào chỗ đó.</summary>
    public HeldBill? Restore(string id, DateTime now)
    {
        var held = All();
        var target = held.FirstOrDefault(h => h.Id == id);
        if (target is null) return null;
        held.Remove(target);
        var current = bill.Lines();
        if (current.Count > 0) held.Insert(0, Park(current, now));
        Save(held);
        bill.Clear();
        foreach (var line in target.Lines) bill.Add(line.ProductId, line.Quantity);
        bill.SetCode(target.Code);
        bill.SetCustomer(target.CustomerId);
        return target;
    }

    public bool Discard(string id)
    {
        var held = All();
        var removed = held.RemoveAll(h => h.Id == id) > 0;
        if (removed) Save(held);
        return removed;
    }

    public void ClearAll() => session.Remove(Key);

    private HeldBill Park(List<CartLine> lines, DateTime now) =>
        new($"hold-{Guid.NewGuid():N}"[..13], lines, bill.CustomerId(), bill.Code(), now);

    private void Save(List<HeldBill> held) => session.SetString(Key, JsonSerializer.Serialize(held));
}
