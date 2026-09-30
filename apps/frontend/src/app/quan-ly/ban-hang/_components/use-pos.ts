"use client"

import { useCallback, useMemo } from "react"
import { toast } from "sonner"

import { useProductMap, usePromotions } from "@/hooks/use-catalog"
import { useStockMap } from "@/hooks/use-stock"
import { priceCart } from "@/lib/pricing"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import type { Category, Product } from "@/types"

import { usePosStore } from "./pos-store"

/** The store the register sells for (null = admin hasn't picked one yet). */
export function usePosStoreInfo() {
  const { storeId, canSwitch, setStoreScope } = useStoreScope()
  const store = useDb((s) => (storeId ? (s.stores.find((st) => st.id === storeId) ?? null) : null))
  return { storeId: store?.id ?? null, store, canSwitch, setStoreScope }
}

/** Alcohol etc.: flagged on the product or on its category. */
export function isAgeRestricted(product: Product, categories: Category[]) {
  return !!product.ageRestricted || !!categories.find((c) => c.id === product.categoryId)?.ageRestricted
}

/** The bill priced for the counter (channel "in-store"), refreshed as flash-sale windows open/close. */
export function useBillPricing() {
  const lines = usePosStore((s) => s.lines)
  const customerId = usePosStore((s) => s.customerId)
  const promoCode = usePosStore((s) => s.promoCode)
  const productMap = useProductMap()
  const promotions = usePromotions()
  const customers = useDb((s) => s.customers)
  const now = useNow(15_000)

  const customer = useMemo(
    () => (customerId ? (customers.find((c) => c.id === customerId) ?? null) : null),
    [customers, customerId],
  )
  const pricing = useMemo(
    () =>
      priceCart({
        lines,
        products: productMap,
        promotions,
        channel: "in-store",
        customer,
        code: promoCode || undefined,
        now: now ?? undefined,
      }),
    [lines, productMap, promotions, customer, promoCode, now],
  )
  return { lines, customer, promoCode, pricing }
}

/**
 * Adds products to the bill with the counter's rules: the product must be on
 * sale and the store must physically have the units (stock is per store).
 */
export function useBillActions(storeId: string | null) {
  const stockMap = useStockMap(storeId)

  const available = useCallback((productId: string) => stockMap.get(productId)?.quantity ?? 0, [stockMap])

  const addToBill = useCallback(
    (product: Product, quantity = 1) => {
      if (!storeId) {
        toast.error("Chọn cửa hàng trước khi bán hàng")
        return false
      }
      if (!product.isActive) {
        toast.error(`${product.name} đã ngừng kinh doanh`, { id: `pos-inactive-${product.id}` })
        return false
      }
      const inBill = usePosStore.getState().lines.find((l) => l.productId === product.id)?.quantity ?? 0
      const stock = available(product.id)
      if (inBill + quantity > stock) {
        toast.error(
          stock <= 0
            ? `${product.name} đã hết hàng tại cửa hàng`
            : `Cửa hàng chỉ còn ${stock} ${product.unit} ${product.name}`,
          { id: `pos-stock-${product.id}` },
        )
        return false
      }
      usePosStore.getState().add(product.id, quantity)
      return true
    },
    [storeId, available],
  )

  const setLineQuantity = useCallback(
    (product: Product, quantity: number) => {
      const stock = available(product.id)
      if (quantity > stock) {
        toast.error(
          stock <= 0
            ? `${product.name} đã hết hàng tại cửa hàng`
            : `Cửa hàng chỉ còn ${stock} ${product.unit} ${product.name}`,
          { id: `pos-stock-${product.id}` },
        )
        if (stock >= 1) usePosStore.getState().setQuantity(product.id, stock)
        return
      }
      usePosStore.getState().setQuantity(product.id, Math.max(1, quantity))
    },
    [available],
  )

  return { addToBill, setLineQuantity, available, stockMap }
}
