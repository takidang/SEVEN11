# apps/frontend

Next.js 16 app gồm **cửa hàng online** và **khu quản lý** của đồ án 7-Eleven. Chạy độc lập bằng
dữ liệu giả lưu trong trình duyệt (IndexedDB).

```bash
pnpm install
pnpm dev            # http://localhost:3711
pnpm check-types    # next typegen + tsc
pnpm lint
pnpm format
pnpm build
```

| Tài liệu                                    |                                                            |
| ------------------------------------------- | ---------------------------------------------------------- |
| Quy ước code, luật dữ liệu, danh sách route | [`CLAUDE.md`](CLAUDE.md)                                   |
| Hệ thống thiết kế                           | [`docs/design-system.md`](docs/design-system.md)           |
| Kiến trúc & bàn giao backend                | [`../../docs/architecture.md`](../../docs/architecture.md) |

Stack: Next.js 16.3 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui
(Radix) · Zustand · React Hook Form + Zod · TanStack Table · Recharts · Sonner.
