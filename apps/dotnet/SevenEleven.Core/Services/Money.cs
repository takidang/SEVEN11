using System.Globalization;

namespace SevenEleven.Core.Services;

/// <summary>Tiền luôn là số nguyên VND, hiển thị theo kiểu Việt Nam: 1.234.000 ₫.</summary>
public static class Money
{
    private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

    public static string Format(long amount) => amount.ToString("#,##0", Vi) + " ₫";

    public static string Format(double amount) => Format((long)Math.Round(amount));

    /// <summary>Số âm hiện dấu trừ thật ("− 1.200.000 ₫") để không lẫn với gạch nối.</summary>
    public static string Signed(long amount) => amount < 0 ? "− " + Format(-amount) : Format(amount);

    /// <summary>Gọn cho thẻ số liệu và trục biểu đồ: 3,2 tỷ · 12,5 tr · 45k.</summary>
    public static string FormatCompact(long amount) => Math.Abs(amount) switch
    {
        >= 1_000_000_000 => (amount / 1_000_000_000d).ToString("0.##", Vi) + " tỷ",
        >= 1_000_000 => (amount / 1_000_000d).ToString("0.#", Vi) + " tr",
        >= 1_000 => (amount / 1_000d).ToString("0.#", Vi) + "k",
        _ => Format(amount),
    };

    public static string FormatNumber(long value) => value.ToString("#,##0", Vi);

    public static string FormatNumber(double value, int decimals) => value.ToString("#,##0." + new string('#', decimals), Vi);

    public static string Percent(double ratio) => (ratio * 100).ToString("0.#", Vi) + "%";

    /// <summary>"+12,5%" / "−3%" cho mức thay đổi so với kỳ trước.</summary>
    public static string Change(double ratio) => (ratio >= 0 ? "+" : "−") + (Math.Abs(ratio) * 100).ToString("0.#", Vi) + "%";
}
