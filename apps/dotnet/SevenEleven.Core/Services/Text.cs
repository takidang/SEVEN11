using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace SevenEleven.Core.Services;

/// <summary>Lỗi theo từng ô nhập: tên ô → câu báo lỗi tiếng Việt.</summary>
public class FormErrors : Dictionary<string, string>
{
    public void Set(string field, string message) => TryAdd(field, message);
    public string? Of(string field) => TryGetValue(field, out var m) ? m : null;
}

public record SaveResult<T>(T? Value, FormErrors Errors) where T : class
{
    public bool Ok => Errors.Count == 0 && Value is not null;
    public static SaveResult<T> Fail(FormErrors errors) => new(null, errors);
}

/// <summary>Xử lý chữ tiếng Việt: bỏ dấu để tìm kiếm, tạo đường dẫn, sinh mã ngẫu nhiên.</summary>
public static partial class Text
{
    /// <summary>Bỏ dấu, đ→d, chữ thường — để "tra sua" tìm ra "Trà sữa".</summary>
    public static string Fold(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var normalized = value.Replace('đ', 'd').Replace('Đ', 'D').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var c in normalized)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
    }

    /// <summary>Mọi từ trong câu tìm đều có mặt trong chuỗi (đã bỏ dấu).</summary>
    public static bool MatchesAllWords(string haystack, string? query)
    {
        var words = Fold(query).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 0) return true;
        var folded = Fold(haystack);
        return words.All(folded.Contains);
    }

    public static string Digits(string? value) => new((value ?? "").Where(char.IsDigit).ToArray());

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlug();

    /// <summary>"Trà Sữa Oolong size L" → "tra-sua-oolong-size-l".</summary>
    public static string Slugify(string? value, string fallback = "san-pham")
    {
        var slug = NonSlug().Replace(Fold(value), "-").Trim('-');
        return slug.Length == 0 ? fallback : slug;
    }

    /// <summary>Chuỗi ngẫu nhiên từ bảng chữ cho trước.</summary>
    public static string Random(int length, string alphabet = "abcdefghijklmnopqrstuvwxyz0123456789") =>
        string.Concat(Enumerable.Range(0, length).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]));

    /// <summary>Đọc số nguyên tiền/số lượng: bỏ dấu chấm, khoảng trắng; null khi trống hoặc sai.</summary>
    public static int? ParseInt(string? value)
    {
        var raw = (value ?? "").Replace(".", "").Replace(" ", "").Replace(",", "").Trim();
        return raw.Length > 0 && raw.All(char.IsDigit) && long.TryParse(raw, out var n) && n <= int.MaxValue ? (int)n : null;
    }

    public static bool IsBlank(string? value) => string.IsNullOrWhiteSpace(value);

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    public static bool IsEmail(string? value) => value is not null && EmailPattern().IsMatch(value.Trim());

    /// <summary>Số điện thoại cố định hoặc di động: 10–11 chữ số, bắt đầu bằng 0.</summary>
    public static bool IsLandlineOrMobile(string digits) => digits.Length is 10 or 11 && digits[0] == '0';
}
