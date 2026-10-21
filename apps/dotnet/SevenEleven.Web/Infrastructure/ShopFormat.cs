using System.Globalization;
using System.Text;
using SevenEleven.Core.Models;
using SevenEleven.Core.Services;

namespace SevenEleven.Web.Infrastructure;

/// <summary>Đường dẫn của cửa hàng online, giống hệt bản Next.js.</summary>
public static class ShopUrls
{
    public const string Home = "/";
    public const string Promotions = "/khuyen-mai";
    public const string Membership = "/thanh-vien";
    public const string Account = "/tai-khoan";
    public const string SignIn = "/dang-nhap";
    public const string Cart = "/gio-hang";
    public const string Stores = "/cua-hang";
    public const string Search = "/tim-kiem";
    public const string Staff = "/Admin";

    public static string Product(string slug) => "/san-pham/" + Uri.EscapeDataString(slug);

    public static string Category(string slug, string? nhom = null, string? sapxep = null)
    {
        var query = new List<string>();
        if (!string.IsNullOrEmpty(nhom)) query.Add("nhom=" + Uri.EscapeDataString(nhom));
        if (!string.IsNullOrEmpty(sapxep)) query.Add("sapxep=" + Uri.EscapeDataString(sapxep));
        return "/danh-muc/" + Uri.EscapeDataString(slug) + (query.Count > 0 ? "?" + string.Join("&", query) : "");
    }

    public static string Order(string code) => "/don-hang/" + Uri.EscapeDataString(code);

    public static string AccountTab(string tab) => tab == "tong-quan" ? Account : $"{Account}?tab={tab}";

    public static string SignInNext(string next) => $"{SignIn}?next={Uri.EscapeDataString(next)}";

    public static string SignUpNext(string next) => $"{SignIn}?tab=dang-ky&next={Uri.EscapeDataString(next)}";

    /// <summary>
    /// Chỉ cho quay về đường dẫn trong cùng trang web (giống safeNextPath của bản Next.js): phải bắt
    /// đầu bằng "/", không phải "//" hay có "\", và không vòng lại trang đăng nhập.
    /// </summary>
    public static string SafeNext(string? value, string fallback = Account)
    {
        if (string.IsNullOrEmpty(value) || !value.StartsWith('/') || value.StartsWith("//") || value.Contains('\\')) return fallback;
        if (value.StartsWith(SignIn, StringComparison.OrdinalIgnoreCase) || value.StartsWith("/Account/Login", StringComparison.OrdinalIgnoreCase)
            || value.StartsWith("/Account/Register", StringComparison.OrdinalIgnoreCase)) return fallback;
        return value;
    }
}

/// <summary>Định dạng hiển thị dùng chung cho các trang cửa hàng (giống lib/format.ts).</summary>
public static class Fmt
{
    private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    public static string Vnd(long amount) => Money.Format(amount);

    public static string Num(long value) => Money.FormatNumber(value);

    /// <summary>"20k", "1,5 tr".</summary>
    public static string Compact(long amount) => Money.FormatCompact(amount);

    /// <summary>"20K", "9K" — chữ trên vé voucher và banner.</summary>
    public static string CompactUpper(long amount) => Money.FormatCompact(amount).ToUpperInvariant();

    public static string Date(DateTime d) => d.ToString("dd/MM/yyyy", Inv);

    public static string Time(DateTime d) => d.ToString("HH:mm", Inv);

    public static string DateTime(DateTime d) => d.ToString("dd/MM/yyyy HH:mm", Inv);

    /// <summary>"Thứ Ba, 06/10/2026".</summary>
    public static string LongDate(DateTime d)
    {
        var day = Vi.DateTimeFormat.GetDayName(d.DayOfWeek);
        var text = $"{day}, {d.ToString("dd/MM/yyyy", Inv)}";
        return char.ToUpper(text[0], Vi) + text[1..];
    }

    /// <summary>Số cho thuộc tính CSS/JS: luôn dấu chấm thập phân, máy chạy tiếng Việt cũng vậy.</summary>
    public static string Css(double value) => Math.Round(value, 2).ToString("0.##", Inv);

    /// <summary>"0901234567" → "0901 234 567".</summary>
    public static string Phone(string? phone)
    {
        var d = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (d.Length == 11 && (d.StartsWith("024") || d.StartsWith("028"))) return $"{d[..3]} {d[3..7]} {d[7..]}";
        if (d.Length == 11 && d.StartsWith("02")) return $"{d[..4]} {d[4..7]} {d[7..]}";
        if (d.Length == 10) return $"{d[..4]} {d[4..7]} {d[7..]}";
        return phone ?? "";
    }

    /// <summary>Chữ viết tắt trên ảnh đại diện: "Trần Thu Hà" → "TH".</summary>
    public static string Initials(string? fullName)
    {
        var parts = (fullName ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => new string(p.Where(char.IsLetter).ToArray()))
            .Where(p => p.Length > 0)
            .ToList();
        if (parts.Count == 0) return "?";
        if (parts.Count == 1) return parts[0][..Math.Min(2, parts[0].Length)].ToUpper(Vi);
        return (parts[^2][..1] + parts[^1][..1]).ToUpper(Vi);
    }

    /// <summary>Phần trăm giảm hiển thị: làm tròn như Math.round của JavaScript.</summary>
    public static int? DiscountPercent(int price, int? compareAt) =>
        compareAt is int c && c > price ? (int)Math.Round((c - price) * 100.0 / c, MidpointRounding.AwayFromZero) : null;

    /// <summary>"2 giờ 15 phút" tới mốc <paramref name="to"/>.</summary>
    public static string DurationUntil(DateTime to, DateTime now)
    {
        var minutes = Math.Max(1, (int)Math.Ceiling((to - now).TotalMinutes));
        var h = minutes / 60;
        var m = minutes % 60;
        var parts = new List<string>();
        if (h > 0) parts.Add($"{h} giờ");
        if (m > 0) parts.Add($"{m} phút");
        return string.Join(" ", parts);
    }

    /// <summary>Số giây còn lại (không âm) — đếm ngược chạy theo đồng hồ của trình duyệt kể từ lúc tải trang.</summary>
    public static long SecondsLeft(DateTime to, DateTime now) => Math.Max(0, (long)Math.Floor((to - now).TotalSeconds));

    /// <summary>"02:14:09".</summary>
    public static string Clock(long seconds)
    {
        seconds = Math.Max(0, seconds);
        return $"{seconds / 3600:00}:{seconds % 3600 / 60:00}:{seconds % 60:00}";
    }

    /// <summary>"Hồng Trà Sữa" → "hồng trà sữa" cho câu thông báo; giữ nguyên chữ hoa đầu tên riêng thì dùng chuỗi gốc.</summary>
    public static string LowerFirst(string text) => string.IsNullOrEmpty(text) ? text : char.ToLower(text[0], Vi) + text[1..];

    public static string Join(IEnumerable<string> parts, string separator = " · ") =>
        string.Join(separator, parts.Where(p => !string.IsNullOrWhiteSpace(p)));
}

/// <summary>Ảnh sản phẩm/danh mục: ảnh trên CDN của 7-Eleven được cắt đúng cỡ hiển thị (gấp đôi cho màn hình nét).</summary>
public static class ShopImages
{
    private const string Cdn = "https://image-cdn.7-eleven.vn/crop";

    public static string Url(string? src, int cssSize)
    {
        if (string.IsNullOrEmpty(src)) return "";
        if (!src.StartsWith("https://cdn.7-eleven.vn/", StringComparison.Ordinal)) return src;
        var px = Math.Min((int)Math.Round(cssSize * 2.0), 800);
        return $"{Cdn}?type=webp&width={px}&height={px}&url={Uri.EscapeDataString(src)}";
    }

    /// <summary>
    /// Sản phẩm có ảnh tách nền sạch (không khung "Giao hàng 24 phút", không tem giá) — đo một lần từ
    /// viền ảnh ở bản Next.js (clean-photos.ts). Ảnh banner ưu tiên các sản phẩm này.
    /// </summary>
    public static readonly HashSet<string> CleanPhotoIds = new(
        """
        p0017 p0018 p0019 p0020 p0021 p0030 p0031 p0032 p0037 p0039 p0040 p0042 p0044 p0045 p0047 p0048
        p0049 p0051 p0052 p0069 p0070 p0071 p0079 p0080 p0081 p0082 p0085 p0086 p0095 p0113 p0114 p0115
        p0116 p0125 p0126 p0127 p0128 p0129 p0132 p0133 p0140 p0141 p0142 p0143 p0144 p0145 p0146 p0152
        p0153 p0154 p0155 p0156 p0157 p0158 p0161 p0162 p0163 p0164 p0165 p0166 p0167 p0168 p0169 p0170
        p0175 p0176 p0178 p0179 p0180 p0182 p0185 p0186 p0187 p0188 p0189 p0190 p0192 p0193 p0194 p0195
        p0196 p0197 p0199 p0200 p0201 p0203 p0204 p0205 p0206 p0207 p0208 p0209 p0210 p0211 p0212 p0213
        p0215 p0218 p0220 p0221 p0222 p0223 p0224 p0225 p0226 p0228 p0229 p0230 p0233 p0234 p0235 p0236
        p0237 p0238 p0239 p0240 p0241 p0242 p0243 p0245 p0246 p0248 p0252 p0253 p0254 p0255 p0256 p0257
        p0261 p0264 p0265 p0266 p0274 p0275 p0276 p0278 p0279 p0280 p0282 p0283 p0284 p0285 p0286 p0291
        p0295 p0296 p0298 p0301 p0304 p0307 p0308 p0309 p0310 p0314 p0315 p0316 p0322 p0324 p0325 p0326
        p0327 p0328 p0329 p0330 p0331 p0333 p0334 p0335 p0336 p0338 p0339 p0341 p0342 p0343 p0344 p0345
        p0346 p0347 p0349 p0352 p0361 p0362
        """.Split(new[] { ' ', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries));
}

/// <summary>Màu và nhãn theo hạng thành viên (lớp CSS trong shop.css).</summary>
public static class TierStyle
{
    public static string Key(MemberTier tier) => tier switch
    {
        MemberTier.Silver => "silver",
        MemberTier.Gold => "gold",
        MemberTier.Diamond => "diamond",
        _ => "bronze",
    };

    /// <summary>Chip/huy hiệu nhỏ: nền gradient nhạt, chữ đậm cùng tông.</summary>
    public static string Chip(MemberTier tier) => "tier-chip tier-" + Key(tier);

    /// <summary>Bề mặt lớn: thẻ thành viên, cột hạng trong bảng.</summary>
    public static string Face(MemberTier tier) => "tier-face tier-" + Key(tier);

    public static string Label(MemberTier tier) => MembershipService.Info(tier).Label;
}

/// <summary>Tông màu nhãn trạng thái (StatusBadge của bản Next.js).</summary>
public static class Tones
{
    public static string Order(OrderStatus s) => s switch
    {
        OrderStatus.Pending => "warning",
        OrderStatus.Confirmed => "info",
        OrderStatus.Preparing => "orange",
        OrderStatus.Delivering => "info",
        OrderStatus.Completed => "fresh",
        _ => "danger",
    };

    public static Microsoft.AspNetCore.Html.IHtmlContent Badge(string tone, string label, bool dot = true, string? extra = null)
    {
        var sb = new StringBuilder();
        sb.Append("<span class=\"badge tone-").Append(tone);
        if (!string.IsNullOrEmpty(extra)) sb.Append(' ').Append(extra);
        sb.Append("\">");
        if (dot) sb.Append("<span class=\"badge-dot\" aria-hidden=\"true\"></span>");
        sb.Append(System.Net.WebUtility.HtmlEncode(label)).Append("</span>");
        return new Microsoft.AspNetCore.Html.HtmlString(sb.ToString());
    }
}

/// <summary>Khối "trống" của cửa hàng: biểu tượng trong vòng tròn xám, một dòng giải thích, một nút.</summary>
public sealed record EmptyState(string Icon, string Title, string? Description = null, string? ActionLabel = null, string? ActionHref = null,
    string Css = "soft", string ActionCss = "");
