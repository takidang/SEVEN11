# 7-Eleven — bản ASP.NET Core 8 MVC (+ C++)

Bản viết lại của `apps/frontend` (Next.js) chạy trên máy chủ thật: ASP.NET Core 8 MVC + Razor, EF Core 8
trên SQLite, một thư viện C++ tính giá gọi qua P/Invoke. Bản Next.js là đặc tả — luật nghiệp vụ, câu
chữ tiếng Việt, luồng màn hình lấy từ đó. Kế hoạch và tiến độ: [`PLAN.md`](PLAN.md).

> Đồ án môn học, lấy cảm hứng từ 7-Eleven Việt Nam — **không phải website chính thức** của 7-Eleven.

## Chạy

Cần .NET SDK 8 và một trình biên dịch C++17 (`clang++` có sẵn trên macOS, `g++` trên Linux).
Trên Windows chỉ cần .NET 8 SDK (`winget install Microsoft.DotNet.SDK.8`): không có trình biên dịch C++ thì
app tự dùng lõi tính giá bản C#, chân trang khu quản lý ghi "Lõi tính giá: C# (dự phòng)".

```bash
cd apps/dotnet/SevenEleven.Web
dotnet run --urls http://localhost:5711
```

Lần chạy đầu tự tạo `sevenEleven.db` và nạp dữ liệu mẫu (~10 giây): 10 cửa hàng, ~380 sản phẩm,
3.000 thành viên (hạng phân bố như thật: ~43% Đồng, 34% Bạc, 13% Vàng, 10% Kim cương), 35 ngày lịch sử (~32 nghìn đơn), phiếu nhập, lô hàng, lịch ca 2 tuần. Muốn làm lại từ
đầu: menu tài khoản trong khu quản lý → **Tạo lại dữ liệu mẫu**, hoặc xoá `sevenEleven.db*` rồi chạy lại.

| Vai trò | Đăng nhập (mật khẩu `123456`) | Vào đâu |
| --- | --- | --- |
| Quản trị chuỗi | `admin@7eleven.demo` | `/Admin` — mọi phân hệ, cả chuỗi |
| Quản lý cửa hàng 1006 | `quanly1006@7eleven.demo` | `/Admin` — cửa hàng của mình |
| Thu ngân 1006 | `thungan1006@7eleven.demo` | `/Admin/Pos` — bán quầy, xử lý đơn |
| Khách thành viên | SĐT `0901234567` (Vàng), `0912345678` (Kim cương), `0987654321` (Bạc) | cửa hàng online |

OTP (đăng ký, quên mật khẩu, khách đăng ký tại quầy tạo mật khẩu) là giả lập: mã hiện ngay trên trang
như một tin nhắn SMS.

| Cửa hàng online | Khu quản lý (`/Admin`) |
| --- | --- |
| `/` trang chủ: flash sale theo khung giờ (đếm ngược), gợi ý, ngành hàng | Tổng quan: doanh thu theo giờ so với TB 7 ngày, kênh bán, cửa hàng, top sản phẩm, ngân sách |
| `/danh-muc/{slug}` lọc nhóm, sắp xếp · `/san-pham/{slug}` · `/tim-kiem` | Bán tại quầy: vào/kết ca, giữ bill, 4 hình thức thanh toán, phím tắt F2/F4/F9 |
| `/khuyen-mai` flash sale, mã giảm giá "Dùng ngay", mua kèm có quà | Đơn hàng: bảng xử lý đơn online, danh sách lọc/tìm, báo đơn mới |
| `/thanh-vien` 4 hạng, giữ hạng, sao vàng | Sản phẩm, Kho (kiểm kê, lô hạn dùng, nhật ký kho), Nhập hàng, Nhà cung cấp |
| `/gio-hang` chọn voucher, ghi chú, phí giao, sao sẽ tích | Khách hàng, Khuyến mãi |
| `/dang-nhap` đăng nhập / đăng ký OTP / quên mật khẩu | Nhân viên & ca (lịch ca, chốt ca), Cửa hàng |
| `/tai-khoan` thẻ thành viên, hạng, sao, đơn, địa chỉ, thông tin | Báo cáo 7 tab, kỳ tuỳ chọn, xuất CSV |
| `/don-hang/{mã}` theo dõi, tự huỷ · `/cua-hang` "Gần tôi" | Phân quyền: quản trị / quản lý / thu ngân |

Đường dẫn kiểu cũ (`/Catalog/...`, `/Cart`, `/Account/...`, `/Order/Detail?code=`) vẫn chạy.

## Cấu trúc

```text
apps/dotnet/
├── SevenEleven.Core/     mô hình dữ liệu, EF Core, nghiệp vụ (Services/), dữ liệu mẫu (Data/)
│   └── Services/Pricing/ cầu nối P/Invoke tới thư viện C++ + bản C# dự phòng giống hệt
├── SevenEleven.Web/      MVC: cửa hàng online (Controllers/, Views/) và khu quản lý (Areas/Admin)
├── SevenEleven.Tests/    xUnit: nghiệp vụ, so khớp C++/C#, tranh chấp đồng thời, mô phỏng ngẫu nhiên
├── native/sevenpricing/  thư viện C++17: giá flash sale, tính cả giỏ, tích sao, khoảng cách
└── e2e/                  kiểm thử trình duyệt (Playwright) + script chạy trọn bộ
```

**Lõi tính giá C++.** `SevenEleven.Core.csproj` tự biên dịch `native/sevenpricing` thành
`libsevenpricing.dylib/.so` trước mỗi lần build và chép cạnh `.dll`. C# quyết định khuyến mãi nào áp
cho dòng nào (giờ, kênh, hạng, phạm vi, điều kiện mã); phần cộng trừ tiền — flash sale → mua X tặng Y →
voucher đồ uống theo hạng → mã giảm giá → phí giao — chạy trong C++. Máy không biên dịch được C++ thì
tự dùng bản C# (`SEVENELEVEN_PRICING=managed` để ép dùng C#). Chân trang khu quản lý ghi lõi đang chạy.

**Nghiệp vụ đáng chú ý:** hạng Đồng/Bạc/Vàng/Kim cương lên ngay khi đủ mốc, ngày 1 hằng tháng xét giữ
hạng (thiếu thì xuống 1 hạng, tháng vừa lên được miễn); 45.000 ₫ = 1 sao, sao hết hạn sau 12 tháng; giao
trong 5 km; ca 06–14 / 14–22 / 22–06 với chốt tiền két; mọi biến động kho có nhật ký (bán, huỷ, nhập,
điều chỉnh, kiểm kê, xuất huỷ); các thao tác ghi quan trọng khoá ghi từ trước khi đọc nên nhiều người
bấm cùng lúc không bán quá tồn, không trả hàng/sao hai lần.

## Kiểm thử

```bash
cd apps/dotnet
dotnet test                         # 82 bài: nghiệp vụ, C++ = C#, tranh chấp, mô phỏng (~35 giây)
SIM_SEEDS=1,2,3 SIM_OPS=5000 dotnet test --filter Category=Simulation   # mô phỏng dài hơn
e2e/run-all.sh 3                    # 3 vòng trọn bộ, dừng ở vòng đầu tiên có lỗi
```

- **Mô phỏng** (`SimulationTests`): nạp đúng dữ liệu mẫu thật rồi bắn hàng nghìn thao tác ngẫu nhiên
  qua các dịch vụ (đặt online, bán quầy, chuyển bước, huỷ, nhập hàng, điều chỉnh, kiểm kê, xuất huỷ, đổi
  sao, xét hạng, vào/kết ca). Sau mỗi bước kiểm: tồn không âm, nhật ký kho cộng đúng bằng thay đổi tồn,
  tổng các lô ≤ tồn, hạng đúng theo chi tiêu, sổ sao khớp số sao, tiền mỗi đơn cộng đúng, tiến trình đơn
  khớp trạng thái, trạng thái thanh toán đúng luật, lượt dùng mã = số đơn dùng mã.
- **Tranh chấp** (`ConcurrencyTests`): 20 quầy mua 5 món cuối, nhiều người cùng huỷ / chuyển bước một đơn,
  nhận một phiếu nhập hai lần, đổi sao từ nhiều thẻ, bấm vào ca liên tục, điều chỉnh kho giữa lúc bán.
- **Bò đồ thị** (`e2e/crawl.cjs`): đăng nhập theo 5 vai trò, đi hết liên kết nội bộ; bắt mã lỗi HTTP, lỗi
  máy chủ, lỗi JavaScript, chữ Razor lọt ra, ảnh hỏng, tràn ngang ở bề rộng điện thoại 390px.
- **Kịch bản trình duyệt**: `e2e/admin-flows.cjs` (form quản lý báo lỗi đúng chỗ và lưu được, lọc đơn,
  kỳ báo cáo, xuất CSV, phân quyền), `e2e/pos-flow.cjs` (quầy từ vào ca tới kết ca), `e2e/storefront-flow.cjs`
  (90 kiểm tra: đăng ký OTP, đăng nhập, quên mật khẩu, tài khoản, giỏ + voucher, 18+, danh mục, 404…),
  `e2e/storefront-pages.cjs` (tìm kiếm, theo dõi đơn tự cập nhật khi cửa hàng chuyển bước, Mua lại, huỷ đơn,
  hệ thống cửa hàng "Gần tôi" / "Giao từ cửa hàng này").

Các script e2e cần Playwright: `npm i -D playwright && npx playwright install chromium` trong `e2e/`, hoặc
trỏ `PLAYWRIGHT_PATH` tới một bản đã cài.
