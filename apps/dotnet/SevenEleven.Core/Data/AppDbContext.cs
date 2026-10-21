using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Models;

namespace SevenEleven.Core.Data;

/// <summary>
/// Cơ sở dữ liệu của chuỗi. Bản dev chạy SQLite cho nhẹ; đổi sang SQL Server chỉ cần đổi
/// chuỗi kết nối và nhà cung cấp trong Program.cs, phần còn lại giữ nguyên.
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Subcategory> Subcategories => Set<Subcategory>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Store> Stores => Set<Store>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Address> Addresses => Set<Address>();
    public DbSet<StarEntry> StarEntries => Set<StarEntry>();
    public DbSet<TierChange> TierChanges => Set<TierChange>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderEvent> OrderEvents => Set<OrderEvent>();
    public DbSet<DeliveryInfo> Deliveries => Set<DeliveryInfo>();
    public DbSet<Promotion> Promotions => Set<Promotion>();
    public DbSet<StockLevel> StockLevels => Set<StockLevel>();
    public DbSet<InventoryBatch> InventoryBatches => Set<InventoryBatch>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderItem> PurchaseOrderItems => Set<PurchaseOrderItem>();
    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<StocktakeCount> StocktakeCounts => Set<StocktakeCount>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Tra cứu theo đường dẫn thân thiện và theo mã vạch là hai thao tác chạy nhiều nhất.
        b.Entity<Category>().HasIndex(x => x.Slug).IsUnique();
        b.Entity<Product>().HasIndex(x => x.Slug).IsUnique();
        b.Entity<Product>().HasIndex(x => x.Barcode);
        b.Entity<Product>().HasIndex(x => x.Sku);
        b.Entity<Store>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Order>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Customer>().HasIndex(x => x.Phone).IsUnique();
        b.Entity<Employee>().HasIndex(x => x.Email).IsUnique();
        b.Entity<StockLevel>().HasIndex(x => new { x.StoreId, x.ProductId }).IsUnique();
        b.Entity<InventoryBatch>().HasIndex(x => new { x.StoreId, x.ProductId });
        b.Entity<TierChange>().HasIndex(x => new { x.CustomerId, x.At });
        b.Entity<Shift>().HasIndex(x => new { x.StoreId, x.Date });
        b.Entity<Shift>().HasIndex(x => new { x.EmployeeId, x.Date });
        b.Entity<StockMovement>().HasIndex(x => new { x.StoreId, x.At });
        b.Entity<StockMovement>().HasIndex(x => new { x.StoreId, x.ProductId });
        b.Entity<StocktakeCount>().HasIndex(x => new { x.StoreId, x.ProductId }).IsUnique();
        b.Entity<StarEntry>().HasIndex(x => new { x.CustomerId, x.At });
        b.Entity<Supplier>().HasIndex(x => x.Code).IsUnique();
        b.Entity<PurchaseOrder>().HasIndex(x => x.Code).IsUnique();

        // Bảng điều khiển và báo cáo luôn lọc đơn theo khoảng thời gian, thường kèm cửa hàng.
        b.Entity<Order>().HasIndex(x => x.CreatedAt);
        b.Entity<Order>().HasIndex(x => new { x.StoreId, x.CreatedAt });
        b.Entity<Order>().HasIndex(x => new { x.Status, x.Channel });

        b.Entity<Order>().HasOne(o => o.Delivery).WithOne(d => d.Order).HasForeignKey<DeliveryInfo>(d => d.OrderId);

        // Xoá đơn thì xoá luôn dòng hàng và lịch sử trạng thái của nó.
        b.Entity<OrderItem>().HasOne(i => i.Order).WithMany(o => o.Items).OnDelete(DeleteBehavior.Cascade);
        b.Entity<OrderEvent>().HasOne(e => e.Order).WithMany(o => o.Timeline).OnDelete(DeleteBehavior.Cascade);

        // Không cho xoá sản phẩm đã từng bán: đơn cũ phải giữ nguyên.
        b.Entity<OrderItem>().HasOne(i => i.Product).WithMany().OnDelete(DeleteBehavior.Restrict);

        b.Entity<PurchaseOrderItem>().HasOne(i => i.PurchaseOrder).WithMany(p => p.Items).OnDelete(DeleteBehavior.Cascade);
        b.Entity<PurchaseOrderItem>().HasOne(i => i.Product).WithMany().OnDelete(DeleteBehavior.Restrict);
    }
}
