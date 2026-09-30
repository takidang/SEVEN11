import { ArrowRightIcon, SearchIcon } from "lucide-react"
import Link from "next/link"

import { LogoMark, Wordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

const POPULAR = [
  { href: "/danh-muc/tra-sua", label: "Trà sữa & Trà trái cây" },
  { href: "/danh-muc/mon-ngon", label: "Món ngon nhà Bảy" },
  { href: "/danh-muc/cac-loai-banh", label: "Các loại bánh" },
  { href: "/danh-muc/do-uong-dong-chai", label: "Đồ uống đóng chai" },
  { href: "/cua-hang", label: "Danh sách cửa hàng" },
]

/** App-wide 404 for URLs that match no route (storefront and back office alike). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-b border-border/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4">
          <Link href="/" aria-label="Trang chủ" className="flex items-center gap-2.5">
            <LogoMark className="size-9" />
            <Wordmark className="text-2xl" />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center px-4 py-12">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
          <p
            aria-hidden
            className="text-[112px] leading-none font-black uppercase italic select-none sm:text-[150px]"
            style={{ fontStretch: "75%", letterSpacing: "-0.02em" }}
          >
            <span className="text-red">4</span>
            <span className="text-orange">0</span>
            <span className="text-brand">4</span>
          </p>
          <h1 className="mt-4 text-2xl font-bold text-balance text-foreground">Không tìm thấy trang bạn cần</h1>
          <p className="mt-2 text-sm text-balance text-muted-foreground sm:text-base">
            Đường dẫn có thể đã thay đổi hoặc không còn tồn tại. Cửa hàng vẫn mở cửa 24 giờ, mời bạn quay lại trang chủ
            để tiếp tục mua sắm.
          </p>
          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="h-11 px-5 text-[15px]">
              <Link href="/">Về trang chủ</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-5 text-[15px]">
              <Link href="/khuyen-mai">Xem flash sale hôm nay</Link>
            </Button>
          </div>

          <div className="mt-10 w-full rounded-xl bg-surface p-5 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SearchIcon className="size-4 text-brand" />
              Có thể bạn đang tìm
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {POPULAR.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-full bg-white px-3 py-1 text-sm text-brand ring-1 ring-brand/25 transition hover:bg-brand-soft"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/quan-ly"
            className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand"
          >
            Nhân viên cửa hàng? Vào trang quản lý
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </main>

      <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
        Đồ án môn học lấy cảm hứng từ 7-Eleven Việt Nam, không phải website chính thức của 7-Eleven.
      </footer>
    </div>
  )
}
