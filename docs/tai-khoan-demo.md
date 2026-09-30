# Tài khoản demo

Chạy app: `make fe-dev` trong thư mục `~/Projects/7-eleven`, rồi mở http://localhost:3711.

## Nhân viên — http://localhost:3711/quan-ly/dang-nhap

Mật khẩu chung: **`123456`**

| Email | Vai trò |
| --- | --- |
| `admin@7eleven.demo` | Quản trị chuỗi (toàn bộ 10 cửa hàng) |
| `quanly1006@7eleven.demo` | Quản lý cửa hàng 1006 |
| `thungan1006@7eleven.demo` | Thu ngân cửa hàng 1006 |

Cửa hàng khác dùng cùng mẫu `quanly<mã>@7eleven.demo` và `thungan<mã>@7eleven.demo`, với mã:
1006, 1013, 1031, 1045, 1052, 1068, 1083 (đang bảo trì), 2001, 2008, 2015.

## Khách hàng — http://localhost:3711/dang-nhap

Đăng nhập bằng số điện thoại + mật khẩu. Mọi khách mẫu dùng mật khẩu **`123456`**.

| Số điện thoại | Khách | Hạng |
| --- | --- | --- |
| `0901234567` | Trần Thu Hà | Vàng |
| `0912345678` | Lê Minh Tuấn | Kim cương |
| `0987654321` | Phạm Khánh Linh | Bạc |

Mã OTP chỉ dùng để xác minh chính chủ số điện thoại. Bản demo không gửi SMS thật: bấm gửi mã thì mã
hiện ở **thông báo tin nhắn giả lập** trên đầu màn hình (lỡ tắt thì bấm "Xem lại tin nhắn"). Mã hết hạn
sau 5 phút, nhập sai 5 lần phải bấm "Gửi lại mã".

- **Đăng ký** (tab Đăng ký): họ tên, số điện thoại chưa có, mật khẩu → nhập OTP → tạo thành viên hạng Đồng.
- **Quên mật khẩu** (dưới ô mật khẩu): số điện thoại → nhập OTP → đặt mật khẩu mới.
- Khách do thu ngân đăng ký tại quầy chưa có mật khẩu: dùng **Quên mật khẩu** để tạo.

Xem hạng và sao vàng: đăng nhập → **Tài khoản** → tab **Hạng thành viên** (điều kiện lên hạng, giữ
hạng, lịch sử hạng) và tab **Sao vàng** (số sao, đổi sao lấy voucher, voucher của tôi, lịch sử sao).
Trần Thu Hà và Lê Minh Tuấn đã có sẵn một voucher đổi từ sao.

## Làm mới dữ liệu

Đăng nhập `admin@7eleven.demo` → bấm tên ở góc dưới menu trái → **Tạo lại dữ liệu mẫu**.
