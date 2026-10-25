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
    public DbSet<PriceChange> PriceChanges => Set<PriceChange>();
    public DbSet<StockTransfer> StockTransfers => Set<StockTransfer>();
    public DbSet<StockTransferItem> StockTransferItems => Set<StockTransferItem>();
    public DbSet<StockTransferLot> StockTransferLots => Set<StockTransferLot>();
    public DbSet<OrderReturn> OrderReturns => Set<OrderReturn>();
    public DbSet<OrderReturnItem> OrderReturnItems => Set<OrderReturnItem>();

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
        // Trang sửa sản phẩm đọc lịch sử giá của một sản phẩm, mới nhất trước.
        b.Entity<PriceChange>().HasIndex(x => new { x.ProductId, x.At });
        // Chuyển kho: tra phiếu theo mã, theo cửa hàng nhận (chờ nhận) và cửa hàng gửi.
        b.Entity<StockTransfer>().HasIndex(x => x.Code).IsUnique();
        b.Entity<StockTransfer>().HasIndex(x => new { x.ToStoreId, x.Status });
        b.Entity<StockTransfer>().HasIndex(x => new { x.FromStoreId, x.CreatedAt });
        b.Entity<StockTransfer>().HasOne(t => t.FromStore).WithMany().HasForeignKey(t => t.FromStoreId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<StockTransfer>().HasOne(t => t.ToStore).WithMany().HasForeignKey(t => t.ToStoreId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<StockTransferItem>().HasOne(i => i.Transfer).WithMany(t => t.Items).OnDelete(DeleteBehavior.Cascade);
        b.Entity<StockTransferItem>().HasOne(i => i.Product).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<StockTransferLot>().HasOne(l => l.Item).WithMany(i => i.Lots).OnDelete(DeleteBehavior.Cascade);
        // Trả hàng: tra theo đơn và theo mã phiếu.
        b.Entity<OrderReturn>().HasIndex(x => x.Code).IsUnique();
        b.Entity<OrderReturn>().HasOne(r => r.Order).WithMany(o => o.Returns).HasForeignKey(r => r.OrderId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<OrderReturnItem>().HasOne(i => i.Return).WithMany(r => r.Items).OnDelete(DeleteBehavior.Cascade);

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
