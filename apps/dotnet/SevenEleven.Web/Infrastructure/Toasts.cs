using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ViewFeatures;

namespace SevenEleven.Web.Infrastructure;

/// <summary>
/// Thông báo nổi (toast) như sonner của bản Next.js. Máy chủ gửi qua TempData sau mỗi thao tác rồi
/// layout vẽ ra; thao tác chạy bằng fetch thì trả về JSON để shop.js vẽ ngay.
/// </summary>
public sealed record Toast(
    string Title,
    string? Desc = null,
    /// <summary>success · error · info · sms</summary>
    string Tone = "success",
    ToastAction? Action = null,
    /// <summary>Mili giây; null là 4 giây (lỗi 6 giây).</summary>
    int? Duration = null);

/// <summary>Nút trên toast: liên kết thường, hoặc một form POST nhỏ (ví dụ "Hoàn tác").</summary>
public sealed record ToastAction(string Label, string Href, Dictionary<string, string>? Post = null);

public static class Toasts
{
    private const string Key = "Toasts";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void Add(ITempDataDictionary tempData, Toast toast)
    {
        var list = Peek(tempData);
        list.Add(toast);
        tempData[Key] = JsonSerializer.Serialize(list, Json);
    }

    private static List<Toast> Peek(ITempDataDictionary tempData) =>
        tempData.Peek(Key) is string json ? JsonSerializer.Deserialize<List<Toast>>(json, Json) ?? [] : [];

    /// <summary>Đọc (và xoá) mọi toast đang chờ, gồm cả TempData["Toast"]/["Error"] kiểu cũ.</summary>
    public static List<Toast> Take(ITempDataDictionary tempData)
    {
        var list = tempData[Key] is string json ? JsonSerializer.Deserialize<List<Toast>>(json, Json) ?? [] : [];
        if (tempData["Toast"] is string ok) list.Insert(0, new Toast(ok));
        if (tempData["Error"] is string error) list.Insert(0, new Toast(error, Tone: "error"));
        return list;
    }

    public static string ToJson(Toast toast) => JsonSerializer.Serialize(toast, Json);

    public static void Toast(this Controller controller, string title, string? desc = null, ToastAction? action = null) =>
        Add(controller.TempData, new Toast(title, desc, "success", action));

    public static void ToastError(this Controller controller, string title, string? desc = null) =>
        Add(controller.TempData, new Toast(title, desc, "error"));

    public static void ToastInfo(this Controller controller, string title, string? desc = null) =>
        Add(controller.TempData, new Toast(title, desc, "info"));

    /// <summary>Thao tác gửi bằng fetch (shop.js) thì trả JSON thay vì chuyển trang.</summary>
    public static bool IsFetch(this HttpRequest request) => request.Headers["X-Requested-With"] == "fetch";
}
