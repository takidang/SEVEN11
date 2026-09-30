# Roadmap

**Chú thích:** ✅ xong · 🚧 đang làm · ⏭️ tiếp theo · 💤 để sau

_Cập nhật: 17/09/2026._

## ✅ Giai đoạn 0 — Research & khung dự án

- Khảo sát 7-eleven.vn: cấu trúc trang, màu sắc, danh mục, chương trình thành viên, danh sách
  cửa hàng → [`research/7-eleven-vn.md`](research/7-eleven-vn.md).
- Khảo sát tính năng phần mềm quản lý cửa hàng tiện lợi (bán hàng, kho theo lô, khuyến mãi,
  nhân viên, báo cáo).
- Dựng monorepo theo template chung: `apps/frontend`, `apps/backend`, `docs`, `.claude`, CI.

## ✅ Giai đoạn 1 — Frontend (dữ liệu giả trong trình duyệt)

- Nền: design system theo 7-eleven.vn, mô hình dữ liệu, bộ tính giá & khuyến mãi, phân quyền,
  dữ liệu mẫu 35 ngày cho 10 cửa hàng, đồng bộ giữa các tab.
- Cửa hàng online: trang chủ, danh mục, sản phẩm, tìm kiếm, khuyến mãi, thành viên, cửa hàng,
  giỏ hàng & đặt hàng, theo dõi đơn, đăng nhập / đăng ký / quên mật khẩu (OTP xác minh số điện thoại), tài khoản.
- Quản lý: đăng nhập theo vai trò, tổng quan, POS, đơn hàng, sản phẩm, tồn kho (lô & hạn dùng,
  kiểm kho), nhập hàng, nhà cung cấp, khách hàng, khuyến mãi, nhân viên & ca, cửa hàng, báo cáo.

Đã kiểm tra: type check, lint, build production (24 trang); quét mọi trang theo 4 vai trò (khách,
quản trị chuỗi, quản lý, thu ngân) ở desktop và mobile, không lỗi console; chạy thật các luồng
đặt hàng online ↔ bảng đơn, bán tại quầy, nhập hàng, kiểm kho, khuyến mãi, lịch ca & chốt ca.

**Hạn chế đã biết:**

- Giảm giá sinh nhật mới chỉ hiển thị thông tin, bộ tính giá chưa áp dụng.
- Điều chỉnh tồn kho chưa có nhật ký biến động (lý do chỉ hiện trong thông báo).
- Màn hình bán tại quầy thiết kế cho máy từ 1024px trở lên, chưa tối ưu điện thoại.
- Sản phẩm không tồn tại vẫn trả HTTP 200 (trang tự kiểm tra sau khi tải dữ liệu trong trình duyệt).
- Bộ lọc trang báo cáo chưa lưu trên URL.

## ⏭️ Giai đoạn 2 — Backend

- Nhóm chốt công nghệ (ví dụ Spring Boot / .NET / NestJS) và cơ sở dữ liệu.
- Làm API theo bảng "Bàn giao cho backend" trong [`architecture.md`](architecture.md), ưu tiên:
  đăng nhập → sản phẩm & tồn kho → đặt hàng / POS → nhập hàng → báo cáo.
- Server tự tính giá và kiểm tra quyền (không tin số liệu từ FE).

## ⏭️ Giai đoạn 3 — Nối FE ↔ BE

- Thay từng action trong `apps/frontend/src/stores/db.ts` bằng API, theo phân hệ.
- Ảnh sản phẩm do nhóm tự lưu trữ thay cho CDN của 7-Eleven.

## 💤 Để sau

- In hoá đơn nhiệt thật, quét mã vạch bằng camera.
- Chuyển hàng giữa các cửa hàng, trả hàng.
- Thông báo đẩy khi có đơn online mới.
- Song ngữ Việt/Anh.
