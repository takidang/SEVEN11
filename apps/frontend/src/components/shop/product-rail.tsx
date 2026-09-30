"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import type { Product } from "@/types"

import { ProductCard } from "./product-card"

/** Section title + optional filter chips + "Xem tất cả". */
export function SectionHeading({
  title,
  href,
  chips,
  activeChip,
  onChipClick,
  className,
  children,
}: {
  title: string
  href?: string
  chips?: { id: string; label: string; href?: string }[]
  activeChip?: string
  onChipClick?: (id: string) => void
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <h2 className="text-lg font-bold text-foreground">
        {href ? (
          <Link href={href} className="hover:text-brand">
            {title}
          </Link>
        ) : (
          title
        )}
      </h2>
      {chips?.length ? (
        <div className="-mx-1 no-scrollbar flex max-w-full gap-2 overflow-x-auto px-1">
          {chips.map((chip) => {
            const active = chip.id === activeChip
            const chipClass = cn(
              "shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap ring-1 transition",
              active ? "bg-brand text-white ring-brand" : "bg-white text-brand ring-brand/25 hover:bg-brand-soft",
            )
            return chip.href ? (
              <Link key={chip.id} href={chip.href} className={chipClass}>
                {chip.label}
              </Link>
            ) : (
              <button key={chip.id} type="button" onClick={() => onChipClick?.(chip.id)} className={chipClass}>
                {chip.label}
              </button>
            )
          })}
        </div>
      ) : null}
      {children}
      {href ? (
        <Link href={href} className="ml-auto flex items-center text-sm font-medium text-brand hover:underline">
          Xem tất cả
          <ChevronRightIcon className="size-4" />
        </Link>
      ) : null}
    </div>
  )
}

/** Horizontally scrolling row of product cards with arrow buttons on desktop. */
export function ProductRail({ products, className }: { products: Product[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () =>
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
    update()
    el.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      el.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [products.length])

  const scroll = (dir: 1 | -1) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" })
  }

  return (
    <div className={cn("group/rail relative", className)}>
      <div ref={ref} className="-mx-1 no-scrollbar flex snap-x gap-3 overflow-x-auto scroll-smooth px-1 pb-1">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} className="w-[46%] shrink-0 snap-start sm:w-[180px]" />
        ))}
      </div>
      {!edges.start ? (
        <button
          type="button"
          aria-label="Xem trước"
          onClick={() => scroll(-1)}
          className="absolute top-[38%] -left-3 hidden size-9 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md ring-1 ring-border transition hover:bg-white md:flex"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
      ) : null}
      {!edges.end ? (
        <button
          type="button"
          aria-label="Xem thêm"
          onClick={() => scroll(1)}
          className="absolute top-[38%] -right-3 hidden size-9 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md ring-1 ring-border transition hover:bg-white md:flex"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      ) : null}
    </div>
  )
}

/** Responsive product grid used by category, search and listing pages. */
export function ProductGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6", className)}
    >
      {children}
    </div>
  )
}
