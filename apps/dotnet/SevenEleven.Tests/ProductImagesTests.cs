using System.Text;
using SevenEleven.Core.Services;

namespace SevenEleven.Tests;

/// <summary>Ảnh sản phẩm tải lên: chỉ JPG/PNG/WEBP thật (xét byte đầu file), tối đa 2 MB.</summary>
public sealed class ProductImagesTests
{
    private static readonly byte[] Jpg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, (byte)'J', (byte)'F', (byte)'I', (byte)'F', 0, 1];
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D];
    private static readonly byte[] Webp = Encoding.ASCII.GetBytes("RIFF\x24\0\0\0WEBP");

    [Theory]
    [InlineData("anh.jpg", ".jpg")]
    [InlineData("ANH.JPEG", ".jpg")]
    public void Real_jpeg_is_accepted(string name, string ext)
    {
        var check = ProductImages.Validate(name, 150_000, Jpg);
        Assert.True(check.Ok, check.Error);
        Assert.Equal(ext, check.Extension);
    }

    [Fact]
    public void Png_and_webp_are_accepted_and_typed_by_content()
    {
        Assert.Equal(".png", ProductImages.Validate("a.png", 10, Png).Extension);
        Assert.Equal(".webp", ProductImages.Validate("a.webp", 10, Webp).Extension);
        // Đuôi .png nhưng nội dung là JPEG: lưu theo nội dung thật.
        Assert.Equal(".jpg", ProductImages.Validate("a.png", 10, Jpg).Extension);
    }

    [Fact]
    public void Exactly_two_megabytes_is_allowed_but_one_byte_more_is_not()
    {
        Assert.True(ProductImages.Validate("a.jpg", ProductImages.MaxBytes, Jpg).Ok);
        Assert.Equal("Ảnh tối đa 2 MB (file này 2 MB)", ProductImages.Validate("a.jpg", ProductImages.MaxBytes + 1, Jpg).Error);
        Assert.Equal("Ảnh tối đa 2 MB (file này 3,5 MB)", ProductImages.Validate("a.jpg", (long)(3.5 * 1024 * 1024), Jpg).Error);
    }

    [Fact]
    public void Other_types_and_fake_images_are_rejected()
    {
        Assert.Equal("Chỉ nhận ảnh JPG, PNG hoặc WEBP", ProductImages.Validate("a.gif", 10, Encoding.ASCII.GetBytes("GIF89a......")).Error);
        Assert.Equal("Chỉ nhận ảnh JPG, PNG hoặc WEBP", ProductImages.Validate("a.pdf", 10, Jpg).Error);
        Assert.Equal("File không phải ảnh JPG, PNG hoặc WEBP hợp lệ", ProductImages.Validate("ghi-chu.jpg", 10, Encoding.ASCII.GetBytes("xin chao ban")).Error);
        Assert.Equal("File ảnh trống", ProductImages.Validate("a.jpg", 0, []).Error);
    }

    [Theory]
    [InlineData("/uploads/products/abc123.webp", true)]
    [InlineData("/uploads/products/../appsettings.json", false)]
    [InlineData("/uploads/products/sub/abc.jpg", false)]
    [InlineData("https://cdn.7-eleven.vn/a.jpg", false)]
    [InlineData(null, false)]
    public void Only_files_in_the_upload_folder_count_as_uploaded(string? path, bool expected) =>
        Assert.Equal(expected, ProductImages.IsUploaded(path));
}
