using SevenEleven.Core.Services;

namespace SevenEleven.Web.Infrastructure;

/// <summary>
/// Chạy việc định kỳ của chương trình thành viên (xét giữ hạng, sao hết hạn) ngay khi máy chủ khởi
/// động rồi mỗi giờ một lần. Việc này chạy lại bao nhiêu lần cũng đúng, nên chỉ cần đều đặn — đúng
/// ngày 1 hằng tháng là các tháng vừa kết thúc được xét.
/// </summary>
public class MembershipReviewJob(IServiceScopeFactory scopes, ILogger<MembershipReviewJob> log) : BackgroundService
{
    private static readonly TimeSpan Every = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Every);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var changed = await scope.ServiceProvider.GetRequiredService<MembershipReviewService>().RunAsync(DateTime.Now);
                if (changed > 0) log.LogInformation("Xét hạng thành viên: {Count} người thay đổi", changed);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // Lỗi một lần (ví dụ đang tạo lại dữ liệu mẫu) thì lần sau chạy lại; không làm sập máy chủ.
                log.LogWarning(e, "Xét hạng thành viên chưa chạy được, sẽ thử lại sau");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
