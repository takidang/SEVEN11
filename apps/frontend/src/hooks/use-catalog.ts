"use client"

import { useMemo } from "react"

import { displayPrice } from "@/lib/pricing"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import type { Product } from "@/types"

/**
 * Catalog hooks. `products` / `categories` start as the static seed catalog
 * (so server rendering has data) and switch to the persisted DB once loaded.
 */
export function useProducts() {
  return useDb((s) => s.products)
}

export function useActiveProducts() {
  const products = useProducts()
  return useMemo(() => products.filter((p) => p.isActive), [products])
}

export function useCategories() {
  return useDb((s) => s.categories)
}

export function usePromotions() {
  return useDb((s) => s.promotions)
}

export function useProductMap() {
  const products = useProducts()
  return useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products])
}

/** Price as a shopper sees it right now (live flash sales applied after mount). */
export function useDisplayPrice(product: Product) {
  const promotions = usePromotions()
  const now = useNow(30_000)
  return useMemo(() => displayPrice(product, promotions, now), [product, promotions, now])
}
