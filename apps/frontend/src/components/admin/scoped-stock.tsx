"use client"

import { useMemo } from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { STOCK_STATE, type StockState, stockState, type StockSummary, useStockMap } from "@/hooks/use-stock"
import { formatNumber } from "@/lib/format"
import { useDb } from "@/stores/db"

export interface ScopedStock extends StockSummary {
  /**
   * One store: that store's state. Whole chain: "out" when any store is out of stock,
   * "low" when any store is at/below its minimum — a chain total hides empty shelves.
   */
  state: StockState
  lowStores: number
  outStores: number
  /** Which stores are affected, so the badge can name them instead of only counting. */
  lowStoreIds: string[]
  outStoreIds: string[]
  /** Quantity left in each affected store, for the list behind the badge. */
  quantityByStore: Map<string, number>
}

/** productId → stock in the current scope (a store, or chain totals + which stores need restocking). */
export function useScopedStock(storeId: string | null): Map<string, ScopedStock> {
  const stock = useDb((s) => s.stock)
  const totals = useStockMap(storeId)
  return useMemo(() => {
    const map = new Map<string, ScopedStock>()
    for (const [productId, level] of totals) {
      const state = stockState(level)
      map.set(productId, {
        ...level,
        state,
        lowStores: state === "low" ? 1 : 0,
        outStores: state === "out" ? 1 : 0,
        lowStoreIds: state === "low" && storeId ? [storeId] : [],
        outStoreIds: state === "out" && storeId ? [storeId] : [],
        quantityByStore: storeId ? new Map([[storeId, level.quantity]]) : new Map(),
      })
    }
    if (storeId) return map

    for (const entry of map.values()) {
      entry.lowStoreIds = []
      entry.outStoreIds = []
      entry.quantityByStore = new Map()
    }
    for (const level of stock) {
      const entry = map.get(level.productId)
      if (!entry) continue
      const state = stockState(level)
      if (state === "out") entry.outStoreIds.push(level.storeId)
      else if (state === "low") entry.lowStoreIds.push(level.storeId)
      else continue
      entry.quantityByStore.set(level.storeId, level.quantity)
    }
    for (const entry of map.values()) {
      entry.outStores = entry.outStoreIds.length
      entry.lowStores = entry.lowStoreIds.length
      entry.state = entry.outStores ? "out" : entry.lowStores ? "low" : "ok"
    }
    return map
  }, [stock, totals, storeId])
}

/**
 * Stock state pill. In chain scope it counts the affected stores and, on click, names them —
 * "hết ở 2 cửa hàng" is useless until you know which two.
 */
export function StockBadge({
  stock,
  chain,
  hideOk = false,
}: {
  stock: ScopedStock | undefined
  chain: boolean
  hideOk?: boolean
}) {
  const stores = useDb((s) => s.stores)
  const state = stock?.state ?? "out"
  if (state === "ok" && hideOk) return null
  const { tone, label } = STOCK_STATE[state]
  if (!chain || !stock || state === "ok") return <StatusBadge tone={tone}>{label}</StatusBadge>

  const out = state === "out"
  const ids = out ? stock.outStoreIds : stock.lowStoreIds
  const named = ids
    .map((id) => stores.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <Popover>
      <PopoverTrigger asChild onClick={(event) => event.stopPropagation()}>
        <button type="button" className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <StatusBadge tone={tone} className="cursor-pointer hover:brightness-95">
            {out ? `Hết ở ${stock.outStores} cửa hàng` : `Sắp hết ở ${stock.lowStores} cửa hàng`}
          </StatusBadge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" onClick={(event) => event.stopPropagation()}>
        <p className="border-b px-3 py-2 text-xs font-semibold">
          {out ? "Hết hàng tại" : "Sắp hết tại"} {named.length} cửa hàng
        </p>
        <ul className="max-h-60 overflow-y-auto py-1 text-sm">
          {named.map((store) => (
            <li key={store.id} className="flex items-baseline justify-between gap-2 px-3 py-1.5">
              <span className="min-w-0 truncate">
                {store.code} – {store.name}
              </span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                còn {formatNumber(stock.quantityByStore.get(store.id) ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
