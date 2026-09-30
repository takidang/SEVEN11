# apps/backend

Chưa bắt đầu. Frontend đang chạy bằng dữ liệu giả trong trình duyệt.

Khi nhóm chọn công nghệ backend:

1. Đọc [`../../docs/architecture.md`](../../docs/architecture.md) mục **Bàn giao cho backend** —
   danh sách API cần làm, ánh xạ từ các action của `apps/frontend/src/stores/db.ts`.
2. Giữ đúng hợp đồng dữ liệu trong `apps/frontend/src/types/index.ts` (tiền là số nguyên VND,
   thời gian ISO-8601).
3. Chép lại quy tắc nghiệp vụ từ `apps/frontend/src/lib`: `pricing.ts` (tính giá & khuyến mãi),
   `membership.ts` (hạng thành viên), `permissions.ts` (phân quyền), `order-status.ts`
   (luồng trạng thái đơn).
4. Thêm target `be-*` vào `Makefile` gốc và workflow CI tương ứng.
