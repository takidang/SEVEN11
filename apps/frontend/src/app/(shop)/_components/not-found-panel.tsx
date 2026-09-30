import { SearchXIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

import { Headline } from "./headline"

const SHORTCUTS = [
  { href: "/danh-muc/tra-sua", label: "Trà sữa & Trà trái cây" },
  { href: "/danh-muc/mon-ngon", label: "Món ngon nhà Bảy" },
  { href: "/danh-muc/do-an-vat", label: "Đồ ăn vặt" },
  { href: "/khuyen-mai", label: "Flash sale hôm nay" },
]

/** 404 content inside the storefront frame (unknown product / category). */
export function NotFoundPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center sm:py-16">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchXIcon className="size-6" />
      </span>
      <Headline as="p" className="mt-4 text-sm tracking-wide text-muted-foreground">
        Lỗi 404
      </Headline>
      <h1 className="mt-1 text-xl font-bold text-balance text-foreground sm:text-2xl">{title}</h1>
      <p className="mt-2 text-sm text-balance text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild size="lg" className="h-10 px-4">
          <Link href="/">Về trang chủ</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-10 px-4">
          <Link href="/khuyen-mai">Xem khuyến mãi</Link>
        </Button>
      </div>
      <div className="mt-8 w-full border-t pt-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Có thể bạn đang tìm</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block rounded-full bg-white px-3 py-1 text-sm text-brand ring-1 ring-brand/25 transition hover:bg-brand-soft"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
