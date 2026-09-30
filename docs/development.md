# Quy trình phát triển

## Chạy

```bash
make fe-install   # lần đầu
make fe-dev       # http://localhost:3711
```

Dừng server bằng Ctrl-C. Dữ liệu mẫu tự sinh lần đầu mở trang và lưu trong IndexedDB của trình
duyệt; muốn làm mới: đăng nhập `admin@7eleven.demo` → menu tài khoản → "Tạo lại dữ liệu mẫu".

## Kiểm tra trước khi xong việc

```bash
make fe-check     # next typegen + tsc, rồi eslint — phải sạch
make fe-format    # prettier + sắp xếp class Tailwind
make fe-build     # thỉnh thoảng build thử bản production
```

Sau đó mở trang trên trình duyệt ở cả màn hình rộng và điện thoại, đăng nhập đúng vai trò dùng
trang đó, bấm thử luồng chính và xem Console không có lỗi.

## Thêm một trang

1. Tạo route trong `apps/frontend/src/app` (tên đường dẫn tiếng Việt không dấu, gạch nối).
2. Trang quản lý: đặt trong `src/app/quan-ly/(panel)/<ten>/page.tsx`, thêm mục menu ở
   `src/config/admin-nav.ts` và quyền ở `src/lib/permissions.ts`.
3. Component chỉ dùng cho trang đó để trong thư mục `_components` cạnh trang.
4. Dữ liệu: đọc `useDb((s) => s.<collection>)`, ghi qua action trong `src/stores/db.ts`.
   Thiếu action thì thêm vào đó và ghi lại ở `docs/architecture.md` mục "Bàn giao cho backend".
5. Giao diện theo `apps/frontend/docs/design-system.md`.

## Khi có backend

1. Tạo `apps/backend` theo công nghệ nhóm chọn; giữ hợp đồng dữ liệu `src/types/index.ts`.
2. Thêm biến môi trường `NEXT_PUBLIC_API_URL` cho frontend.
3. Thay thân từng action trong `src/stores/db.ts` bằng lời gọi API (có thể chuyển dần từng
   phân hệ), bỏ phần sinh dữ liệu mẫu cho phân hệ đã nối.
4. Bổ sung target `be-*` vào `Makefile` và workflow CI cho backend.

## Quy ước git (khi có repo)

- Nhánh theo việc: `feat/<ten-ngan>`, `fix/<ten-ngan>`.
- Commit message dạng conventional: `feat(pos): thanh toán tiền mặt`.
- Mở pull request vào `main`, CI frontend phải xanh trước khi merge.
