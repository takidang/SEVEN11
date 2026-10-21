using System.Text.RegularExpressions;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Số điện thoại di động Việt Nam, giống lib/phone.ts.</summary>
public static partial class Phone
{
    [GeneratedRegex(@"^0(3|5|7|8|9)\d{8}$")]
    private static partial Regex Pattern();

    public const string Rule = "Số điện thoại gồm 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09";

    /// <summary>Bỏ khoảng trắng, dấu chấm, gạch, đổi +84 thành 0.</summary>
    public static string Normalize(string? phone)
    {
        var digits = Regex.Replace(phone ?? "", @"[^\d+]", "");
        return digits.StartsWith("+84") ? "0" + digits[3..] : digits;
    }

    public static bool IsValid(string normalized) => Pattern().IsMatch(normalized);

    /// <summary>
    /// Số để đọc, giống formatPhone bên Next.js: di động "0901 234 567"; máy bàn Hà Nội / TP HCM
    /// "028 7300 1006"; tỉnh khác "0274 390 0102". Số lạ giữ nguyên.
    /// </summary>
    public static string Format(string? phone)
    {
        if (string.IsNullOrEmpty(phone)) return "";
        var d = new string(phone.Where(char.IsDigit).ToArray());
        if (d.Length == 11 && (d.StartsWith("024") || d.StartsWith("028"))) return $"{d[..3]} {d[3..7]} {d[7..]}";
        if (d.Length == 11 && d.StartsWith("02")) return $"{d[..4]} {d[4..7]} {d[7..]}";
        if (d.Length == 10) return $"{d[..4]} {d[4..7]} {d[7..]}";
        return phone;
    }
}
