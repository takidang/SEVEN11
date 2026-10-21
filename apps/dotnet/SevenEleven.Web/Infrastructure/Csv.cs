using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Một ô tiền (số nguyên VND) hoặc phần trăm trong file CSV.</summary>
public record CsvPercent(double? Ratio);

/// <summary>
/// File CSV mở được bằng Excel tiếng Việt, theo đúng bản Next.js (csv.ts): UTF-8 có BOM, dấu phẩy,
/// xuống dòng CRLF, trích dẫn theo RFC 4180, và chặn công thức (ô chữ bắt đầu bằng = + - @ được thêm ').
/// </summary>
public partial class CsvWriter
{
    private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");
    private readonly StringBuilder _sb = new();

    [GeneratedRegex(@"^-?[\d.,]+%?$")] private static partial Regex NumberLike();

    public CsvWriter Row(params object?[] cells)
    {
        _sb.Append(string.Join(",", cells.Select(Cell))).Append("\r\n");
        return this;
    }

    public CsvWriter Blank()
    {
        _sb.Append("\r\n");
        return this;
    }

    private static string Cell(object? value)
    {
        var text = value switch
        {
            null => "",
            int i => i.ToString(CultureInfo.InvariantCulture),
            long l => l.ToString(CultureInfo.InvariantCulture),
            double d when double.IsNaN(d) => "",
            double d => Math.Round(d, 4).ToString(CultureInfo.InvariantCulture),
            DateTime t => t.ToString("dd/MM/yyyy"),
            CsvPercent { Ratio: null } => "",
            CsvPercent p => (p.Ratio!.Value * 100).ToString("0.#", Vi) + "%",
            _ => value.ToString() ?? "",
        };
        if (value is string && text.Length > 0 && "=+-@\t\r".Contains(text[0]) && !NumberLike().IsMatch(text)) text = "'" + text;
        var mustQuote = text.Contains('"') || text.Contains(',') || text.Contains('\n') || text.Contains('\r') || text != text.Trim();
        return mustQuote ? "\"" + text.Replace("\"", "\"\"") + "\"" : text;
    }

    /// <summary>Nội dung file, có BOM để Excel nhận đúng tiếng Việt.</summary>
    public byte[] ToBytes() => Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(_sb.ToString())).ToArray();

    public override string ToString() => _sb.ToString();
}
