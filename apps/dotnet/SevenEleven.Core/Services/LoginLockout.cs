namespace SevenEleven.Core.Services;

/// <summary>Tài khoản đăng nhập bằng mật khẩu: nhân viên và khách.</summary>
public interface ILockableAccount
{
    /// <summary>Số lần nhập sai mật khẩu liên tiếp kể từ lần đăng nhập đúng hoặc lần khoá gần nhất.</summary>
    int FailedLogins { get; set; }
    /// <summary>Khoá đăng nhập tới thời điểm này; null là không khoá.</summary>
    DateTime? LockedUntil { get; set; }
}

/// <summary>
/// Chống dò mật khẩu: sai 5 lần liên tiếp thì khoá đăng nhập 15 phút, áp dụng cho cả nhân viên lẫn khách.
/// Đang khoá thì nhập đúng mật khẩu cũng không vào được. Hết khoá thì đếm lại từ đầu; đăng nhập đúng,
/// quên mật khẩu qua OTP hoặc quản trị đặt lại mật khẩu cũng xoá khoá.
/// </summary>
public static class LoginLockout
{
    public const int MaxAttempts = 5;
    public const int LockMinutes = 15;

    public static bool IsLocked(ILockableAccount account, DateTime now) => account.LockedUntil > now;

    /// <summary>Câu báo khi đang khoá, kèm số phút còn lại (làm tròn lên); null nếu không khoá.</summary>
    public static string? LockedMessage(ILockableAccount account, DateTime now) =>
        IsLocked(account, now)
            ? $"Đăng nhập tạm khoá do nhập sai mật khẩu {MaxAttempts} lần liên tiếp. Thử lại sau {MinutesLeft(account, now)} phút."
            : null;

    public static int MinutesLeft(ILockableAccount account, DateTime now) =>
        account.LockedUntil is DateTime until && until > now ? (int)Math.Ceiling((until - now).TotalMinutes) : 0;

    /// <summary>Ghi một lần sai; trả câu báo lỗi để hiện ngay dưới ô mật khẩu.</summary>
    public static string RecordFailure(ILockableAccount account, DateTime now)
    {
        // Khoá cũ đã hết hạn: bắt đầu đếm lại.
        if (account.LockedUntil is DateTime until && until <= now) Clear(account);
        account.FailedLogins++;
        if (account.FailedLogins >= MaxAttempts)
        {
            account.FailedLogins = 0;
            account.LockedUntil = now.AddMinutes(LockMinutes);
            return LockedMessage(account, now)!;
        }
        var left = MaxAttempts - account.FailedLogins;
        return left <= 3 ? $"Mật khẩu không đúng, còn {left} lần thử trước khi bị khoá {LockMinutes} phút" : "Mật khẩu không đúng";
    }

    public static void Clear(ILockableAccount account)
    {
        account.FailedLogins = 0;
        account.LockedUntil = null;
    }
}
