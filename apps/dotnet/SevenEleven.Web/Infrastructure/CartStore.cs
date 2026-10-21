using System.Text.Json;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Infrastructure;

/// <summary>
/// Danh sách hàng lưu trong phiên làm việc. Chỉ giữ mã sản phẩm và số lượng — giá luôn được tính
/// lại từ cơ sở dữ liệu, nên không ai sửa được giá bằng cách chỉnh dữ liệu phía trình duyệt.
/// Giỏ hàng online và hoá đơn ở quầy dùng chung cơ chế, khác khoá.
/// </summary>
public abstract class SessionLines(IHttpContextAccessor http, string prefix)
{
    private const int MaxQuantity = 99;

    protected ISession Session => http.HttpContext!.Session;
    protected string Key(string name) => $"{prefix}.{name}";

    public List<CartLine> Lines()
    {
        var json = Session.GetString(Key("lines"));
        return string.IsNullOrEmpty(json) ? [] : JsonSerializer.Deserialize<List<CartLine>>(json) ?? [];
    }

    public int Count() => Lines().Sum(l => l.Quantity);

    public void Add(string productId, int quantity)
    {
        var lines = Lines();
        var existing = lines.FindIndex(l => l.ProductId == productId);
        if (existing >= 0) lines[existing] = lines[existing] with { Quantity = Math.Min(MaxQuantity, lines[existing].Quantity + quantity) };
        else lines.Add(new CartLine(productId, Math.Clamp(quantity, 1, MaxQuantity)));
        Save(lines);
    }

    public void Set(string productId, int quantity)
    {
        var lines = Lines();
        if (quantity <= 0) lines.RemoveAll(l => l.ProductId == productId);
        else
        {
            var i = lines.FindIndex(l => l.ProductId == productId);
            if (i >= 0) lines[i] = lines[i] with { Quantity = Math.Min(MaxQuantity, quantity) };
        }
        Save(lines);
    }

    public string? Code() => Session.GetString(Key("code"));

    public void SetCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) Session.Remove(Key("code"));
        else Session.SetString(Key("code"), code.Trim().ToUpperInvariant());
    }

    public virtual void Clear()
    {
        Session.Remove(Key("lines"));
        Session.Remove(Key("code"));
    }

    private void Save(List<CartLine> lines) => Session.SetString(Key("lines"), JsonSerializer.Serialize(lines));
}

/// <summary>Giỏ hàng online của khách, kèm địa chỉ giao đang chọn.</summary>
public class CartStore(IHttpContextAccessor http) : SessionLines(http, "cart")
{
    public const int NoteMaxLength = 200;

    public string? AddressId() => Session.GetString(Key("address"));

    public void SetAddress(string? addressId)
    {
        if (string.IsNullOrEmpty(addressId)) Session.Remove(Key("address"));
        else Session.SetString(Key("address"), addressId);
        // Đổi địa chỉ thì cửa hàng phục vụ tính lại theo địa chỉ mới (bỏ lựa chọn tay trước đó).
        Session.Remove(Key("store"));
    }

    /// <summary>Cửa hàng khách tự chọn ở trang Hệ thống cửa hàng ("Giao từ cửa hàng này"); null = gần nhất.</summary>
    public string? StoreId() => Session.GetString(Key("store"));

    public void SetStore(string? storeId)
    {
        if (string.IsNullOrEmpty(storeId)) Session.Remove(Key("store"));
        else Session.SetString(Key("store"), storeId);
    }

    /// <summary>Ghi chú cho cửa hàng, tối đa 200 ký tự (bị xoá cùng giỏ hàng).</summary>
    public string Note() => Session.GetString(Key("note")) ?? "";

    public void SetNote(string? note)
    {
        var value = (note ?? "").Trim();
        if (value.Length > NoteMaxLength) value = value[..NoteMaxLength];
        if (value.Length == 0) Session.Remove(Key("note"));
        else Session.SetString(Key("note"), value);
    }

    /// <summary>Người nhận, số điện thoại và cách thanh toán khách đang điền dở ở giỏ hàng.</summary>
    public CheckoutDraft Draft()
    {
        var json = Session.GetString(Key("draft"));
        return string.IsNullOrEmpty(json) ? new CheckoutDraft() : JsonSerializer.Deserialize<CheckoutDraft>(json) ?? new CheckoutDraft();
    }

    public void SetDraft(CheckoutDraft draft) => Session.SetString(Key("draft"), JsonSerializer.Serialize(draft));

    /// <summary>Khách đã xác nhận đủ 18 tuổi (đồ uống có cồn): chỉ hỏi một lần mỗi phiên.</summary>
    public bool AgeConfirmed() => Session.GetString(Key("age")) == "1";

    public void ConfirmAge() => Session.SetString(Key("age"), "1");

    /// <summary>Xoá giỏ: sản phẩm, mã khuyến mãi và ghi chú (địa chỉ giao vẫn giữ).</summary>
    public override void Clear()
    {
        base.Clear();
        Session.Remove(Key("note"));
        Session.Remove(Key("draft"));
    }
}

/// <summary>Phần khách điền ở bước đặt hàng, giữ lại khi trang giỏ hàng tải lại.</summary>
public class CheckoutDraft
{
    public string? Recipient { get; set; }
    public string? Phone { get; set; }
    public string? Payment { get; set; }
}

/// <summary>Hoá đơn đang bấm ở máy bán hàng tại quầy, kèm thành viên đã quét.</summary>
public class PosBillStore(IHttpContextAccessor http) : SessionLines(http, "pos")
{
    public string? CustomerId() => Session.GetString(Key("customer"));

    public void SetCustomer(string? customerId)
    {
        if (string.IsNullOrEmpty(customerId)) Session.Remove(Key("customer"));
        else Session.SetString(Key("customer"), customerId);
    }

    public override void Clear()
    {
        base.Clear();
        Session.Remove(Key("customer"));
    }
}
