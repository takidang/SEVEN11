"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Horizontal scroller with arrow buttons on desktop — the ProductRail behaviour
 * for anything that isn't a product card (collection tiles, category icons).
 */
export function ScrollRow({
  children,
  label,
  className,
  contentClassName,
  arrowClassName = "top-1/2 -translate-y-1/2",
}: {
  children: React.ReactNode
  /** Accessible name of the list. */
  label: string
  className?: string
  contentClassName?: string
  arrowClassName?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  useEffect(() => {
    const el = scrollerRef.current
    const content = contentRef.current
    if (!el || !content) return
    const update = () =>
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
    update()
    el.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    observer.observe(content)
    return () => {
      el.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [])

  const scroll = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" })
  }

  return (
    <div className={cn("relative", className)}>
      <div ref={scrollerRef} className="-mx-1 no-scrollbar snap-x overflow-x-auto scroll-smooth px-1">
        <div ref={contentRef} role="group" aria-label={label} className={cn("flex w-max gap-3", contentClassName)}>
          {children}
        </div>
      </div>
      {!edges.start ? (
        <button
          type="button"
          aria-label="Xem trước"
          onClick={() => scroll(-1)}
          className={cn(
            "absolute -left-3 hidden size-9 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md ring-1 ring-border transition hover:bg-white md:flex",
            arrowClassName,
          )}
        >
          <ChevronLeftIcon className="size-5" />
        </button>
      ) : null}
      {!edges.end ? (
        <button
          type="button"
          aria-label="Xem thêm"
          onClick={() => scroll(1)}
          className={cn(
            "absolute -right-3 hidden size-9 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md ring-1 ring-border transition hover:bg-white md:flex",
            arrowClassName,
          )}
        >
          <ChevronRightIcon className="size-5" />
        </button>
      ) : null}
    </div>
  )
}
