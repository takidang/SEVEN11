"use client"

import { useMemo } from "react"

import { type KeepStatus, keepStatus, monthKey, monthSpendOf } from "@/lib/membership"
import { useDb } from "@/stores/db"
import type { Customer, Promotion, StarEntry } from "@/types"

/** This month's member spend and where the member stands on keeping the tier (null until `now` is known). */
export function useKeepStatus(customer: Customer | null, now: Date | null): KeepStatus | null {
  const orders = useDb((s) => s.orders)
  return useMemo(() => {
    if (!customer || !now) return null
    return keepStatus(customer, monthSpendOf(orders, customer.id, monthKey(now)), now)
  }, [customer, now, orders])
}

/** The member's gold star movements, newest first. */
export function useStarHistory(customerId: string | undefined): StarEntry[] {
  const ledger = useDb((s) => s.starLedger)
  return useMemo(() => (customerId ? ledger.filter((e) => e.customerId === customerId) : []), [ledger, customerId])
}

/** Vouchers the member redeemed with gold stars, newest first. */
export function useMyVouchers(customerId: string | undefined): Promotion[] {
  const promotions = useDb((s) => s.promotions)
  return useMemo(() => (customerId ? promotions.filter((p) => p.ownerId === customerId) : []), [promotions, customerId])
}
