using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace SevenEleven.Core.Services;

public enum OtpPurpose { SignUp, Reset }

/// <summary>Mã vừa gửi. DevCode chỉ có ở bản demo, thay cho tin nhắn SMS.</summary>
public record OtpRequestResult(DateTime SentAt, DateTime ExpiresAt, string DevCode)
{
    public int ResendAfterSeconds(DateTime now) => Math.Max(0, OtpService.ResendSeconds - (int)(now - SentAt).TotalSeconds);
}

public record OtpVerifyResult(bool Ok, string? Error)
{
    public static readonly OtpVerifyResult Success = new(true, null);
}

/// <summary>
/// Mã OTP xác minh số điện thoại, chuyển từ stores/otp.ts: 6 chữ số, hết hạn sau 5 phút, sai 5 lần
/// phải xin mã mới, 60 giây mới được gửi lại. Mã đúng chỉ dùng được một lần. Chỉ tin nhắn là giả lập:
/// máy chủ thật gửi SMS và không bao giờ trả mã về trình duyệt.
/// </summary>
public class OtpService
{
    public const int Length = 6;
    public const int TtlMinutes = 5;
    public const int MaxAttempts = 5;
    public const int ResendSeconds = 60;

    private record Challenge(string Code, DateTime SentAt, DateTime ExpiresAt, int AttemptsLeft);

    private readonly ConcurrentDictionary<(OtpPurpose, string), Challenge> _challenges = new();

    /// <summary>
    /// Gửi mã cho số điện thoại này. Còn trong 60 giây chờ mà mã cũ còn dùng được thì trả lại mã cũ
    /// (không gửi tin nhắn mới).
    /// </summary>
    public OtpRequestResult Request(string phone, OtpPurpose purpose, DateTime now)
    {
        var key = (purpose, phone);
        if (_challenges.TryGetValue(key, out var current) && current.AttemptsLeft > 0 && now < current.ExpiresAt
            && (now - current.SentAt).TotalSeconds < ResendSeconds)
        {
            return new OtpRequestResult(current.SentAt, current.ExpiresAt, current.Code);
        }
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var challenge = new Challenge(code, now, now.AddMinutes(TtlMinutes), MaxAttempts);
        _challenges[key] = challenge;
        return new OtpRequestResult(challenge.SentAt, challenge.ExpiresAt, code);
    }

    /// <summary>Kiểm tra mã. Mã đúng dùng được một lần; mã sai trừ lượt thử.</summary>
    public OtpVerifyResult Verify(string phone, OtpPurpose purpose, string? code, DateTime now)
    {
        var key = (purpose, phone);
        if (!_challenges.TryGetValue(key, out var current)) return new(false, "Mã OTP không còn hiệu lực, bấm Gửi lại mã");
        if (now > current.ExpiresAt) return new(false, $"Mã OTP đã quá {TtlMinutes} phút, bấm Gửi lại mã để nhận mã mới");
        if (current.AttemptsLeft <= 0) return new(false, $"Đã nhập sai {MaxAttempts} lần, bấm Gửi lại mã để nhận mã mới");
        if ((code ?? "").Trim() != current.Code)
        {
            var left = current.AttemptsLeft - 1;
            _challenges[key] = current with { AttemptsLeft = left };
            return left > 0
                ? new(false, $"Mã OTP không đúng, còn {left} lần thử")
                : new(false, $"Đã nhập sai {MaxAttempts} lần, bấm Gửi lại mã để nhận mã mới");
        }
        _challenges.TryRemove(key, out _);
        return OtpVerifyResult.Success;
    }
}
