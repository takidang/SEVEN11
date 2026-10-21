# Test case – bản ASP.NET Core

Tài liệu kiểm thử cho các chức năng được giao từ ngày 21/10/2026 (xem `PLAN.md`, mục G).

| File | Nội dung |
| --- | --- |
| `TestCase_SEVEN11.xlsx` | Mỗi chức năng một sheet; sheet **Tổng hợp** tự đếm Pass / Fail / Chưa test. Tester điền các cột nền vàng. |
| `TestCase_1_DoiMatKhau.docx` | Đổi mật khẩu (`feat/change-password`): 16 test case, kèm ảnh chụp màn hình |
| `TestCase_2_KhoaDangNhap.docx` | Khoá đăng nhập sau 5 lần sai (`feat/login-lockout`): 11 test case, kèm ảnh chụp màn hình |

Cách chạy lại: `cd apps/dotnet/SevenEleven.Web && dotnet run --urls http://localhost:5711`. Tài khoản demo
dùng mật khẩu `123456`. Test tự động: `cd apps/dotnet && dotnet test`.

Ca có trạng thái **Pass** đã được chạy trên trình duyệt thật (Playwright, desktop 1366px và điện thoại
390px). Ca **Chưa test** để tester chạy tay.
