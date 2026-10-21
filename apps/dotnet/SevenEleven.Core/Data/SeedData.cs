using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Core.Data;

/// <summary>
/// Nạp dữ liệu mẫu từ các file JSON trong thư mục Data của web. Danh mục, sản phẩm, cửa hàng và
/// nhân viên lấy đúng bộ đã dùng cho bản Next.js, nên hai bản so sánh được với nhau.
/// </summary>
public static partial class SeedData
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    /// <summary>Mật khẩu chung của tài khoản demo.</summary>
    public const string DemoPassword = "123456";

    public static async Task EnsureSeededAsync(AppDbContext db, string dataPath)
    {
        await db.Database.MigrateAsync();
        if (await db.Products.AnyAsync()) return;
        await SeedAsync(db, dataPath, DateTime.Now);
    }

    /// <summary>Xoá sạch rồi tạo lại dữ liệu mẫu, tính tới hôm nay. Mọi tài khoản và đơn tự tạo đều mất.</summary>
    public static async Task ResetAsync(AppDbContext db, string dataPath)
    {
        await db.Database.EnsureDeletedAsync();
        await EnsureSeededAsync(db, dataPath);
    }

    private static async Task SeedAsync(AppDbContext db, string dataPath, DateTime now)
    {
        var categories = Read<CategoryDto>(dataPath, "categories.json");
        var productDtos = Read<ProductDto>(dataPath, "products.json");
        var storeDtos = Read<StoreDto>(dataPath, "stores.json");
        var employeeDtos = Read<EmployeeDto>(dataPath, "employees.json");

        // Băm một lần rồi dùng chung: băm PBKDF2 cho ~160 tài khoản demo sẽ mất vài giây vô ích.
        var demoHash = PasswordHasher.Hash(DemoPassword);

        db.Categories.AddRange(categories.Select(c => new Category
        {
            Id = c.Id,
            Slug = c.Slug,
            Name = c.Name,
            Icon = c.Icon,
            SortOrder = c.SortOrder,
            IsHot = c.IsHot,
            AgeRestricted = c.AgeRestricted,
        }));
        db.Subcategories.AddRange(categories.SelectMany(c => c.Subcategories).Select(s => new Subcategory
        {
            Id = s.Id,
            Slug = s.Slug,
            Name = s.Name,
            CategoryId = s.CategoryId,
        }));
        var products = productDtos.Select(p => new Product
        {
            Id = p.Id,
            Sku = p.Sku,
            Barcode = p.Barcode,
            Slug = p.Slug,
            Name = p.Name,
            Brand = p.Brand,
            Unit = p.Unit,
            Origin = p.Origin,
            Image = p.Image,
            Price = p.Price,
            CompareAtPrice = p.CompareAtPrice,
            CostPrice = p.CostPrice,
            ShelfLifeDays = p.ShelfLifeDays,
            IsNew = p.IsNew,
            AgeRestricted = p.AgeRestricted,
            IsActive = p.IsActive,
            CreatedAt = p.CreatedAt,
            CategoryId = p.CategoryId,
            SubcategoryId = p.SubcategoryId,
        }).ToList();
        db.Products.AddRange(products);
        var stores = storeDtos.Select(s => new Store
        {
            Id = s.Id,
            Code = s.Code,
            Name = s.Name,
            Address = s.Address,
            Ward = s.Ward,
            Province = s.Province,
            Phone = s.Phone,
            Email = s.Email,
            OpenHours = s.OpenHours,
            Status = ParseStoreStatus(s.Status),
            ManagerId = s.ManagerId,
            OpenedAt = DateTime.Parse(s.OpenedAt),
            Lat = s.Lat,
            Lng = s.Lng,
        }).ToList();
        db.Stores.AddRange(stores);
        var employees = employeeDtos.Select(e => new Employee
        {
            Id = e.Id,
            Code = e.Code,
            FullName = e.FullName,
            Phone = e.Phone,
            Email = e.Email,
            Role = ParseRole(e.Role),
            StoreId = e.StoreId,
            Status = ParseEmployeeStatus(e.Status),
            HiredAt = DateTime.Parse(e.HiredAt),
            PasswordHash = demoHash,
        }).ToList();
        db.Employees.AddRange(employees);

        var suppliers = Suppliers();
        db.Suppliers.AddRange(suppliers);
        var promotions = Promotions(products, now);
        db.Promotions.AddRange(promotions);

        var r = new SeedRandom(20260916);
        var customers = Customers(r, now, demoHash);
        var history = History(r, now, products, customers, promotions, employees, stores);
        db.Customers.AddRange(customers);
        db.Orders.AddRange(history.Orders);
        db.StarEntries.AddRange(history.Stars);

        var stock = Stock(r, products, stores);
        db.StockLevels.AddRange(stock);
        db.InventoryBatches.AddRange(Batches(r, products, stores, stock, now));
        db.PurchaseOrders.AddRange(PurchaseOrders(r, now, products, suppliers, stores));
        db.Shifts.AddRange(Shifts(r, now, stores, employees, history.Orders));

        // Vài chục nghìn dòng: tắt dò thay đổi tự động và lưu trong một giao dịch cho nhanh.
        db.ChangeTracker.AutoDetectChangesEnabled = false;
        await using var tx = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        db.ChangeTracker.AutoDetectChangesEnabled = true;
        db.ChangeTracker.Clear();
    }

    /// <summary>
    /// Bộ khuyến mãi giống bản Next.js: 3 flash sale theo khung giờ, voucher đồ uống theo hạng,
    /// 2 mã giảm giá, mua X tặng Y. Mức giảm đã soát theo biên lợi nhuận thật nên không cái nào bán lỗ.
    /// </summary>
    private static List<Promotion> Promotions(List<Product> all, DateTime now)
    {
        var today = now.Date;
        var products = all.Where(p => p.IsActive).ToList();
        string Pick(Func<Product, bool> match, int count) =>
            string.Join(",", products.Where(match).Take(count).Select(p => p.Id));
        bool Sub(Product p, params string[] keys) => keys.Any(k => p.SubcategoryId.Contains(k));
        var allDay = (today.AddDays(-30), today.AddDays(60));

        return
        [
            new Promotion
            {
                Id = "pr-fs-sang", Name = "Buổi sáng năng động", Type = PromotionType.FlashSale, Value = 15,
                Description = "Giảm 15% bánh mì, sandwich, sữa chua và cà phê từ 6h đến 10h mỗi ngày.",
                ProductIds = Pick(p => Sub(p, "banh-mi-que", "sandwich", "burrito", "sua-chua", "ca-phe-viet-nam"), 12),
                Channels = "online,in-store", DailyStart = "06:00", DailyEnd = "10:00",
                StartsAt = allDay.Item1, EndsAt = allDay.Item2, Status = PromotionStatus.Active,
            },
            new Promotion
            {
                Id = "pr-fs-xe", Name = "Ăn xế", Type = PromotionType.FlashSale, Value = 20,
                Description = "Giảm 20% snack, trà sữa và kem từ 14h đến 17h mỗi ngày.",
                ProductIds = Pick(p => Sub(p, "snacks", "tra-sua-7-eleven", "tra-trai-cay", "kem"), 12),
                Channels = "online,in-store", DailyStart = "14:00", DailyEnd = "17:00",
                StartsAt = allDay.Item1, EndsAt = allDay.Item2, Status = PromotionStatus.Active,
            },
            new Promotion
            {
                Id = "pr-fs-toi", Name = "Ăn tối", Type = PromotionType.FlashSale, Value = 10,
                Description = "Giảm 10% món ăn no, cơm nắm và món hấp từ 17h đến 21h mỗi ngày.",
                ProductIds = Pick(p => Sub(p, "mon-an-no", "com-nam", "mon-hap", "combo-tiet-kiem"), 12),
                Channels = "online,in-store", DailyStart = "17:00", DailyEnd = "21:00",
                StartsAt = allDay.Item1, EndsAt = allDay.Item2, Status = PromotionStatus.Active,
            },
            new Promotion
            {
                Id = "pr-member-drink", Name = "Ưu đãi đồ uống thành viên", Type = PromotionType.MemberVoucher,
                Description = "Giảm 2.000 ₫ / 3.000 ₫ / 6.000 ₫ / 9.000 ₫ mỗi ly (tối đa 3 ly/đơn) theo hạng Đồng / Bạc / Vàng / Kim cương.",
                CategoryIds = "tra-sua", Tiers = "bronze,silver,gold,diamond", Channels = "online,in-store",
                StartsAt = new DateTime(now.Year, 1, 1), EndsAt = new DateTime(now.Year, 12, 31, 23, 59, 0),
                Status = PromotionStatus.Active,
            },
            new Promotion
            {
                Id = "pr-chaoban", Code = "CHAOBAN", Name = "Chào bạn mới", Type = PromotionType.Fixed, Value = 20_000,
                // 20.000 ₫ cộng phí giao 15.000 ₫ chỉ còn lãi từ đơn khoảng 130.000 ₫ trở lên.
                MinOrderValue = 150_000, Description = "Giảm 20.000 ₫ cho đơn online từ 150.000 ₫.",
                Channels = "online", StartsAt = today.AddDays(-60), EndsAt = today.AddDays(45),
                Status = PromotionStatus.Active, UsageLimit = 5_000,
            },
            new Promotion
            {
                Id = "pr-giam10", Code = "GIAM10", Name = "Thành viên Vàng & Kim cương giảm 10%", Type = PromotionType.Percent,
                Value = 10, MaxDiscount = 30_000, MinOrderValue = 150_000, Tiers = "gold,diamond",
                Description = "Giảm 10% tối đa 30.000 ₫ cho đơn từ 150.000 ₫, dành cho hạng Vàng và Kim cương.",
                Channels = "online,in-store", StartsAt = today.AddDays(-30), EndsAt = today.AddDays(30),
                Status = PromotionStatus.Active,
            },
            new Promotion
            {
                Id = "pr-snack-31", Name = "Snack mua 3 tặng 1", Type = PromotionType.BuyXGetY, BuyQuantity = 3, GetQuantity = 1,
                // Mua 2 tặng 1 là giảm 33%, vượt biên lợi nhuận 27% của snack; mua 3 tặng 1 chỉ giảm 25%.
                Description = "Mua 3 gói snack áp dụng, tặng thêm 1 gói cùng loại.",
                ProductIds = Pick(p => Sub(p, "snacks", "cac-loai-keo", "hat-trai-cay-say"), 6),
                Channels = "online,in-store", StartsAt = today.AddDays(-10), EndsAt = today.AddDays(20),
                Status = PromotionStatus.Active,
            },
        ];
    }

    private static List<T> Read<T>(string dataPath, string file)
    {
        var text = File.ReadAllText(Path.Combine(dataPath, file));
        return JsonSerializer.Deserialize<List<T>>(text, Json) ?? [];
    }

    private static StoreStatus ParseStoreStatus(string value) => value switch
    {
        "maintenance" => StoreStatus.Maintenance,
        "closed" => StoreStatus.Closed,
        _ => StoreStatus.Active,
    };

    private static StaffRole ParseRole(string value) => value switch
    {
        "admin" => StaffRole.Admin,
        "manager" => StaffRole.Manager,
        _ => StaffRole.Cashier,
    };

    private static EmployeeStatus ParseEmployeeStatus(string value) => value switch
    {
        "on-leave" => EmployeeStatus.OnLeave,
        "inactive" => EmployeeStatus.Inactive,
        _ => EmployeeStatus.Active,
    };

    // Các lớp dưới đây khớp đúng hình dạng JSON xuất từ bản Next.js.
    private class CategoryDto
    {
        public string Id { get; set; } = "";
        public string Slug { get; set; } = "";
        public string Name { get; set; } = "";
        public string Icon { get; set; } = "";
        public int SortOrder { get; set; }
        public bool IsHot { get; set; }
        public bool AgeRestricted { get; set; }
        public List<SubcategoryDto> Subcategories { get; set; } = [];
    }

    private class SubcategoryDto
    {
        public string Id { get; set; } = "";
        public string Slug { get; set; } = "";
        public string Name { get; set; } = "";
        public string CategoryId { get; set; } = "";
    }

    private class ProductDto
    {
        public string Id { get; set; } = "";
        public string Sku { get; set; } = "";
        public string Barcode { get; set; } = "";
        public string Slug { get; set; } = "";
        public string Name { get; set; } = "";
        public string CategoryId { get; set; } = "";
        public string SubcategoryId { get; set; } = "";
        public string Brand { get; set; } = "";
        public string Unit { get; set; } = "";
        public string Origin { get; set; } = "";
        public string Image { get; set; } = "";
        public int Price { get; set; }
        public int? CompareAtPrice { get; set; }
        public int CostPrice { get; set; }
        public int? ShelfLifeDays { get; set; }
        public bool IsNew { get; set; }
        public bool AgeRestricted { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    private class StoreDto
    {
        public string Id { get; set; } = "";
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string Address { get; set; } = "";
        public string Ward { get; set; } = "";
        public string Province { get; set; } = "";
        public string Phone { get; set; } = "";
        public string Email { get; set; } = "";
        public string OpenHours { get; set; } = "";
        public string Status { get; set; } = "active";
        public string? ManagerId { get; set; }
        public string OpenedAt { get; set; } = "2020-01-01";
        public double Lat { get; set; }
        public double Lng { get; set; }
    }

    private class EmployeeDto
    {
        public string Id { get; set; } = "";
        public string Code { get; set; } = "";
        public string FullName { get; set; } = "";
        public string Phone { get; set; } = "";
        public string Email { get; set; } = "";
        public string Role { get; set; } = "cashier";
        public string? StoreId { get; set; }
        public string Status { get; set; } = "active";
        public string HiredAt { get; set; } = "2024-01-01";
    }
}
