# Research: 7-eleven.vn và nghiệp vụ cửa hàng tiện lợi

Tài liệu tham khảo cho nhóm trước khi làm FE/BE. Nguồn: web thật https://7-eleven.vn
(khảo sát ngày 16/09/2026) và tính năng của các phần mềm quản lý cửa hàng tiện lợi phổ
biến (KiotViet). Ảnh chụp nằm trong [`screenshots/`](screenshots).

> Dự án là **đồ án học tập**, chỉ lấy cảm hứng từ 7-Eleven. Không dùng file logo gốc.
> Ảnh sản phẩm trong dữ liệu mẫu đang trỏ thẳng tới CDN của 7-eleven.vn để demo cho
> thật; khi có backend thì thay bằng ảnh do nhóm tự quản lý.

---

## 1. Web 7-eleven.vn là gì

Không phải trang giới thiệu công ty, mà là **trang đặt hàng giao nhanh** ("mở cửa 24
giờ, giao hàng 24 phút"). Khách chọn địa chỉ giao, lướt danh mục, bỏ giỏ và đặt hàng
từ cửa hàng gần nhất. Kỹ thuật: Next.js (App Router) + Tailwind, font **Roboto**, ảnh
qua CDN resize sang WebP (`image-cdn.7-eleven.vn/crop?type=webp&width=340&height=340&url=…`).

## 2. Cấu trúc trang (information architecture)

### Khung chung (desktop)

| Vùng | Nội dung |
| --- | --- |
| Header cố định | Logo · "Giao đến: Nhập địa chỉ giao hàng" (chọn địa chỉ) · ô tìm kiếm bo tròn, placeholder *"Tìm gì cũng có, mở cửa 24 giờ, giao hàng 24 phút"* · nút tài khoản |
| Sidebar trái (~255px) | Chữ logo lớn · thanh xanh **DANH MỤC SẢN PHẨM** · danh sách danh mục dạng accordion (mũi tên, nhãn `HOT` cam) · mục **KHUYẾN MÃI & ƯU ĐÃI** (chương trình thành viên…) |
| Nội dung | Cuộn độc lập với sidebar |
| Footer | Về 7-Eleven, Tuyển dụng, Hướng dẫn xuất hoá đơn GTGT, Danh sách cửa hàng, Hướng dẫn mua hàng, Chính sách · email + hotline CSKH · Facebook/TikTok · tải app · thông tin doanh nghiệp |

Mobile: bỏ sidebar; header gồm "Giao đến", nút menu (mở sidebar dạng ngăn kéo), nút tài
khoản, ô tìm kiếm ngay dưới. Menu ngăn kéo có: Danh sách cửa hàng, Chọn khu vực, Điều
khoản, Góp ý, Tuyển dụng, Ngôn ngữ, Về chúng tôi, Đăng nhập.

### Trang chủ (từ trên xuống)

1. **2 banner** chiến dịch cạnh nhau, có nút trượt (Matcha Mania, Vòng quay Coca-Cola…).
2. **Gợi ý cho bạn**: hàng ngang thẻ ảnh vuông dẫn tới bộ sưu tập (Premium Selection,
   Bia Craft, Toastie, Bánh tươi, 7Collection, Phụ kiện ngày mưa…).
3. **Danh mục sản phẩm**: hàng icon tròn có tên (New Selection, Flash Sale, Sản phẩm
   mới, Trà sữa, Món ngon, Bánh, Đông lạnh, Ăn vặt, Sữa, Đồ uống, Đồ uống có cồn, Rau
   củ, Thịt, Đồ hộp, Gia vị, Đồ khô, Sức khoẻ, Cá nhân, Nhà cửa, Bếp, Điện tử, Văn
   phòng phẩm, Đồ chơi, Mẹ & bé, Thú cưng, Ưu đãi online).
4. **Flash Sale** + chip khung giờ (*Ăn Tối*, *Buổi Sáng Năng Động*, *Ăn Xế*).
5. Các **dải sản phẩm** theo danh mục, mỗi dải có chip danh mục con và cuộn ngang.

### Trang danh mục — `/combo/<slug>-<id>`

Chip danh mục con ở đầu → mỗi danh mục con là một khối có tiêu đề + lưới thẻ sản phẩm
(6 cột trên màn 1440px). Danh mục có 2 cấp, ví dụ:

| Danh mục | Danh mục con |
| --- | --- |
| Trà sữa & trà trái cây | Trà sữa 7-Eleven, Trà trái cây, Cà phê Việt Nam, Sữa đậu nành, Topping |
| Món ngon tại 7-Eleven | Món ăn no, Món hấp, Món chiên & nướng, Cơm nắm Onigiri, Cháo súp, Salads, Tráng miệng |
| Các loại bánh | Pizza, Bánh mì que, Burrito, Sandwich, Burger & Hotdog, Bánh ngọt |
| Đồ ăn vặt | Snacks, Bánh quy, Kẹo, Chocolate, Thịt khô, Hạt & trái cây sấy, Bánh tráng trộn |
| Sản phẩm từ sữa | Sữa chua, Sữa tiệt trùng, Sữa thanh trùng, Bơ, Phô mai, Sữa đặc |
| Đồ uống đóng chai | Nước có gas, Trà uống liền, Nước suối, Nước trái cây, Cà phê uống liền, Tăng lực |
| Đồ uống có cồn | Bia, Soju, Rượu vang, Rượu mạnh, Nước ép có cồn |
| Đồ khô, ngũ cốc | Mì ăn liền, Gạo, Hủ tiếu/miến/phở ăn liền, Bột mì |

### Thẻ sản phẩm

Ảnh vuông (ảnh gốc có sẵn khung viền đỏ/xanh "Giao hàng 24 phút – Freeship đến 35K") ·
tên 2 dòng · **giá bán** đậm · giá gốc gạch ngang + nhãn `-34%` · (tuỳ món) *"Còn
69:11 phút"* đếm ngược nền cam · dòng xanh lá *"Giao 24 phút"* · nút tròn **+** xanh lá
để thêm nhanh vào giỏ.

### Trang chi tiết — `/san-pham/<slug>` hoặc `/product/<upc>-<slug>-<id>-normal|combo`

Ảnh lớn · tên · giá (xanh đậm) · "GIAO NHANH 24 PHÚT" · thời gian giao dự kiến
(khung 10 phút) · thông tin: **UPC (mã vạch)**, thương hiệu, xuất xứ, nhà sản xuất ·
cột phải: bộ đếm số lượng − 1 + và nút xanh "Thêm 35,000 ₫" · nút "Đăng nhập để tìm
cửa hàng gần nhất có bán". Sản phẩm có cồn hiện cảnh báo *"Sản phẩm giới hạn độ tuổi.
Vui lòng xác nhận độ tuổi để tiếp tục."*

### Chương trình thành viên (áp dụng từ 01/01/2026)

Bỏ "tích điểm – đổi voucher", chuyển sang **"mua sắm – nâng hạng"**. Hạng xét theo
tổng chi tiêu của **quý liền trước**, cập nhật ngày đầu mỗi quý. Không tính rượu,
thuốc lá, thẻ nạp và giá trị khuyến mãi.

| | Silver | Gold | Diamond |
| --- | --- | --- | --- |
| Chi tiêu quý trước | Dưới 1 triệu | 1 – dưới 3 triệu | Từ 3 triệu |
| Quyền lợi cơ bản | Gói khách mới (tới 85.000đ): ly nước miễn phí khi tải app, khi tiêu 100k, 200k | 1 ly miễn phí/tháng (hoá đơn từ 58k) | 1 ly miễn phí/tuần (hoá đơn từ 58k) |
| Tháng sinh nhật | Giảm 30% đồ uống (từ 3 ly) | Giảm 40% | Giảm 50% |
| Voucher thành viên | −3.000đ/ly, 10 voucher/tháng | −6.000đ/ly, 20 voucher/tháng | −9.000đ/ly, 30 voucher/tháng |

### Danh sách cửa hàng

Lọc theo **tỉnh thành → phường/xã** (địa chỉ theo đơn vị hành chính mới, kèm địa chỉ
cũ). Mỗi cửa hàng: **mã + tên ngắn** (vd. `1006 - 81 Nguyen Du D1`), địa chỉ, số điện
thoại, email riêng (`store1006@…`), nút "Tìm đường đi".

## 3. Ngôn ngữ thiết kế (đo từ CSS thật)

| Token | Giá trị | Dùng ở đâu |
| --- | --- | --- |
| Xanh thương hiệu | `#007350` | Thanh "Danh mục sản phẩm", nút chính, giá ở trang chi tiết, tiêu đề lớn |
| Xanh tươi | `#09AF4C` | Chữ "Giao 24 phút", nút tròn + |
| Cam | `#F56F20` / `#F97316` | Nhãn HOT, ô đếm ngược, trang thành viên |
| Đỏ | ~`#E4202A` | Khung ảnh, flash sale, logo |
| Vàng nhãn giảm giá | `#EAB308` nhạt | Nhãn `-13%` |
| Chữ | `#1F2937`, `#111827`; phụ `#6B7280` | |
| Nền / viền | trắng, `#F9FAFB`; viền `#E5E7EB` | |
| Font | Roboto (có subset tiếng Việt) | Toàn trang |

Cảm giác chung: nền trắng sạch, nhiều ảnh sản phẩm, thẻ bo góc ~12px có bóng rất nhẹ,
chip bo tròn viền xanh nhạt, màu thương hiệu dùng tiết chế cho điểm nhấn (giá, nút,
nhãn). Không có hiệu ứng gradient hay kính mờ ngoài ảnh banner.

## 4. Phần quản lý (web 7-Eleven không có, tham khảo phần mềm POS)

Nhóm tính năng chuẩn của phần mềm quản lý cửa hàng tiện lợi (KiotViet và tương tự):

- **Bán hàng tại quầy (POS)**: quét mã vạch, tìm nhanh, in hoá đơn, két tiền, nhiều
  hình thức thanh toán, tra khách thành viên.
- **Hàng hoá & tồn kho**: tồn theo từng cửa hàng, cảnh báo sắp hết hàng / sắp hết hạn,
  nhập kho theo **lô và hạn sử dụng**, kiểm kho, chuyển hàng giữa chi nhánh.
- **Nhập hàng**: nhà cung cấp, phiếu nhập, giá vốn.
- **Khuyến mãi**: giảm % hoặc số tiền, mua X tặng Y, combo, flash sale theo khung giờ,
  voucher theo hạng thành viên.
- **Nhân viên**: phân quyền theo vị trí, lịch ca, điểm danh vào/ra ca, chốt ca (tiền
  đầu ca/cuối ca), doanh thu theo nhân viên.
- **Báo cáo**: doanh thu ngày/tuần/tháng, lãi gộp, hàng bán chạy, tồn kho, theo cửa
  hàng/kênh bán.
- **Đa kênh**: đơn online (web/app) và đơn tại quầy chung một hệ thống.

## 5. Phạm vi FE đề xuất

Hai phân hệ dùng chung dữ liệu:

1. **Cửa hàng online** (khách hàng) — bám theo web thật: trang chủ, danh mục, chi tiết
   sản phẩm, tìm kiếm, giỏ hàng & đặt hàng, theo dõi đơn, đăng nhập bằng số điện
   thoại, tài khoản (hạng thành viên, voucher, đơn hàng, địa chỉ), danh sách cửa
   hàng, chương trình thành viên.
2. **Quản lý** (nhân viên) — tổng quan, bán tại quầy, đơn hàng, sản phẩm, tồn kho,
   nhập hàng & nhà cung cấp, khách hàng, khuyến mãi, nhân viên & ca làm, cửa hàng,
   báo cáo. Phân quyền 3 vai trò: **Quản trị chuỗi**, **Quản lý cửa hàng**, **Thu
   ngân**.

Chưa có backend nên FE chạy bằng dữ liệu mẫu lưu ở trình duyệt; đơn đặt online hiện
ngay bên màn quản lý và bán tại quầy trừ tồn kho thật, để demo trọn luồng.
