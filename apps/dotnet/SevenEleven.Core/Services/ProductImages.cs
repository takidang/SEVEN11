namespace SevenEleven.Core.Services;

/// <summary>
/// Luật ảnh sản phẩm tải lên: chỉ JPG, PNG, WEBP, tối đa 2 MB. Loại ảnh xác định theo các byte đầu
/// file chứ không tin đuôi tên file, nên một file chữ đổi đuôi thành .jpg vẫn bị từ chối. Ảnh lưu ở
/// <see cref="Folder"/> và sản phẩm giữ đường dẫn tương đối tới nó.
/// </summary>
public static class ProductImages
{
    public const long MaxBytes = 2 * 1024 * 1024;
    public const string Folder = "/uploads/products/";
    /// <summary>Đuôi tên file được chấp nhận ở ô chọn file; nội dung thật vẫn được kiểm tra.</summary>
    public static readonly string[] Extensions = [".jpg", ".jpeg", ".png", ".webp"];
    private static readonly System.Globalization.CultureInfo Vi = System.Globalization.CultureInfo.GetCultureInfo("vi-VN");

    public record Check(string? Extension, string? Error)
    {
        public bool Ok => Error is null;
    }

    /// <param name="fileName">Tên file người dùng chọn.</param>
    /// <param name="length">Kích thước file (byte).</param>
    /// <param name="head">Ít nhất 12 byte đầu file.</param>
    public static Check Validate(string? fileName, long length, ReadOnlySpan<byte> head)
    {
        if (length <= 0) return new(null, "File ảnh trống");
        if (length > MaxBytes)
            return new(null, string.Create(Vi, $"Ảnh tối đa 2 MB (file này {length / 1024.0 / 1024.0:0.#} MB)"));
        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        if (!Extensions.Contains(ext)) return new(null, "Chỉ nhận ảnh JPG, PNG hoặc WEBP");
        var kind = Sniff(head);
        if (kind is null) return new(null, "File không phải ảnh JPG, PNG hoặc WEBP hợp lệ");
        return new(kind, null);
    }

    /// <summary>Đuôi file đúng với nội dung (".jpg", ".png", ".webp"), hoặc null nếu không phải ba loại này.</summary>
    public static string? Sniff(ReadOnlySpan<byte> h)
    {
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return ".jpg";
        if (h.Length >= 8 && h[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return ".png";
        if (h.Length >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WEBP"u8)) return ".webp";
        return null;
    }

    /// <summary>Ảnh do hệ thống lưu (không phải đường dẫn ngoài): được phép xoá khi sản phẩm đổi ảnh.</summary>
    public static bool IsUploaded(string? path) =>
        path is not null && path.StartsWith(Folder, StringComparison.Ordinal) && !path.Contains("..") && path.IndexOf('/', Folder.Length) < 0;
}
