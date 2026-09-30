"use client"

import { useMemo } from "react"

import type { Tone } from "@/lib/order-status"
import { useDb } from "@/stores/db"

export interface StockSummary {
  quantity: number
  minQuantity: number
}

export type StockState = "out" | "low" | "ok"

export const STOCK_STATE: Record<StockState, { label: string; tone: Tone }> = {
  out: { label: "Hết hàng", tone: "danger" },
  low: { label: "Sắp hết", tone: "warning" },
  ok: { label: "Còn hàng", tone: "fresh" },
}

export function stockState(level: StockSummary | undefined): StockState {
  if (!level || level.quantity <= 0) return "out"
  if (level.quantity <= level.minQuantity) return "low"
  return "ok"
}

/**
 * productId → stock for one store, or summed over the chain when `storeId` is null.
 * Empty until the DB is ready.
 */
export function useStockMap(storeId: string | null) {
  const stock = useDb((s) => s.stock)
  return useMemo(() => {
    const map = new Map<string, StockSummary>()
    for (const level of stock) {
      if (storeId && level.storeId !== storeId) continue
      const prev = map.get(level.productId)
      if (prev) {
        prev.quantity += level.quantity
        prev.minQuantity += level.minQuantity
      } else {
        map.set(level.productId, { quantity: level.quantity, minQuantity: level.minQuantity })
      }
    }
    return map
  }, [stock, storeId])
}
