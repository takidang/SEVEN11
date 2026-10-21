namespace SevenEleven.Core.Models;

/// <summary>Ca sáng 06–14, ca chiều 14–22, ca đêm 22–06 (chỉ cửa hàng mở 24/7).</summary>
public enum ShiftType { Morning, Afternoon, Night }

public enum ShiftStatus { Scheduled, InProgress, Completed, Absent }

/// <summary>
/// Một ca làm của một nhân viên tại một cửa hàng. Ca xếp từ lịch dùng mã cố định theo ô lịch
/// (sh-{mã cửa hàng}-{ngày}-{ca}) nên một ô lịch không bao giờ có hai ca trùng nhau.
/// </summary>
public class Shift
{
    public string Id { get; set; } = "";
    public string StoreId { get; set; } = "";
    public Store? Store { get; set; }
    public string EmployeeId { get; set; } = "";
    public Employee? Employee { get; set; }
    /// <summary>Ngày của ca (ca đêm tính theo ngày bắt đầu lúc 22:00).</summary>
    public DateTime Date { get; set; }
    public ShiftType Type { get; set; }
    public ShiftStatus Status { get; set; }
    public DateTime? CheckInAt { get; set; }
    public DateTime? CheckOutAt { get; set; }
    /// <summary>Tiền lẻ trong két lúc vào ca.</summary>
    public int? OpeningCash { get; set; }
    /// <summary>Tiền mặt đếm được lúc kết ca.</summary>
    public int? ClosingCash { get; set; }
    public string? Note { get; set; }
}
