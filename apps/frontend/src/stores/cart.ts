"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { stores } from "@/data/stores"
import { storesByDistance } from "@/lib/geo"
import type { CartLine } from "@/lib/pricing"

export interface DeliveryAddress {
  line: string
  ward: string
  province: string
  /** Set when the shopper shared their location. */
  lat?: number
  lng?: number
}

interface CartState {
  lines: CartLine[]
  deliveryAddress: DeliveryAddress | null
  /** Store that fulfils the order — chosen from the delivery province. */
  storeId: string
  promoCode: string
  note: string
  /** Shopper confirmed they are 18+ (alcohol). Asked once per session. */
  ageConfirmed: boolean

  add: (productId: string, quantity?: number) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
  setDeliveryAddress: (address: DeliveryAddress) => void
  setStoreId: (storeId: string) => void
  setPromoCode: (code: string) => void
  setNote: (note: string) => void
  confirmAge: () => void
}

export const DEFAULT_STORE_ID = "st-1006"

/** First open store in a province — the fallback when we have no coordinates. */
export function storeForProvince(province: string) {
  return stores.find((s) => s.province === province && s.status === "active")?.id ?? DEFAULT_STORE_ID
}

/**
 * Store that fulfils an order: the open store closest to the address when it has coordinates,
 * otherwise the first one in the same province. Without this a shopper in Tân Bình was always
 * served by the first store in the list (Quận 1).
 */
export function storeForAddress(address: Pick<DeliveryAddress, "province" | "lat" | "lng">) {
  const open = stores.filter((s) => s.status === "active")
  if (address.lat === undefined || address.lng === undefined) return storeForProvince(address.province)
  const sameProvince = open.filter((s) => s.province === address.province)
  const candidates = sameProvince.length ? sameProvince : open
  return storesByDistance(candidates, { lat: address.lat, lng: address.lng })[0]?.id ?? DEFAULT_STORE_ID
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      deliveryAddress: null,
      storeId: DEFAULT_STORE_ID,
      promoCode: "",
      note: "",
      ageConfirmed: false,

      add: (productId, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === productId)
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.productId === productId ? { ...l, quantity: Math.min(99, l.quantity + quantity) } : l,
              ),
            }
          }
          return { lines: [...s.lines, { productId, quantity: Math.min(99, quantity) }] }
        }),
      setQuantity: (productId, quantity) =>
        set((s) => ({
          lines:
            quantity <= 0
              ? s.lines.filter((l) => l.productId !== productId)
              : s.lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(99, quantity) } : l)),
        })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [], promoCode: "", note: "" }),
      setDeliveryAddress: (address) => set({ deliveryAddress: address, storeId: storeForAddress(address) }),
      setStoreId: (storeId) => set({ storeId }),
      setPromoCode: (promoCode) => set({ promoCode }),
      setNote: (note) => set({ note }),
      confirmAge: () => set({ ageConfirmed: true }),
    }),
    {
      name: "7eleven-cart",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
)

/** Total units in the cart (badge on the header). */
export function useCartCount() {
  return useCart((s) => s.lines.reduce((sum, l) => sum + l.quantity, 0))
}
