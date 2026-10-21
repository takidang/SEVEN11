using System.Text;

namespace SevenEleven.Web.Infrastructure;

/// <summary>
/// Mã vạch ITF (Interleaved 2 of 5) vẽ bằng SVG cho thẻ thành viên. Mã là số điện thoại, đúng thứ thu ngân
/// nhập khi tra khách ở quầy. Số chữ số lẻ thì thêm số 0 ở đầu như chuẩn ITF.
/// </summary>
public static class Barcode
{
    // Vạch hẹp / vạch rộng theo tỉ lệ 2,5.
    private const int Narrow = 2, Wide = 5;

    // Năm phần tử của mỗi chữ số, hai phần tử rộng.
    private static readonly string[] Patterns = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];

    public static string Itf(string text, string cssClass)
    {
        var digits = new string(text.Where(char.IsAsciiDigit).ToArray());
        if (digits.Length % 2 == 1) digits = "0" + digits;
        var path = new StringBuilder();
        var x = 0;
        void Bar(int w) { path.Append($"M{x} 0h{w}v40h-{w}z"); x += w; }
        void Space(int w) => x += w;

        Bar(Narrow); Space(Narrow); Bar(Narrow); Space(Narrow);
        for (var i = 0; i < digits.Length; i += 2)
        {
            // Chữ số thứ nhất của cặp nằm ở vạch đen, chữ số thứ hai ở khoảng trắng xen giữa.
            var bars = Patterns[digits[i] - '0'];
            var spaces = Patterns[digits[i + 1] - '0'];
            for (var k = 0; k < 5; k++)
            {
                Bar(bars[k] == 'w' ? Wide : Narrow);
                Space(spaces[k] == 'w' ? Wide : Narrow);
            }
        }
        Bar(Wide); Space(Narrow); Bar(Narrow);
        return $"""<svg class="{cssClass}" viewBox="0 0 {x} 40" preserveAspectRatio="none" aria-hidden="true"><path d="{path}" fill="currentColor"/></svg>""";
    }
}
