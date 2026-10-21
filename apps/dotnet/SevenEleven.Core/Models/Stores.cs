namespace SevenEleven.Core.Models;

public enum StoreStatus { Active, Maintenance, Closed }

public class Store
{
    public string Id { get; set; } = "";
    /// <summary>Mã số ngắn của cửa hàng, ví dụ "1006".</summary>
    public string Code { get; set; } = "";
    /// <summary>Tên gọi ngắn, ví dụ "81 Nguyễn Du".</summary>
    public string Name { get; set; } = "";
    public string Address { get; set; } = "";
    public string Ward { get; set; } = "";
    public string Province { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string OpenHours { get; set; } = "24/7";
    public StoreStatus Status { get; set; } = StoreStatus.Active;
    public string? ManagerId { get; set; }
    public DateTime OpenedAt { get; set; }
    /// <summary>Toạ độ để tìm cửa hàng gần khách nhất.</summary>
    public double Lat { get; set; }
    public double Lng { get; set; }

    public List<Employee> Employees { get; set; } = [];
    public List<StockLevel> StockLevels { get; set; } = [];
    public List<Order> Orders { get; set; } = [];
}

public enum StaffRole { Admin, Manager, Cashier }

public enum EmployeeStatus { Active, OnLeave, Inactive }

public class Employee
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public StaffRole Role { get; set; }
    /// <summary>Null nghĩa là phụ trách cả chuỗi (quản trị).</summary>
    public string? StoreId { get; set; }
    public Store? Store { get; set; }
    public EmployeeStatus Status { get; set; } = EmployeeStatus.Active;
    public DateTime HiredAt { get; set; }
    /// <summary>Mật khẩu băm. Bản demo dùng chung một mật khẩu.</summary>
    public string PasswordHash { get; set; } = "";
}
