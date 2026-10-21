using System.Security.Cryptography;

namespace SevenEleven.Core.Data;

/// <summary>
/// Băm mật khẩu bằng PBKDF2 kèm muối ngẫu nhiên. Bản Next.js trước đây băm ngay trong trình
/// duyệt bằng một hàm rút gọn, không an toàn; chuyển xuống server thì làm cho đúng.
/// </summary>
public static class PasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int Iterations = 100_000;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
    }

    public static bool Verify(string password, string? hash)
    {
        if (string.IsNullOrEmpty(hash)) return false;
        var parts = hash.Split('.');
        if (parts.Length != 2) return false;
        var salt = Convert.FromBase64String(parts[0]);
        var expected = Convert.FromBase64String(parts[1]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
