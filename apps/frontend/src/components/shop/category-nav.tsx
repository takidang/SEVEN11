"use client"

import { ChevronDownIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useState } from "react"

import { Wordmark } from "@/components/brand/logo"
import { useCategories } from "@/hooks/use-catalog"
import { cn } from "@/lib/utils"

const PROMO_LINKS = [
  { href: "/khuyen-mai", label: "Flash sale & khuyến mãi" },
  { href: "/thanh-vien", label: "Chương trình thành viên" },
  { href: "/cua-hang", label: "Danh sách cửa hàng" },
]

/** Category accordion from the 7-eleven.vn sidebar. Used on desktop and in the mobile menu. */
export function CategoryNav({ onNavigate }: { onNavigate?: () => void }) {
  const categories = useCategories()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeSlug = pathname.startsWith("/danh-muc/") ? pathname.split("/")[2] : null
  const activeSub = searchParams.get("nhom")
  const [open, setOpen] = useState<string | null>(activeSlug)

  return (
    <nav aria-label="Danh mục sản phẩm">
      <div className="bg-brand px-4 py-3 text-[15px] font-bold tracking-wide text-white uppercase">
        Danh mục sản phẩm
      </div>
      <ul className="py-1">
        {categories.map((c) => {
          const expanded = open === c.id
          const active = activeSlug === c.slug
          return (
            <li key={c.id}>
              <div className="flex items-center">
                <Link
                  href={`/danh-muc/${c.slug}`}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-1 pl-4 text-[15px] font-medium transition hover:text-brand",
                    active ? "text-brand" : "text-foreground/85",
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  {c.isHot ? (
                    <span className="rounded-full bg-orange px-1.5 py-px text-[10px] leading-4 font-bold text-white">
                      HOT
                    </span>
                  ) : null}
                </Link>
                <button
                  type="button"
                  aria-label={expanded ? `Thu gọn ${c.name}` : `Mở ${c.name}`}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : c.id)}
                  className="mr-2 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <ChevronDownIcon className={cn("size-4 transition", expanded && "rotate-180")} />
                </button>
              </div>
              {expanded ? (
                <ul className="mb-1 ml-5 border-l-2 border-brand/20">
                  {c.subcategories.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/danh-muc/${c.slug}?nhom=${s.slug}`}
                        onClick={onNavigate}
                        className={cn(
                          "block py-1.5 pr-3 pl-4 text-sm transition hover:text-brand",
                          active && activeSub === s.slug ? "font-medium text-brand" : "text-muted-foreground",
                        )}
                      >
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="mt-1 bg-brand px-4 py-3 text-[15px] font-bold tracking-wide text-white uppercase">
        Khuyến mãi &amp; ưu đãi
      </div>
      <ul className="py-1">
        {PROMO_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              onClick={onNavigate}
              className={cn(
                "block px-4 py-2.5 text-[15px] font-medium transition hover:text-brand",
                pathname === l.href ? "text-brand" : "text-foreground/85",
              )}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Desktop left rail: big logotype + CategoryNav. */
export function ShopSidebar() {
  return (
    <div className="pb-6">
      <Link href="/" className="block px-4 pt-3 pb-3" aria-label="Trang chủ">
        <Wordmark className="text-[46px]" />
      </Link>
      <CategoryNav />
    </div>
  )
}
