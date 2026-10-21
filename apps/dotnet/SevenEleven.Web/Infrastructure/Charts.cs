using System.Globalization;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Một cột: nhãn trục ngang, giá trị, chữ hiện khi rê chuột.</summary>
public record ChartBar(string Tick, double Value, string Tip, bool Highlight = false);

/// <summary>
/// Biểu đồ cột một chuỗi số, một trục dọc (không bao giờ hai trục). Đường lưới mảnh, cột ≤ 24px,
/// bo 4px ở đầu dữ liệu, rê chuột hiện số — theo quy tắc biểu đồ trong design-system.md.
/// </summary>
public record ColumnChart(string Label, List<ChartBar> Bars, double Max, List<(double Value, string Text)> Ticks, int LabelEvery)
{
    public string Height(double value) => (Max > 0 ? Math.Max(0, value) / Max * 100 : 0).ToString("0.##", CultureInfo.InvariantCulture);
}

/// <summary>Một thanh ngang: tên, giá trị, chữ số in bên phải.</summary>
public record HBar(string Label, string? Sub, double Value, string ValueText, bool Negative = false, string? Href = null);

public record HBarList(List<HBar> Bars)
{
    public double Max => Bars.Count == 0 ? 0 : Bars.Max(b => Math.Abs(b.Value));
    public string Width(double value) => (Max > 0 ? Math.Abs(value) / Max * 100 : 0).ToString("0.##", CultureInfo.InvariantCulture);
}

/// <summary>Một đường của biểu đồ đường; giá trị null là điểm chưa có (giờ chưa tới) nên đường dừng ở đó.</summary>
public record LineSeries(string Name, string Css, double?[] Values);

/// <summary>Biểu đồ đường nhiều chuỗi chung một trục dọc; mỗi điểm trên trục ngang có một ô rê chuột hiện số.</summary>
public record LineChart(string Label, List<string> XTicks, List<LineSeries> Series, List<string> Tips, double Max,
    List<(double Value, string Text)> Ticks, int LabelEvery, int? Highlight = null)
{
    public const int Step = 10;
    public int Width => Math.Max(1, XTicks.Count) * Step;
    private string Y(double value) => (100 - (Max > 0 ? Math.Max(0, value) / Max * 100 : 0)).ToString("0.##", CultureInfo.InvariantCulture);
    private static string X(int i) => (i * Step + Step / 2.0).ToString("0.#", CultureInfo.InvariantCulture);
    public string Height(double value) => (Max > 0 ? Math.Max(0, value) / Max * 100 : 0).ToString("0.##", CultureInfo.InvariantCulture);

    /// <summary>Toạ độ polyline của một chuỗi, dừng ở giá trị null đầu tiên.</summary>
    public string Points(LineSeries series) =>
        string.Join(" ", series.Values.TakeWhile(v => v is not null).Select((v, i) => $"{X(i)},{Y(v!.Value)}"));
}

public static class Charts
{
    public static LineChart Lines(string label, List<string> xTicks, List<LineSeries> series, List<string> tips, Func<double, string> axis, int labelEvery = 1, int? highlight = null)
    {
        var top = series.SelectMany(s => s.Values).Where(v => v is not null).Select(v => v!.Value).DefaultIfEmpty(0).Max();
        var step = NiceStep(top / 4);
        var ticks = Enumerable.Range(0, 5).Select(i => (i * step, axis(i * step))).ToList();
        return new LineChart(label, xTicks, series, tips, step * 4, ticks, Math.Max(1, labelEvery), highlight);
    }

    /// <summary>Dựng biểu đồ cột với trục chia 4 khoảng tròn số.</summary>
    public static ColumnChart Columns(string label, List<ChartBar> bars, Func<double, string> axis, int labelEvery = 1)
    {
        var top = bars.Count == 0 ? 0 : bars.Max(b => b.Value);
        var step = NiceStep(top / 4);
        var max = step * 4;
        var ticks = Enumerable.Range(0, 5).Select(i => (i * step, axis(i * step))).ToList();
        return new ColumnChart(label, bars, max, ticks, Math.Max(1, labelEvery));
    }

    /// <summary>Bước chia tròn: 1, 2, 2,5 hoặc 5 nhân luỹ thừa của 10.</summary>
    public static double NiceStep(double raw)
    {
        if (raw <= 0) return 1;
        var exponent = Math.Floor(Math.Log10(raw));
        var unit = Math.Pow(10, exponent);
        var fraction = raw / unit;
        var nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
        return nice * unit;
    }
}

/// <summary>Thời gian kiểu "3 phút trước", "hôm qua 14:20".</summary>
public static class TimeText
{
    public static string Relative(DateTime at, DateTime now)
    {
        var diff = now - at;
        if (diff.TotalMinutes < 1) return "vừa xong";
        if (diff.TotalMinutes < 60) return $"{(int)diff.TotalMinutes} phút trước";
        if (at.Date == now.Date) return $"{(int)diff.TotalHours} giờ trước";
        if (at.Date == now.Date.AddDays(-1)) return $"hôm qua {at:HH:mm}";
        return at.ToString("HH:mm dd/MM");
    }

    public static string Weekday(DateTime d) => d.DayOfWeek switch
    {
        DayOfWeek.Monday => "Thứ Hai",
        DayOfWeek.Tuesday => "Thứ Ba",
        DayOfWeek.Wednesday => "Thứ Tư",
        DayOfWeek.Thursday => "Thứ Năm",
        DayOfWeek.Friday => "Thứ Sáu",
        DayOfWeek.Saturday => "Thứ Bảy",
        _ => "Chủ Nhật",
    };

    public static string WeekdayShort(DateTime d) => d.DayOfWeek == DayOfWeek.Sunday ? "CN" : $"T{(int)d.DayOfWeek + 1}";
}
