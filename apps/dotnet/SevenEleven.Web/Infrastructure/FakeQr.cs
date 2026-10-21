using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Html;

namespace SevenEleven.Web.Infrastructure;

/// <summary>
/// Mã QR minh hoạ cho thanh toán ví / chuyển khoản ở quầy: có ba ô định vị như QR thật, phần còn lại
/// là các ô bật/tắt theo băm của nội dung. Không quét được — bản demo không nối cổng thanh toán thật.
/// </summary>
public static class FakeQr
{
    private const int N = 25;

    public static IHtmlContent Svg(string value, int size = 148)
    {
        var bits = new List<bool>();
        var seed = Encoding.UTF8.GetBytes(value);
        for (var round = 0; bits.Count < N * N; round++)
        {
            var hash = SHA256.HashData([.. seed, (byte)round]);
            foreach (var b in hash)
                for (var i = 0; i < 8; i++) bits.Add((b >> i & 1) == 1);
        }
        var sb = new StringBuilder();
        sb.Append($"""<svg class="fake-qr" width="{size}" height="{size}" viewBox="0 0 {N + 2} {N + 2}" role="img" aria-label="Mã QR thanh toán (minh hoạ)" shape-rendering="crispEdges"><rect width="{N + 2}" height="{N + 2}" fill="#fff"/>""");
        for (var y = 0; y < N; y++)
        for (var x = 0; x < N; x++)
        {
            if (InFinder(x, y)) continue;
            if (bits[y * N + x]) sb.Append($"""<rect x="{x + 1}" y="{y + 1}" width="1" height="1"/>""");
        }
        foreach (var (fx, fy) in new[] { (0, 0), (N - 7, 0), (0, N - 7) })
        {
            sb.Append($"""<rect x="{fx + 1}" y="{fy + 1}" width="7" height="7"/><rect x="{fx + 2}" y="{fy + 2}" width="5" height="5" fill="#fff"/><rect x="{fx + 3}" y="{fy + 3}" width="3" height="3"/>""");
        }
        sb.Append("</svg>");
        return new HtmlString(sb.ToString());
    }

    private static bool InFinder(int x, int y) =>
        (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
}
