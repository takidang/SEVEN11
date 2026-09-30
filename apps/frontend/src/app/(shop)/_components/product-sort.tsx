"use client"

import { ArrowUpDownIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useMemo } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePromotions } from "@/hooks/use-catalog"
import { discountPercent } from "@/lib/format"
import { displayPrice } from "@/lib/pricing"
import { replaceQuery } from "@/lib/query"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { useDbReady, useNow } from "@/stores/hydration"
import type { Product } from "@/types"

export type SortKey = "phu-hop" | "pho-bien" | "gia-tang" | "gia-giam" | "giam-gia" | "moi-nhat"

export const SORT_LABEL: Record<SortKey, string> = {
  "phu-hop": "Phù hợp nhất",
  "pho-bien": "Phổ biến",
  "gia-tang": "Giá thấp → cao",
  "gia-giam": "Giá cao → thấp",
  "giam-gia": "Đang giảm giá",
  "moi-nhat": "Mới nhất",
}

export const LISTING_SORTS: SortKey[] = ["pho-bien", "gia-tang", "gia-giam", "giam-gia", "moi-nhat"]

/** URL query key for the sort order (`?sapxep=gia-tang`). */
export const SORT_PARAM = "sapxep"

/** Units sold per product over the order history (empty until the DB is ready). */
export function useSalesRank() {
  const orders = useDb((s) => s.orders)
  return useMemo(() => {
    const units = new Map<string, number>()
    for (const order of orders) {
      if (order.status === "cancelled") continue
      for (const item of order.items) units.set(item.productId, (units.get(item.productId) ?? 0) + item.quantity)
    }
    return units
  }, [orders])
}

/**
 * Sort products the way a shopper sees them: prices include live flash sales,
 * "Phổ biến" ranks by units sold. `relevance` (search) wins for "phu-hop".
 * Returns null until orders, promotions and the clock are loaded (render a skeleton),
 * so the grid never shows an order that jumps a moment later.
 */
export function useSortedProducts(
  products: Product[],
  sort: SortKey,
  relevance?: Map<string, number>,
): Product[] | null {
  const promotions = usePromotions()
  const now = useNow(60_000)
  const ready = useDbReady()
  const sales = useSalesRank()

  return useMemo(() => {
    if (!ready || !now) return null
    const position = new Map(products.map((p, i) => [p.id, i] as const))
    const byPopularity = (a: Product, b: Product) =>
      (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0) || position.get(a.id)! - position.get(b.id)!
    const shown = new Map(products.map((p) => [p.id, displayPrice(p, promotions, now)] as const))
    const price = (p: Product) => shown.get(p.id)!.price
    const discount = (p: Product) => discountPercent(price(p), shown.get(p.id)!.compareAtPrice) ?? 0
    const sorted = [...products]

    switch (sort) {
      case "phu-hop":
        return sorted.sort((a, b) => (relevance?.get(b.id) ?? 0) - (relevance?.get(a.id) ?? 0) || byPopularity(a, b))
      case "gia-tang":
        return sorted.sort((a, b) => price(a) - price(b) || byPopularity(a, b))
      case "gia-giam":
        return sorted.sort((a, b) => price(b) - price(a) || byPopularity(a, b))
      case "giam-gia":
        return sorted.sort((a, b) => discount(b) - discount(a) || byPopularity(a, b))
      case "moi-nhat":
        return sorted.sort(
          (a, b) =>
            Number(!!b.isNew) - Number(!!a.isNew) || b.createdAt.localeCompare(a.createdAt) || byPopularity(a, b),
        )
      default:
        return sorted.sort(byPopularity)
    }
  }, [products, sort, relevance, promotions, now, ready, sales])
}

/** Sort order kept in the URL (`?sapxep=`) so it survives reloads and shared links. */
export function useSortParam(options: SortKey[], fallback: SortKey) {
  const searchParams = useSearchParams()
  const raw = searchParams.get(SORT_PARAM) as SortKey | null
  const sort = raw && options.includes(raw) ? raw : fallback
  const setSort = (next: SortKey) => replaceQuery({ [SORT_PARAM]: next === fallback ? null : next })
  return [sort, setSort] as const
}

/**
 * Sort dropdown. With `compact`, phones get an icon-only trigger (a dot marks a
 * non-default order) so the chips next to it keep their room.
 */
export function SortSelect({
  value,
  options,
  onChange,
  compact = false,
  isDefault = false,
  className,
}: {
  value: SortKey
  options: SortKey[]
  onChange: (value: SortKey) => void
  compact?: boolean
  /** Hides the "changed" dot of the compact trigger. */
  isDefault?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger
        aria-label={`Sắp xếp: ${SORT_LABEL[value]}`}
        className={cn("h-9 min-w-44 bg-white", compact && "max-sm:min-w-0 max-sm:gap-1 max-sm:px-2", className)}
      >
        <span className="relative flex min-w-0 items-center gap-2">
          <ArrowUpDownIcon className={cn("text-muted-foreground", compact && "max-sm:text-foreground")} />
          {compact && !isDefault ? (
            <span className="absolute -top-1 -left-1 size-2 rounded-full bg-brand ring-2 ring-white sm:hidden" />
          ) : null}
          <span className={cn("min-w-0", compact && "max-sm:sr-only")}>
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {SORT_LABEL[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
