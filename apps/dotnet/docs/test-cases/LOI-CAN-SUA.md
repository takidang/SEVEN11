# Lỗi cần sửa (từ kiểm thử)

Người ghi: Tài Đặng (tester). Cập nhật: 25/10/2026. Phạm vi: bản .NET (`apps/dotnet`), nhánh `dev` đã gộp `main` tới `d4ba7ca`.

| # | Mức | Lỗi | Ai sửa | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Cao | `e2e/storefront-flow.cjs` treo nếu chạy sau giờ flash sale sáng | Phát | Đã sửa 25/10 |
| 2 | Trung bình | Bộ e2e hỏng dần nếu chạy nhiều lần trên cùng dữ liệu | Phát | Đã sửa 25/10 |
| 3 | Thấp | README chưa nói rõ cách chạy trên Windows | Phát | Đã thêm 25/10 |
| 4 | Cao | Bỏ tích "Sản phẩm mới" / "Đang bán" ở form sản phẩm, "Đang hợp tác" ở form nhà cung cấp rồi lưu: vẫn lưu là bật | Phát | Đã sửa 25/10 |
| 5 | Trung bình | Khu quản lý trên điện thoại: trang ít nội dung (Chuyển kho) bị kéo dãn thanh menu trên cùng cao gần 200px | Phát | Đã sửa 25/10 |
| 6 | Thấp | Sửa sản phẩm: "Lịch sử giá" lúc trống thì câu thông báo dính sát mép khung; ba ô giá không xếp dọc trên điện thoại | Phát | Đã sửa 25/10 |
| 7 | Thấp | Chi tiết đơn, mục Trả hàng trên điện thoại: cột tên món quá hẹp, tên vỡ từng chữ | Phát | Đã sửa 25/10 |

## Đã sửa (25/10)

- #1: dòng bấm nút "+" chỉ chọn nút đang hiện (`.qa-plus:visible`).
- #2: kiểm tra tab Tổng quan đọc hạng đang hiện trên đầu trang tài khoản thay vì cố định "Vàng". `run-all.sh` vốn đã tạo dữ liệu mới mỗi vòng nên chỉ dính khi chạy lẻ trên cùng dữ liệu.
- #3: README thêm dòng cho Windows.
- #4: ô tích tắt thì trình duyệt không gửi gì, trong khi form để mặc định "bật". Thêm ô ẩn `false` sau mỗi ô tích; `e2e/admin-flows.cjs` có thêm kiểm tra bỏ tích rồi lưu.
- #5: `.shell` trên màn nhỏ dùng `grid-template-rows: auto minmax(0, 1fr)` để phần thừa chiều cao dồn cho nội dung.
- #6, #7: dùng kiểu `.empty` chung; lưới giá đổi sang lớp `cols-3` (về 1 cột dưới 760px); bảng trả hàng có `min-width` cho cột tên.

## 1. `storefront-flow.cjs` treo khi chạy sau giờ flash sale sáng

**Hiện tượng:** script dừng ở mục "H. Khuyến mãi", báo `BAD script crashed — locator.click: Timeout 30000ms exceeded`. Kết quả: 1 kiểm tra hỏng / 74, các kiểm tra sau đó không chạy.

**Cách tái hiện:** chạy `node e2e/storefront-flow.cjs` vào buổi chiều hoặc tối. Lỗi xảy ra cả trên `main` gốc (`d4ba7ca`), không liên quan đến các nhánh `feat/*`.

**Nguyên nhân:** dòng 331 bấm vào nút "+" **đầu tiên trong HTML** của trang `/khuyen-mai`:

```js
await g.locator('.pcard .qa-plus').first().click();
```

Nút đầu tiên nằm trong khung "Flash sale hôm nay", ở tab khung giờ **sáng** (`data-panel="slot:pr-fs-sang"`). Ngoài giờ sáng, tab này có `hidden`, nút không bấm được nên Playwright chờ tới hết 30 giây. Trang có 42 nút "+", trong đó 18 nút đang hiện. **Giao diện không lỗi**: ở cả 390px lẫn 1366px đều vậy, người dùng thật vẫn bấm được các nút đang hiện.

**Xác nhận thêm (25/10):** `main` chưa có commit sửa. Chạy lúc 09:04 (trong giờ flash sale sáng) thì đạt 90/90,
đúng như phân tích: lỗi chỉ xuất hiện khi chạy buổi chiều hoặc tối.
Cùng ngày, cùng code trên `dev`: 09:30 đạt 90/90, 17:49 treo đúng chỗ này (1 kiểm tra hỏng / 74).

**Cách sửa (đã thử: 90/90 đạt lúc 22/10 tối):**

```js
await g.locator('.pcard .qa-plus:visible').first().click();
```

## 2. Bộ e2e hỏng dần khi chạy nhiều lần trên cùng dữ liệu

**Hiện tượng:** sau vài lần chạy `storefront-flow.cjs`, kiểm tra `account tab tong-quan — Quyền lợi hạng Vàng` bắt đầu hỏng.

**Nguyên nhân:** mỗi lần chạy, script đặt thêm đơn bằng khách demo `0901234567`. Chi tiêu cộng dồn từ 4.770.000 ₫ lên quá 5.000.000 ₫, nên khách lên hạng Kim cương, mà script lại cố định chữ "hạng Vàng". Đo được 22/10: 5.189.000 ₫, hạng Kim cương.

**Cách sửa (chọn một):**
- `e2e/run-all.sh` tạo lại dữ liệu mẫu trước mỗi vòng (đăng nhập `admin@7eleven.demo` → menu → "Tạo lại dữ liệu mẫu", hoặc xoá `sevenEleven.db*` rồi chạy lại app).
- Hoặc kiểm tra "Quyền lợi hạng" theo hạng đang hiện trên thẻ thành viên, không cố định "Vàng".

**Cách né tạm thời:** bấm "Tạo lại dữ liệu mẫu" trước khi chạy e2e. Tester đang làm vậy (script `reset-demo.cjs`).

## 3. README chưa nói về Windows (không phải lỗi)

- `apps/dotnet/README.md` ghi cần `clang++` hoặc `g++`. Máy Windows không có sẵn hai trình biên dịch này, nên lõi tính giá C++ không được build. App vẫn chạy đúng bằng bản C# dự phòng (chân trang ghi "Lõi tính giá: C# (dự phòng)").
- Nên thêm một dòng cho người dùng Windows: chỉ cần cài .NET 8 SDK (`winget install Microsoft.DotNet.SDK.8`), không bắt buộc có C++.
