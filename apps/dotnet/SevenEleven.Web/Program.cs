using System.Text.Encodings.Web;
using System.Text.Unicode;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.WebEncoders;
using Microsoft.EntityFrameworkCore;
using SevenEleven.Core.Data;
using SevenEleven.Core.Services;
using SevenEleven.Web.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
// Giữ nguyên chữ tiếng Việt trong HTML thay vì đổi thành &#x...; (mặc định chỉ để nguyên chữ Latin cơ bản).
builder.Services.Configure<WebEncoderOptions>(o => o.TextEncoderSettings = new TextEncoderSettings(UnicodeRanges.All));

// SQLite cho máy cá nhân: không phải cài gì thêm. Đổi sang SQL Server chỉ cần đổi dòng UseSqlite
// thành UseSqlServer và chuỗi kết nối trong appsettings.json.
var connection = builder.Configuration.GetConnectionString("Default") ?? "Data Source=sevenEleven.db";
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<LoyaltyService>();
builder.Services.AddScoped<InventoryService>();
builder.Services.AddScoped<PurchasingService>();
builder.Services.AddScoped<MembershipReviewService>();
builder.Services.AddScoped<ShiftService>();
builder.Services.AddScoped<ProductAdminService>();
builder.Services.AddScoped<PromotionAdminService>();
builder.Services.AddScoped<ChainAdminService>();
builder.Services.AddScoped<CustomerAdminService>();
builder.Services.AddScoped<PasswordService>();
builder.Services.AddScoped<StockTransferService>();
builder.Services.AddScoped<ReturnService>();
builder.Services.AddSingleton<OtpService>();
builder.Services.AddHostedService<MembershipReviewJob>();
builder.Services.AddStorefront();

// Giỏ hàng nằm trong phiên làm việc, sống 2 giờ nếu khách bỏ dở.
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(o =>
{
    o.IdleTimeout = TimeSpan.FromHours(2);
    o.Cookie.HttpOnly = true;
    o.Cookie.IsEssential = true;
});
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CartStore>();
builder.Services.AddScoped<PosBillStore>();

// Đăng nhập bằng cookie, khách và nhân viên mỗi bên một cookie riêng: mở cửa hàng online và khu
// quản lý cùng lúc trên một trình duyệt không đá nhau ra. Vai trò nằm trong claim nên phân quyền
// chỉ cần [Authorize(Roles = ...)].
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = ".SevenEleven.Customer";
        o.LoginPath = "/Account/Login";
        o.AccessDeniedPath = "/Account/Login";
        o.ExpireTimeSpan = TimeSpan.FromDays(14);
        o.SlidingExpiration = true;
    })
    .AddCookie(StaffAuth.Scheme, o =>
    {
        o.Cookie.Name = ".SevenEleven.Staff";
        o.LoginPath = "/Admin/Account/Login";
        o.AccessDeniedPath = "/Admin/Account/Denied";
        o.ExpireTimeSpan = TimeSpan.FromHours(12);
        o.SlidingExpiration = true;
    });

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseStorefrontErrorPages();

app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.UseAuthentication();
app.UseAuthorization();

app.MapAreaControllerRoute("admin", "Admin", "Admin/{controller=Dashboard}/{action=Index}/{id?}");
app.MapStorefrontRoutes();
app.MapControllerRoute("default", "{controller=Home}/{action=Index}/{id?}");

// Tạo cơ sở dữ liệu và nạp dữ liệu mẫu ngay lần chạy đầu tiên.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var dataPath = Path.Combine(app.Environment.ContentRootPath, "Data");
    await SeedData.EnsureSeededAsync(db, dataPath);
}

app.Run();
