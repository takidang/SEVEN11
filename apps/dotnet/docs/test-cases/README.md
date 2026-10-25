# Test case – bản ASP.NET Core

Tài liệu kiểm thử cho các chức năng được giao từ ngày 21/10/2026 (xem `PLAN.md`, mục G).

| File | Nội dung |
| --- | --- |
| `TestCase_SEVEN11.xlsx` | Mỗi chức năng một sheet; sheet **Tổng hợp** tự đếm Pass / Fail / Chưa test; sheet **Hồi quy** ghi mỗi lần chạy lại toàn bộ test. Tester điền các cột nền vàng. |
| `TestCase_1_DoiMatKhau.docx` | Đổi mật khẩu (`feat/change-password`): 16 test case, kèm ảnh chụp màn hình |
| `TestCase_2_KhoaDangNhap.docx` | Khoá đăng nhập sau 5 lần sai (`feat/login-lockout`): 11 test case, kèm ảnh chụp màn hình |
| `TestCase_3_LichSuGia.docx` | Lịch sử giá (`feat/price-history`): 9 test case, kèm ảnh chụp màn hình |
| `TestCase_4_AnhSanPham.docx` | Tải ảnh sản phẩm (`feat/product-image-upload`): 13 test case, kèm ảnh chụp màn hình |
| `TestCase_5_NhanHangNhieuDot.docx` | Nhận hàng nhiều đợt (`feat/partial-receiving`): 14 test case, kèm ảnh chụp màn hình |
| `TestCase_6_ChuyenKho.docx` | Chuyển kho (`feat/stock-transfer`): 16 test case, kèm ảnh chụp màn hình |
| `LOI-CAN-SUA.md` | **Lỗi tìm được khi kiểm thử, cần người phụ trách sửa** (cách tái hiện, nguyên nhân, cách sửa) |

Cách chạy lại: `cd apps/dotnet/SevenEleven.Web && dotnet run --urls http://localhost:5711`. Tài khoản demo
dùng mật khẩu `123456`. Test tự động: `cd apps/dotnet && dotnet test`.

Ca có trạng thái **Pass** đã được chạy trên trình duyệt thật (Playwright, desktop 1366px và điện thoại
390px). Ca **Chưa test** để tester chạy tay.
