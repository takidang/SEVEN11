"use client"

import { BikeIcon } from "lucide-react"
import Link from "next/link"

import { useDisplayPrice } from "@/hooks/use-catalog"
import { discountPercent, formatVND } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Product } from "@/types"

import { QuickAddButton } from "./add-to-cart"
import { Countdown } from "./countdown"
import { ProductImage } from "./product-image"

/**
 * Storefront product card — mirrors the 7-eleven.vn card: square photo, two-line
 * name, bold price with struck-through original + % tag, flash-sale countdown,
 * green "Giao 24 phút" and the round quick-add button.
 */
export function ProductCard({
  product,
  className,
  priority,
}: {
  product: Product
  className?: string
  priority?: boolean
}) {
  const { price, compareAtPrice, flashSale, flashEndsAt } = useDisplayPrice(product)
  const percent = discountPercent(price, compareAtPrice)
  const href = `/san-pham/${product.slug}`

  return (
    <article
      className={cn(
        "group/card relative flex flex-col rounded-xl bg-card p-2 ring-1 ring-border/80 transition hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] hover:ring-brand/30",
        className,
      )}
    >
      <Link href={href} className="relative block overflow-hidden rounded-lg bg-white" tabIndex={-1} aria-hidden>
        <ProductImage
          src={product.image}
          alt={product.name}
          size={180}
          priority={priority}
          className="aspect-square w-full transition duration-300 group-hover/card:scale-[1.03]"
        />
        <div className="pointer-events-none absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
          {flashSale ? (
            <span className="rounded-md bg-red px-1.5 py-0.5 text-[11px] font-bold text-white uppercase">
              Flash sale
            </span>
          ) : null}
          {product.isNew ? (
            <span className="rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white uppercase">Mới</span>
          ) : null}
          {product.ageRestricted ? (
            <span className="rounded-md bg-foreground/85 px-1.5 py-0.5 text-[11px] font-bold text-white">18+</span>
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col px-1 pt-2">
        <h3 className="line-clamp-2 min-h-10 text-[13px] leading-5 text-foreground">
          <Link href={href} className="hover:text-brand focus-visible:underline focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>

        <div className="mt-1.5 min-h-[42px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold text-foreground">{formatVND(price)}</span>
            {percent ? (
              <span className="rounded bg-sale-soft px-1 py-px text-[11px] font-semibold text-sale">-{percent}%</span>
            ) : null}
          </div>
          {compareAtPrice && compareAtPrice > price ? (
            <div className="text-xs text-muted-foreground line-through">{formatVND(compareAtPrice)}</div>
          ) : null}
        </div>

        {flashSale && flashEndsAt ? <Countdown endsAt={flashEndsAt} className="mt-1 text-muted-foreground" /> : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-fresh">
            <BikeIcon className="size-4" />
            Giao 24 phút
          </span>
          <QuickAddButton product={product} />
        </div>
      </div>
    </article>
  )
}

/** Skeleton with the same footprint as ProductCard. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl p-2 ring-1 ring-border/60">
      <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
      <div className="mt-2 h-4 w-11/12 animate-pulse rounded bg-muted" />
      <div className="mt-1.5 h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-5 w-1/2 animate-pulse rounded bg-muted" />
      <div className="mt-4 flex justify-between">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="size-8 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  )
}
