# 7-Eleven — Hệ thống quản lý chuỗi cửa hàng tiện lợi

Đồ án nhóm: hệ thống quản lý mua bán cho chuỗi cửa hàng tiện lợi, **lấy cảm hứng** từ
7-Eleven Việt Nam. Không phải website chính thức của 7-Eleven.

Hệ thống có hai phân hệ dùng chung dữ liệu:

| Phân hệ | Dành cho | Chức năng chính |
| --- | --- | --- |
| **Cửa hàng online** | Khách hàng | Trang chủ, danh mục, chi tiết sản phẩm, tìm kiếm, flash sale theo khung giờ, giỏ hàng & đặt hàng giao 24 phút, theo dõi đơn, đăng nhập bằng số điện thoại, hạng thành viên Đồng/Bạc/Vàng/Kim cương (giữ hạng theo tháng), sao vàng đổi voucher, danh sách cửa hàng |
| **Quản lý** | Nhân viên | Bán tại quầy (POS), đơn hàng, sản phẩm, tồn kho theo lô & hạn dùng, kiểm kho, nhập hàng & nhà cung cấp, khách hàng, khuyến mãi, nhân viên & ca làm, cửa hàng, tổng quan & báo cáo |

Phân quyền: **Quản trị chuỗi** (toàn bộ), **Quản lý cửa hàng** (một cửa hàng), **Thu ngân**
(bán hàng, đơn hàng).

## Trạng thái

- ✅ Research web 7-eleven.vn và nghiệp vụ → [`docs/research/7-eleven-vn.md`](docs/research/7-eleven-vn.md)
- ✅ Frontend (Next.js, 24 trang) chạy trọn luồng bằng dữ liệu mẫu lưu trong trình duyệt
- ⏭️ Backend: nhóm chọn công nghệ, làm theo hợp đồng dữ liệu trong [`docs/architecture.md`](docs/architecture.md)

## Chạy thử

Cần Node.js ≥ 20.9 và pnpm.

```bash
make fe-install
make fe-dev        # mở http://localhost:3711
```

Hoặc thủ công:

```bash
cd apps/frontend
pnpm install
pnpm dev
```

Tài khoản demo (mật khẩu `123456`):

| Vai trò | Email |
| --- | --- |
| Quản trị chuỗi | `admin@7eleven.demo` |
| Quản lý cửa hàng 1006 | `quanly1006@7eleven.demo` |
| Thu ngân cửa hàng 1006 | `thungan1006@7eleven.demo` |

Khách hàng demo: số điện thoại `0901234567`, mật khẩu `123456` (OTP khi đăng ký / quên mật khẩu hiện
trong thông báo tin nhắn giả lập).

Đầy đủ tài khoản demo (các cửa hàng khác, khách hạng Bạc/Vàng/Kim cương): [`docs/tai-khoan-demo.md`](docs/tai-khoan-demo.md).

Mẹo demo: mở một tab là khách đặt hàng online, một tab là thu ngân ở `/quan-ly/don-hang` —
đơn mới hiện ngay và trạng thái cập nhật qua lại giữa hai tab.

## Cấu trúc

```text
apps/frontend/   Next.js 16 + TypeScript + Tailwind + shadcn/ui
apps/backend/    (chưa có)
docs/            research, kiến trúc, quy trình phát triển, roadmap
```

## Tài liệu

- [`docs/research/7-eleven-vn.md`](docs/research/7-eleven-vn.md) — khảo sát web thật & nghiệp vụ
- [`docs/architecture.md`](docs/architecture.md) — kiến trúc, mô hình dữ liệu, bàn giao cho backend
- [`docs/development.md`](docs/development.md) — quy trình làm việc
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — tiến độ và việc tiếp theo
- [`apps/frontend/docs/design-system.md`](apps/frontend/docs/design-system.md) — hệ thống thiết kế

## Ghi chú bản quyền

Tên và cảm hứng thiết kế từ 7-Eleven chỉ dùng cho mục đích học tập. Logo trong dự án được vẽ
lại, không dùng file logo gốc. Ảnh sản phẩm trong dữ liệu mẫu đang trỏ tới CDN công khai của
7-eleven.vn; khi có backend nên thay bằng ảnh do nhóm tự quản lý.
