"use client"

import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"

/** The back-office store scope plus a label for page descriptions. */
export function useScopeInfo() {
  const { storeId } = useStoreScope()
  const stores = useDb((s) => s.stores)
  const store = storeId ? (stores.find((s) => s.id === storeId) ?? null) : null
  const label = storeId
    ? store
      ? `Cửa hàng ${store.code} – ${store.name}`
      : "Cửa hàng"
    : `Toàn chuỗi · ${stores.length} cửa hàng`
  return { storeId, store, stores, isChain: !storeId, label }
}
