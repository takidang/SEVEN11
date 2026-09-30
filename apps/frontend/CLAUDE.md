@AGENTS.md

# CLAUDE.md — apps/frontend

Next.js 16 app for the 7-Eleven store-management project: a **storefront** (shoppers) and a
**back office** (staff). Repo-wide guide: [`../../CLAUDE.md`](../../CLAUDE.md). Visual rules:
[`docs/design-system.md`](docs/design-system.md) — read it before any UI work.

## Quick facts

- **Stack:** Next.js 16.3 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind v4 ·
  shadcn/ui (Radix, "nova" preset) · Zustand · react-hook-form + zod · TanStack Table v8 ·
  Recharts · sonner.
- **No backend yet.** A mock backend runs in the browser (`src/stores/db.ts`, persisted to
  IndexedDB, seeded by `src/lib/seed.ts`). Every screen works end-to-end on it.
- **Language:** UI copy in Vietnamese with full diacritics. Code, identifiers and comments in English.
- **Package manager:** pnpm. Dev server: `pnpm dev` → http://localhost:3711.

## Commands

```bash
pnpm dev            # http://localhost:3711
pnpm check-types    # next typegen + tsc — the gate
pnpm lint           # eslint (must be clean)
pnpm format         # prettier + tailwind class sorting
pnpm build          # production build
```

## Where things live

```text
src/
├── app/
│   ├── (shop)/                 storefront (header + category rail + footer); (shop)/_components = shared by shop pages
│   ├── quan-ly/dang-nhap/      staff login
│   ├── quan-ly/(panel)/        back office (sidebar shell, guarded by <StaffGate>); (panel)/_components = dashboard + charts
│   └── quan-ly/ban-hang/       POS, full screen (guarded, no sidebar)
├── components/
│   ├── ui/                     shadcn primitives (generated — avoid editing)
│   ├── brand/                  LogoMark, Wordmark (logo PNGs live in src/assets/brand)
│   ├── shop/                   storefront shared: ProductCard, ProductRail, ShopHeader, AddressDialog, addToCart…
│   └── admin/                  back-office shared: DataTable, PageHeader/Panel, StatCard, StatusBadge, Toolbar
│                               (search/filter row), ProductCell, scoped stock badge, NumberInput, ReceiptDialog
├── config/admin-nav.ts         back-office menu + module per route
├── data/                       static seed: catalog (generated), stores, staff, suppliers
├── hooks/                      use-catalog (products, promotions, display price), use-stock (stock map + state)
├── lib/                        pure logic: pricing, seed, membership, permissions, order-status, analytics,
│                               catalog, format, phone (VN phone rules), query (URL params in place), images,
│                               vouchers (how a voucher's value, conditions and expiry are worded)
│                               stars (gold stars: earn, take back, expiry, reward catalog)
├── stores/                     zustand: db (mock backend), session, otp (mock OTP codes), cart, admin-ui, hydration
└── types/index.ts              domain model = contract with the future backend
```

Page-specific components go next to the page in a private folder, e.g.
`src/app/quan-ly/(panel)/don-hang/_components/order-sheet.tsx`. As soon as a second page needs
one, move it to `src/components/{shop,admin}` or `src/lib` — never import another page's
`_components` folder.

## Routes

| Storefront               |                                            | Back office             |                        |
| ------------------------ | ------------------------------------------ | ----------------------- | ---------------------- |
| `/`                      | Trang chủ                                  | `/quan-ly/dang-nhap`    | Đăng nhập nhân viên    |
| `/danh-muc/[slug]?nhom=` | Danh mục                                   | `/quan-ly`              | Tổng quan              |
| `/san-pham/[slug]`       | Chi tiết sản phẩm                          | `/quan-ly/ban-hang`     | Bán tại quầy (POS)     |
| `/tim-kiem?q=`           | Tìm kiếm                                   | `/quan-ly/don-hang`     | Đơn hàng               |
| `/gio-hang`              | Giỏ hàng & đặt hàng                        | `/quan-ly/san-pham`     | Sản phẩm               |
| `/don-hang/[code]`       | Theo dõi đơn                               | `/quan-ly/kho`          | Tồn kho, lô & hạn dùng |
| `/tim-kiem`              | `q=<text or barcode>` · `sapxep=<sort>`    |
| `/dang-nhap?tab=`        | Đăng nhập / đăng ký khách (SĐT + mật khẩu) | `/quan-ly/nhap-hang`    | Phiếu nhập             |
| `/tai-khoan?tab=`        | Tài khoản, hạng, đơn, địa chỉ              | `/quan-ly/nha-cung-cap` | Nhà cung cấp           |
| `/cua-hang`              | Danh sách cửa hàng                         | `/quan-ly/khach-hang`   | Khách hàng             |
| `/thanh-vien`            | Chương trình thành viên                    | `/quan-ly/khuyen-mai`   | Khuyến mãi             |
| `/khuyen-mai`            | Flash sale & ưu đãi                        | `/quan-ly/nhan-vien`    | Nhân viên & ca         |
|                          |                                            | `/quan-ly/cua-hang`     | Cửa hàng               |
|                          |                                            | `/quan-ly/bao-cao`      | Báo cáo                |

## Deep links (query parameters)

Pages keep tabs, filters and the open detail in the URL so other pages can link straight to them.

| Route                   | Parameters                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/danh-muc/[slug]`      | `nhom=<sub-category slug>` · `sapxep=<sort>`                                                                                                                               |
| `/dang-nhap`            | `tab=dang-ky` (sign-up tab) · `next=<path>` (same-site only, `safeNextPath`)                                                                                               |
| `/don-hang/[code]`      | `moi=1` shows the "đặt hàng thành công" banner                                                                                                                             |
| `/tai-khoan`            | `tab=tong-quan \| hang \| sao-vang \| don-hang \| dia-chi \| thong-tin`                                                                                                    |
| `/quan-ly/don-hang`     | `ma=<order code>` · `trang-thai=pending \| processing \| delivering \| completed \| cancelled` · `kenh=online \| in-store` · `ngay=hom-nay \| 7-ngay \| 30-ngay \| tat-ca` |
| `/quan-ly/san-pham`     | `ma=<SKU>`                                                                                                                                                                 |
| `/quan-ly/kho`          | `tab=ton-kho \| han-dung \| kiem-kho` · `loc=can-nhap \| sap-het \| het-hang`                                                                                              |
| `/quan-ly/nhap-hang`    | `ma=<PN code>` · `goi-y=1` (new order prefilled with low-stock items)                                                                                                      |
| `/quan-ly/nha-cung-cap` | `ma=<supplier code>`                                                                                                                                                       |
| `/quan-ly/khach-hang`   | `sdt=<phone>`                                                                                                                                                              |
| `/quan-ly/nhan-vien`    | `tab=nhan-vien \| lich-ca \| chot-ca` · `ngay=yyyy-MM-dd` (cash-up day)                                                                                                    |

Update in place with `replaceQuery()` from `lib/query` (no navigation, no scroll jump).

## Data rules (read before touching data)

- **Read** with selectors: `const orders = useDb((s) => s.orders)`. Derive with `useMemo`.
  Selectors must return existing references (don't `.filter()` inside the selector for lists —
  filter in `useMemo`), otherwise the component re-renders forever.
- **Write** only through db actions: `useDb.getState().placeOrder(…)`, `saveProduct`, `adjustStock`…
  Never mutate arrays/objects in place. If an action you need is missing, add it to
  `stores/db.ts` in the same style (goes through `mutate`).
- **Collections are newest first** (`orders`, `purchaseOrders`).
- **Loading:** static collections (`products`, `categories`, `stores`, `employees`, `suppliers`)
  are available on the server render. Dynamic ones (`orders`, `customers`, `stock`, `batches`,
  `promotions`, `shifts`, `purchaseOrders`) are empty until `useDbReady()` is true — show a
  skeleton on storefront pages. Back-office pages render inside `<StaffGate>`, which waits for it.
- **Session:** `useCurrentCustomer()` / `useCurrentStaff()`; wait for `useHydrated()` before
  deciding someone is signed out.
- **Store scope (back office):** `const { storeId } = useStoreScope()` — `null` means the whole
  chain (admin only). Every list/metric must respect it.
- **Permissions:** hide what a role can't do with `canManage(staff.role, "<module>")`.
- **Money** is integer VND → `formatVND`. **Prices/totals** only via `priceCart` (cart, POS,
  orders) and `displayPrice`/`useDisplayPrice` (cards). **Statuses** via `lib/order-status`.
- **Time:** never call `new Date()` during render of something the server also renders — use
  `useNow()` (null on the server). Inside event handlers it's fine.

## Conventions

- Client components need `"use client"`; most pages here are client components.
- `params` / `searchParams` are Promises in Next 16 server components; in client pages use
  `useParams()` / `useSearchParams()` (wrap the component using `useSearchParams` in `<Suspense>`).
- Forms: react-hook-form + zod + shadcn `Field`/`FieldLabel`/`FieldError`. Use `useWatch`, not
  `form.watch` (lint rule).
- Feedback: `toast.success("…")` / `toast.error("…")` in Vietnamese.
- Product photos: `<ProductImage src size>`; icons: `lucide-react`.
- Links: `next/link`. Navigation outside React: `navigate()` from `lib/navigation`.

## Verify before you say "done"

1. `pnpm check-types` and `pnpm lint` are clean.
2. Open the page in the browser (or a headless screenshot) at 1440px and at mobile width, signed
   in as each role that can reach it. No console errors, no hydration warnings.
3. Walk the main flow for real (e.g. place an order → it appears in `/quan-ly/don-hang`).

Demo accounts (password `123456`): `admin@7eleven.demo`, `quanly1006@7eleven.demo`,
`thungan1006@7eleven.demo`. Demo shopper: phone `0901234567`, password `123456` (OTP only on sign-up and password reset; the code shows up in a simulated SMS toast).
