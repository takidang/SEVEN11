# Kế hoạch hoàn thiện bản C# (A → Z)

Mục tiêu: bản ASP.NET Core 8 MVC (+ một module C++) làm được **mọi tính năng của bản Next.js** nhưng
chạy trên máy chủ thật, cơ sở dữ liệu thật, kèm bộ kiểm thử tự động chạy lặp tới khi sạch lỗi.
Bản Next.js (`apps/frontend`) là đặc tả: hành vi, câu chữ, luật nghiệp vụ lấy từ đó.

Chú thích: ✅ xong · 🚧 đang làm · ⏳ chưa làm

## Đã có từ trước (đợt 1–3)

- ✅ Cửa hàng online: trang chủ, danh mục, sản phẩm, tìm kiếm, giỏ hàng, đặt hàng, theo dõi đơn,
  đăng nhập/đăng ký (mật khẩu), tài khoản (hạng, sao, đổi sao, địa chỉ + định vị, đơn), danh sách
  cửa hàng "Gần tôi", khách tự huỷ đơn.
- ✅ Khu quản lý: đăng nhập nhân viên (cookie riêng), tổng quan, bán tại quầy, xử lý đơn, kho + lô,
  nhập hàng, báo cáo + lãi lỗ, tạo lại dữ liệu mẫu.
- ✅ Nghiệp vụ C#: tính giá 4 tầng, hạng, sao, giao hàng 5 km, đặt/huỷ đơn, nhập hàng, xuất huỷ.

## A. Nghiệp vụ nền còn thiếu

- ✅ A1. Xét giữ hạng hằng tháng + sao hết hạn sau 12 tháng + lịch sử lên/xuống hạng. Chạy định kỳ,
  chạy lại bao nhiêu lần vẫn đúng. Dữ liệu mẫu cũng xét hạng theo đúng trình tự thời gian.
- ✅ A2. OTP giả lập (6 số, hết hạn 5 phút, sai 5 lần phải xin mã mới, gửi lại sau 60 giây) cho
  đăng ký, quên mật khẩu, và khách đăng ký tại quầy tự đặt mật khẩu.
- ✅ A3. Nhật ký biến động kho: bán, huỷ đơn, nhập hàng, kiểm kê, xuất huỷ — ai, lúc nào, vì sao
  (bản Next.js còn thiếu, ghi trong ROADMAP "hạn chế đã biết").
- ✅ A4. Ca làm việc: lịch ca 3 ca/ngày, vào ca/kết ca kèm tiền đầu ca/cuối ca, chốt ca đối chiếu
  tiền mặt bán được.

## B. Khu quản lý còn thiếu

- ✅ B1. Khách hàng: danh sách, lọc hạng, "nguy cơ xuống hạng", hồ sơ (hạng, giữ hạng, sao, voucher,
  lịch sử hạng, địa chỉ, đơn), sửa thông tin.
- ✅ B2. Sản phẩm: thêm, sửa, ngừng bán/bán lại.
- ✅ B3. Khuyến mãi: tạo/sửa mọi loại (%, số tiền, flash sale, mua X tặng Y, voucher hạng), tạm dừng,
  chạy lại, kết thúc.
- ✅ B4. Nhà cung cấp: thêm, sửa, ngừng hợp tác, lịch sử nhập.
- ✅ B5. Nhân viên & ca: hồ sơ nhân viên, xếp lịch ca, chốt ca; vào ca/kết ca ngay ở máy bán hàng.
- ✅ B6. Cửa hàng: thêm, sửa, trạng thái, toạ độ, quản lý.
- ✅ B7. Báo cáo: chọn khoảng ngày tuỳ ý, xuất CSV.
- ✅ B8. Kho: kiểm kê, điều chỉnh có lý do, xem nhật ký kho.

## C. Cửa hàng online còn thiếu

- ✅ C1. Trang chủ đủ mục như bản cũ (flash sale theo khung giờ + đếm ngược…).
- ✅ C2. Trang Khuyến mãi (khung giờ flash sale, voucher, mua X tặng Y).
- ✅ C3. Trang Thành viên (bảng so sánh quyền lợi 4 hạng, sao vàng).
- ✅ C4. Đăng ký có OTP, quên mật khẩu bằng OTP.
- ✅ C5. Tài khoản: sửa hồ sơ, đổi mật khẩu, tab hạng (giữ hạng tháng này, lịch sử hạng).
- ✅ C6. Giỏ hàng: chọn nhanh voucher đang dùng được.
- ✅ C7. Danh mục: sắp xếp/lọc; trang sản phẩm: sản phẩm liên quan, giá flash sale.
- ✅ C8. Đường dẫn tiếng Việt như bản Next.js (/khuyen-mai, /thanh-vien, /tai-khoan, /dang-nhap, /gio-hang,
  /san-pham/…, /danh-muc/…, /don-hang/…, /cua-hang, /tim-kiem); đường dẫn cũ vẫn chạy. Trang 404 chung.
- ✅ C9. Tìm kiếm theo độ phù hợp + sắp xếp + danh mục liên quan; theo dõi đơn có tiến trình, hẹn giờ giao,
  tự cập nhật khi cửa hàng chuyển bước, "Mua lại", che số với người lạ; hệ thống cửa hàng có tìm, lọc tỉnh,
  "Gần tôi", "Giao từ cửa hàng này".

## D. Module C++

- ✅ Lõi tính giá viết bằng C++ (thư viện động), C# gọi qua P/Invoke; máy nào không có thư viện thì
  tự dùng bản C#. Kiểm thử so khớp C++ với C# trên hàng nghìn giỏ hàng ngẫu nhiên.

## E. Kiểm thử tự động (chạy lặp tới khi sạch lỗi)

- ✅ E1. xUnit: nghiệp vụ + tích hợp cơ sở dữ liệu cho từng dịch vụ (82 bài, gồm 7 bài tranh chấp đồng thời).
- ✅ E2. Vòng lặp mô phỏng ngẫu nhiên: hàng nghìn thao tác (đặt, huỷ, bán quầy, nhập, kiểm kê…),
  sau mỗi bước kiểm bất biến: tồn kho không âm, tổng tiền khớp, sao và hạng khớp sổ. Đã chạy 6 hạt giống
  × 4.000 bước rồi 6 hạt giống × 5.000 bước, đều sạch; bắt được lỗi đếm lượt dùng mã ở dữ liệu mẫu (đã sửa).
- ✅ E3. Bò đồ thị trang (crawler) theo 5 vai trò: đi hết mọi liên kết, bắt mã lỗi, lỗi máy chủ,
  lỗi console, tràn ngang trên điện thoại (`e2e/crawl.cjs`, ~1.150 trang mỗi lượt).
- ✅ E4. Kịch bản trình duyệt cho từng luồng chính, cả người dùng thật lẫn phân quyền
  (`e2e/admin-flows.cjs`, `e2e/pos-flow.cjs`, `e2e/storefront-flow.cjs` — 90 kiểm tra phía khách).

## F. Hoàn tất

- ✅ Hướng dẫn chạy (README), tạo lại dữ liệu mẫu (máy chủ :5711 chạy dữ liệu mới, DB cũ sao lưu ở
  `SevenEleven.Web/sevenEleven.db.bak-20261006`), báo cáo kết quả cho sếp duyệt.

## G. Việc nhóm giao (21/10/2026)

- ✅ G1. Đổi mật khẩu cho nhân viên và khách; nhân viên mới phải đổi ở lần đăng nhập đầu; quản trị đặt
  lại được mật khẩu (cấp mật khẩu tạm, bắt đổi lại). Nhánh `feat/change-password`.
- ⏳ G2. Sai mật khẩu 5 lần liên tiếp thì khoá đăng nhập 15 phút, cả nhân viên lẫn khách. `feat/login-lockout`
- ⏳ G3. Lịch sử đổi giá bán, giá vốn (ai đổi, lúc nào), xem trong trang sửa sản phẩm. `feat/price-history`
- ⏳ G4. Tải ảnh sản phẩm lên (jpg, png, webp tối đa 2 MB) thay vì dán link. `feat/product-image-upload`
- ⏳ G5. Phiếu nhập nhận thiếu, nhận nhiều đợt, có nút kết thúc phiếu. `feat/partial-receiving`
- ⏳ G6. Chuyển kho giữa các cửa hàng: bên gửi trừ kho, bên nhận xác nhận thì cộng kho, giữ hạn dùng của lô. `feat/stock-transfer`
- ⏳ G7. Trả hàng cho đơn đã hoàn thành trong 7 ngày: nhập lại kho hoặc xuất huỷ, hoàn tiền, trừ lại sao và
  chi tiêu xét hạng. `feat/order-returns`
