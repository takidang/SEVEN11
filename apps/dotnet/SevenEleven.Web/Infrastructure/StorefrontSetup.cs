using Microsoft.AspNetCore.Authentication.Cookies;

namespace SevenEleven.Web.Infrastructure;

/// <summary>
/// Đăng ký phần cửa hàng online: dịch vụ dùng chung cho các trang, đường dẫn tiếng Việt như bản
/// Next.js (/khuyen-mai, /gio-hang, /san-pham/...) và trang lỗi 404 thân thiện. Đường dẫn cũ
/// (/Cart, /Account/Login, /Catalog/Product?slug=...) vẫn chạy song song.
/// </summary>
public static class StorefrontSetup
{
    public static IServiceCollection AddStorefront(this IServiceCollection services)
    {
        services.AddScoped<ShopContext>();
        // Khách chưa đăng nhập mở trang cần đăng nhập thì về /dang-nhap?next=..., giống bản Next.js.
        services.PostConfigure<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme, o =>
        {
            o.LoginPath = ShopUrls.SignIn;
            o.AccessDeniedPath = ShopUrls.SignIn;
            o.ReturnUrlParameter = "next";
        });
        return services;
    }

    /// <summary>Đường dẫn không tồn tại (và lỗi khác không kèm nội dung) hiện trang lỗi thân thiện thay vì trang trắng.</summary>
    public static IApplicationBuilder UseStorefrontErrorPages(this IApplicationBuilder app) =>
        app.UseStatusCodePagesWithReExecute("/loi/{0}");

    /// <summary>
    /// Đường dẫn thân thiện, đăng ký trước tuyến mặc định nên mọi liên kết sinh ra từ asp-action cũng
    /// dùng dạng tiếng Việt. Tuyến mặc định phía sau vẫn nhận đường dẫn cũ.
    /// </summary>
    public static IEndpointRouteBuilder MapStorefrontRoutes(this IEndpointRouteBuilder app)
    {
        void Map(string name, string pattern, string controller, string action) =>
            app.MapControllerRoute(name, pattern, new { controller, action });

        Map("shop-promotions", "khuyen-mai", "Home", "Promotions");
        Map("shop-membership", "thanh-vien", "Home", "Membership");
        Map("shop-account", "tai-khoan", "Account", "Index");
        Map("shop-sign-in", "dang-nhap", "Account", "Login");
        Map("shop-cart", "gio-hang", "Cart", "Index");
        Map("shop-product", "san-pham/{slug}", "Catalog", "Product");
        Map("shop-category", "danh-muc/{slug}", "Catalog", "Category");
        Map("shop-search", "tim-kiem", "Catalog", "Search");
        Map("shop-stores", "cua-hang", "Store", "Index");
        Map("shop-order", "don-hang/{code}", "Order", "Detail");
        // Dạng đường dẫn cũ /Order/Detail/{mã} (bên cạnh /Order/Detail?code=...) cũng mở được đơn.
        Map("shop-order-legacy", "Order/Detail/{code}", "Order", "Detail");
        return app;
    }
}
