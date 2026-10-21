using SevenEleven.Core.Models;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

namespace SevenEleven.Web.Models.Shop;

/// <summary>Một dòng của giỏ theo đúng thứ tự khách thêm: đã tính giá, hoặc sản phẩm đã ngừng bán.</summary>
public sealed record CartRow(CartLine Line, Product? Product, PricedLine? Priced, int Available);

public sealed class CartModel
{
    public required PricingResult Pricing { get; init; }
    public required List<CartRow> Rows { get; init; }
    public Customer? Customer { get; init; }
    public required CartDelivery Delivery { get; init; }
    /// <summary>Cửa hàng phục vụ (chưa có địa chỉ thì cửa hàng mặc định).</summary>
    public Store? Store { get; init; }
    public string? Code { get; init; }
    public required List<VoucherOption> Vouchers { get; init; }
    public bool MemberVoucherLive { get; init; }
    public required List<Product> Suggestions { get; init; }
    public required List<Product> Discounted { get; init; }
    public required string Note { get; init; }
    public required CheckoutDraft Draft { get; init; }
    public required DateTime Now { get; init; }
    /// <summary>Mở sẵn ô chọn voucher (vừa nhập mã sai, hoặc ?voucher=1).</summary>
    public bool OpenPicker { get; init; }
    public string? PickerError { get; init; }
    public string? PickerDraft { get; init; }
    public FormErrors? Errors { get; init; }
    public int Units => Rows.Sum(r => r.Line.Quantity);
    public bool HasUnavailable => Rows.Any(r => r.Priced is null);
    public List<CartRow> ShortRows => Rows.Where(r => r.Priced is not null && r.Line.Quantity > r.Available).ToList();
}

public sealed record VoucherCardModel(VoucherOption Option, bool Best, bool Selected, DateTime Now);
