"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { CartLine } from "@/lib/pricing"
import { newId } from "@/stores/db"

/** A bill parked with "Tạm giữ" while the cashier serves the next customer. */
export interface HeldBill {
  id: string
  lines: CartLine[]
  customerId: string | null
  promoCode: string
  heldAt: string
}

export const MAX_HELD_BILLS = 10

interface PosState {
  /** Lines of the bill being rung up, in the order they were scanned. */
  lines: CartLine[]
  customerId: string | null
  /** Promotion code applied to the bill ("" = none). */
  promoCode: string
  held: HeldBill[]
  /** Last product scanned or added — highlighted in the bill. */
  lastAddedId: string | null

  add: (productId: string, quantity?: number) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  setCustomer: (customerId: string | null) => void
  setPromoCode: (code: string) => void
  clearBill: () => void
  /** Park the current bill. Returns it, or null when the bill is empty / too many are held. */
  holdBill: () => HeldBill | null
  /** Bring a held bill back; a non-empty current bill is parked in its place. */
  restoreBill: (heldId: string) => void
  discardHeld: (heldId: string) => void
}

const EMPTY_BILL = { lines: [] as CartLine[], customerId: null, promoCode: "", lastAddedId: null }

function park(s: Pick<PosState, "lines" | "customerId" | "promoCode">): HeldBill {
  return {
    id: newId("hold"),
    lines: s.lines,
    customerId: s.customerId,
    promoCode: s.promoCode,
    heldAt: new Date().toISOString(),
  }
}

/**
 * Client-side state of the cash register. Stock limits and toasts live in the
 * components (they need the DB); this store only holds the bill.
 *
 * Persisted to sessionStorage so a reload doesn't lose the bill or held bills.
 * It hydrates on creation: the POS only renders after <StaffGate> has loaded
 * local data on the client, so there is no server render to mismatch.
 */
export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      ...EMPTY_BILL,
      held: [],

      add: (productId, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === productId)
          const lines = existing
            ? s.lines.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l))
            : [...s.lines, { productId, quantity }]
          return { lines, lastAddedId: productId }
        }),

      setQuantity: (productId, quantity) =>
        set((s) => ({
          lines:
            quantity <= 0
              ? s.lines.filter((l) => l.productId !== productId)
              : s.lines.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
        })),

      remove: (productId) =>
        set((s) => ({
          lines: s.lines.filter((l) => l.productId !== productId),
          lastAddedId: s.lastAddedId === productId ? null : s.lastAddedId,
        })),

      setCustomer: (customerId) => set({ customerId }),

      setPromoCode: (code) => set({ promoCode: code.trim().toUpperCase() }),

      clearBill: () => set(EMPTY_BILL),

      holdBill: () => {
        const s = get()
        if (!s.lines.length || s.held.length >= MAX_HELD_BILLS) return null
        const bill = park(s)
        set({ ...EMPTY_BILL, held: [bill, ...s.held] })
        return bill
      },

      restoreBill: (heldId) =>
        set((s) => {
          const bill = s.held.find((h) => h.id === heldId)
          if (!bill) return {}
          const rest = s.held.filter((h) => h.id !== heldId)
          return {
            held: s.lines.length ? [park(s), ...rest] : rest,
            lines: bill.lines,
            customerId: bill.customerId,
            promoCode: bill.promoCode,
            lastAddedId: null,
          }
        }),

      discardHeld: (heldId) => set((s) => ({ held: s.held.filter((h) => h.id !== heldId) })),
    }),
    {
      name: "7eleven-pos",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ lines: s.lines, customerId: s.customerId, promoCode: s.promoCode, held: s.held }),
    },
  ),
)
