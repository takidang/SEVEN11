using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Địa chỉ giao đang chọn của giỏ hàng và cửa hàng phục vụ địa chỉ đó.</summary>
public sealed record CartDelivery(Address? Address, Store? Store, double? DistanceKm)
{
    public bool OutOfRange => DistanceKm > DeliveryService.RadiusKm;
}

/// <summary>
/// Dữ liệu dùng chung của một lượt xem trang cửa hàng: danh mục, khuyến mãi, sản phẩm đang bán,
/// giỏ hàng, khách đang đăng nhập và cửa hàng phục vụ. Nạp một lần mỗi yêu cầu, khi cần mới nạp.
/// "Bây giờ" cũng chốt một lần để mọi phần trên trang cùng một mốc giờ.
/// </summary>
public sealed class ShopContext(AppDbContext db, CartStore cart, IHttpContextAccessor http, IWebHostEnvironment env)
{
    /// <summary>Cửa hàng mặc định khi khách chưa có địa chỉ giao (giống DEFAULT_STORE_ID của bản Next.js).</summary>
    public const string DefaultStoreId = "st-1006";

    public DateTime Now { get; } = DateTime.Now;
    public CartStore Cart => cart;
    public AppDbContext Db => db;

    private List<Category>? _categories;
    private List<Promotion>? _promotions;
    private List<Product>? _products;
    private List<FlashSlot>? _slots;
    private Dictionary<string, int>? _cart;
    private Customer? _customer;
    private bool _customerLoaded;
    private List<Store>? _stores;
    private CartDelivery? _delivery;
    private readonly Dictionary<string, DisplayPrice> _display = [];

    public string? CustomerId => http.HttpContext?.User.CustomerId();

    /// <summary>Ngành hàng theo thứ tự hiển thị, nhóm hàng theo đúng thứ tự trong dữ liệu gốc.</summary>
    public IReadOnlyList<Category> Categories => _categories ??= LoadCategories();

    public IReadOnlyList<Promotion> Promotions => _promotions ??= db.Promotions.AsNoTracking().ToList();

    /// <summary>Sản phẩm đang bán, theo thứ tự trong danh mục gốc.</summary>
    public IReadOnlyList<Product> Products => _products ??= db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Id).ToList();

    public IReadOnlyList<FlashSlot> FlashSlots => _slots ??= ShopPromos.FlashSlots(Promotions, Now);

    public Category? CategoryOf(string? id) => Categories.FirstOrDefault(c => c.Id == id);

    /// <summary>Khách đang đăng nhập (kèm sổ địa chỉ), hoặc null.</summary>
    public Customer? Customer
    {
        get
        {
            if (_customerLoaded) return _customer;
            _customerLoaded = true;
            var id = CustomerId;
            _customer = id is null ? null : db.Customers.AsNoTracking().Include(c => c.Addresses).FirstOrDefault(c => c.Id == id);
            return _customer;
        }
    }

    /// <summary>Sau khi sửa thông tin khách trong cùng yêu cầu thì đọc lại.</summary>
    public void ForgetCustomer()
    {
        _customerLoaded = false;
        _customer = null;
        _delivery = null;
    }

    public Dictionary<string, int> CartQuantities => _cart ??= cart.Lines().GroupBy(l => l.ProductId).ToDictionary(g => g.Key, g => g.Sum(l => l.Quantity));

    public int CartCount => CartQuantities.Values.Sum();

    public int InCart(string productId) => CartQuantities.GetValueOrDefault(productId);

    public bool AgeConfirmed => cart.AgeConfirmed();

    public DisplayPrice Display(Product product)
    {
        if (!_display.TryGetValue(product.Id, out var price))
        {
            price = ShopPromos.Display(product, Promotions, Now);
            _display[product.Id] = price;
        }
        return price;
    }

    public IReadOnlyList<Store> Stores => _stores ??= db.Stores.AsNoTracking().OrderBy(s => s.Code).ToList();

    /// <summary>
    /// Địa chỉ giao của giỏ: địa chỉ khách đã chọn, không thì địa chỉ mặc định; cửa hàng phục vụ là cửa
    /// hàng mở cửa gần nhất (có toạ độ) hoặc cửa hàng đầu tiên cùng tỉnh.
    /// </summary>
    public CartDelivery Delivery
    {
        get
        {
            if (_delivery is not null) return _delivery;
            var customer = Customer;
            var chosen = cart.AddressId();
            var address = customer?.Addresses.FirstOrDefault(a => a.Id == chosen)
                ?? customer?.Addresses.OrderByDescending(a => a.IsDefault).FirstOrDefault();
            // Khách tự chọn cửa hàng (còn mở) thì giao từ đó; không thì cửa hàng gần địa chỉ nhất.
            var picked = cart.StoreId() is string pickedId ? Stores.FirstOrDefault(s => s.Id == pickedId && s.Status == StoreStatus.Active) : null;
            var store = picked ?? (address is null ? null : DeliveryService.StoreFor(Stores, address.Province, address.Lat, address.Lng));
            double? distance = store is not null && address?.Lat is double lat && address.Lng is double lng
                ? DeliveryService.DistanceKm(lat, lng, store.Lat, store.Lng)
                : null;
            return _delivery = new CartDelivery(address, store, distance);
        }
    }

    /// <summary>Cửa hàng phục vụ giỏ hàng (chưa có địa chỉ thì cửa hàng mặc định), dùng để báo còn hàng.</summary>
    public Store? ServingStore => Delivery.Store ?? Stores.FirstOrDefault(s => s.Id == DefaultStoreId) ?? Stores.FirstOrDefault();

    // ------------------------------------------------------------------ bán chạy

    private static readonly object SalesLock = new();
    private static (DateTime At, Dictionary<string, int> Units)? _sales;

    /// <summary>Số đơn vị đã bán của từng sản phẩm (đơn không huỷ), lưu tạm một phút cho nhẹ máy.</summary>
    public Dictionary<string, int> SalesRank()
    {
        lock (SalesLock)
        {
            if (_sales is { } cached && (DateTime.UtcNow - cached.At).TotalSeconds < 60) return cached.Units;
        }
        var units = db.OrderItems.AsNoTracking()
            .Where(i => i.Order!.Status != OrderStatus.Cancelled)
            .GroupBy(i => i.ProductId)
            .Select(g => new { g.Key, Units = g.Sum(i => i.Quantity) })
            .ToDictionary(x => x.Key, x => x.Units);
        lock (SalesLock) _sales = (DateTime.UtcNow, units);
        return units;
    }

    // ------------------------------------------------------------------ thứ tự nhóm hàng

    private static Dictionary<string, int>? _subcategoryOrder;

    private List<Category> LoadCategories()
    {
        var categories = db.Categories.AsNoTracking().Include(c => c.Subcategories).OrderBy(c => c.SortOrder).ToList();
        var order = SubcategoryOrder();
        foreach (var c in categories)
            c.Subcategories = c.Subcategories.OrderBy(s => order.GetValueOrDefault(s.Id, int.MaxValue)).ThenBy(s => s.Id, StringComparer.Ordinal).ToList();
        return categories;
    }

    /// <summary>Thứ tự nhóm hàng trong categories.json (cơ sở dữ liệu không lưu thứ tự này).</summary>
    private Dictionary<string, int> SubcategoryOrder()
    {
        if (_subcategoryOrder is not null) return _subcategoryOrder;
        var map = new Dictionary<string, int>();
        try
        {
            using var file = File.OpenRead(Path.Combine(env.ContentRootPath, "Data", "categories.json"));
            using var doc = JsonDocument.Parse(file);
            var i = 0;
            foreach (var c in doc.RootElement.EnumerateArray())
                if (c.TryGetProperty("subcategories", out var subs))
                    foreach (var s in subs.EnumerateArray())
                        if (s.TryGetProperty("id", out var id) && id.GetString() is string value) map[value] = i++;
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            // Không đọc được file thì xếp theo mã, trang vẫn chạy.
        }
        return _subcategoryOrder = map;
    }
}
