import type { Customer, MemberTier, Order, TierChange } from "@/types"

import { formatVND } from "./format"

/**
 * Membership rules (team decision 09/2026; research in docs/research/chuong-trinh-thanh-vien.md):
 * - Tiers Đồng → Bạc → Vàng → Kim cương. Net spend (after every discount, alcohol excluded)
 *   accumulates in `tierSpend`; reaching the next tier's threshold upgrades at once.
 * - Keeping a tier: on the 1st of each month, last month's net spend must reach the tier's monthly
 *   minimum. Otherwise the member drops ONE tier and `tierSpend` goes back to that tier's threshold,
 *   so climbing back needs the gap again. The month of an upgrade is not checked.
 * Gold stars are in lib/stars.
 */
export interface TierInfo {
  id: MemberTier
  label: string
  /** Accumulated net spend that reaches this tier. */
  minSpend: number
  /** Net spend needed every month to keep the tier (0: nothing to keep). */
  keepPerMonth: number
  /** Member voucher: off each drink (VND). */
  drinkVoucher: number
  vouchersPerMonth: number
  birthdayDrinkDiscount: number
  freeDrink: string
  /** Tailwind classes for chips/badges (tinted, readable on white). */
  className: string
  /** Tailwind classes for big surfaces — member card, tier cards (soft gradient + its own ink). */
  faceClassName: string
}

export const TIERS: Record<MemberTier, TierInfo> = {
  bronze: {
    id: "bronze",
    label: "Đồng",
    minSpend: 0,
    keepPerMonth: 0,
    drinkVoucher: 2_000,
    vouchersPerMonth: 5,
    birthdayDrinkDiscount: 0.2,
    freeDrink: "Gói quà khách mới: tới 3 ly nước miễn phí",
    className: "bg-gradient-to-r from-[#fbead9] to-[#f2d5b8] text-[#8a4a1c] ring-1 ring-[#e7c3a4]",
    faceClassName: "bg-gradient-to-br from-[#fdf2e6] via-[#f7ddc2] to-[#eec69c] text-[#7a3f18]",
  },
  silver: {
    id: "silver",
    label: "Bạc",
    minSpend: 1_000_000,
    keepPerMonth: 200_000,
    drinkVoucher: 3_000,
    vouchersPerMonth: 10,
    birthdayDrinkDiscount: 0.3,
    freeDrink: "1 ly nước miễn phí mỗi tháng (hoá đơn từ 58.000 ₫)",
    className: "bg-gradient-to-r from-[#f3f6fa] to-[#e1e7ef] text-[#465468] ring-1 ring-[#c9d2de]",
    faceClassName: "bg-gradient-to-br from-[#fbfcfe] via-[#e8edf4] to-[#d4dce7] text-[#3f4a5c]",
  },
  gold: {
    id: "gold",
    label: "Vàng",
    minSpend: 3_000_000,
    keepPerMonth: 350_000,
    drinkVoucher: 6_000,
    vouchersPerMonth: 20,
    birthdayDrinkDiscount: 0.4,
    freeDrink: "2 ly nước miễn phí mỗi tháng (hoá đơn từ 58.000 ₫)",
    className: "bg-gradient-to-r from-[#fdf3cf] to-[#f6e0a2] text-[#7a5405] ring-1 ring-[#e8cd77]",
    faceClassName: "bg-gradient-to-br from-[#fef8e2] via-[#f8e5ab] to-[#efce76] text-[#6f4a04]",
  },
  diamond: {
    id: "diamond",
    label: "Kim cương",
    minSpend: 5_000_000,
    keepPerMonth: 500_000,
    drinkVoucher: 9_000,
    vouchersPerMonth: 30,
    birthdayDrinkDiscount: 0.5,
    freeDrink: "1 ly nước miễn phí mỗi tuần (hoá đơn từ 58.000 ₫)",
    className: "bg-gradient-to-r from-[#e9f4ff] via-[#ede6ff] to-[#fce9f6] text-[#4b3f9e] ring-1 ring-[#d7d2f2]",
    faceClassName: "bg-gradient-to-br from-[#e6f3ff] via-[#eae3ff] to-[#fbe4f2] text-[#453a90]",
  },
}

export const TIER_ORDER: MemberTier[] = ["bronze", "silver", "gold", "diamond"]

/** Categories whose items count as "đồ uống" for member drink vouchers. */
export const DRINK_CATEGORY_IDS = ["tra-sua"]

/** Categories excluded from member spend (alcohol). */
export const NON_ELIGIBLE_CATEGORY_IDS = ["do-uong-co-con"]

/** Max member drink vouchers usable in a single order. */
export const MAX_DRINK_VOUCHERS_PER_ORDER = 3

const rank = (tier: MemberTier) => TIER_ORDER.indexOf(tier)

/** Highest tier whose threshold the accumulated spend reaches. */
export function tierForSpend(spend: number): MemberTier {
  return [...TIER_ORDER].reverse().find((t) => spend >= TIERS[t].minSpend) ?? "bronze"
}

export function nextTier(tier: MemberTier): TierInfo | null {
  const i = rank(tier)
  return i < TIER_ORDER.length - 1 ? TIERS[TIER_ORDER[i + 1]] : null
}

export function previousTier(tier: MemberTier): MemberTier | null {
  const i = rank(tier)
  return i > 0 ? TIER_ORDER[i - 1] : null
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** "2026-09" */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function monthStart(key: string): Date {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1)
}

/** Month key `n` months later (negative: earlier). */
export function shiftMonth(key: string, n: number): string {
  const d = monthStart(key)
  return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

/** "09/2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-")
  return `${m}/${y}`
}

// ---------------------------------------------------------------------------
// Spend → tier
// ---------------------------------------------------------------------------

/** Adds an order's net spend; upgrades right away when it reaches a threshold. */
export function addTierSpend(c: Customer, amount: number, at: Date): Partial<Customer> {
  const tierSpend = c.tierSpend + Math.max(0, amount)
  const reached = tierForSpend(tierSpend)
  if (rank(reached) <= rank(c.tier)) return { tierSpend }
  const change: TierChange = {
    at: at.toISOString(),
    from: c.tier,
    to: reached,
    reason: `Chi tiêu tích luỹ đạt ${formatVND(TIERS[reached].minSpend)}`,
  }
  return {
    tierSpend,
    tier: reached,
    tierSince: at.toISOString(),
    graceMonth: monthKey(at),
    tierHistory: [change, ...c.tierHistory],
  }
}

/**
 * Takes a cancelled order's spend back off. Spend from before the last drop no longer counts
 * (the drop already reset it); below the current tier's threshold the tier follows the spend.
 */
export function removeTierSpend(c: Customer, amount: number, orderAt: string, at: Date): Partial<Customer> {
  const lastDrop = c.tierHistory.find((h) => rank(h.to) < rank(h.from))
  if (lastDrop && orderAt < lastDrop.at) return {}
  const tierSpend = Math.max(0, c.tierSpend - amount)
  if (tierSpend >= TIERS[c.tier].minSpend) return { tierSpend }
  const to = tierForSpend(tierSpend)
  return {
    tierSpend,
    tier: to,
    tierSince: at.toISOString(),
    graceMonth: undefined,
    tierHistory: [
      { at: at.toISOString(), from: c.tier, to, reason: "Đơn hàng bị huỷ, chi tiêu tích luỹ không còn đủ mốc" },
      ...c.tierHistory,
    ],
  }
}

/**
 * Keep-the-tier check for a finished month (run on the 1st of the next month).
 * Returns the changes when the member drops a tier, or null when the tier stays.
 */
export function checkKeepTier(c: Customer, month: string, spend: number, at: Date): Partial<Customer> | null {
  const keep = TIERS[c.tier].keepPerMonth
  const to = previousTier(c.tier)
  if (!keep || !to || spend >= keep) return null
  if (c.graceMonth === month || monthKey(new Date(c.tierSince)) > month) return null
  const change: TierChange = {
    at: at.toISOString(),
    from: c.tier,
    to,
    reason: `Tháng ${monthLabel(month)} chi ${formatVND(spend)}, chưa đủ ${formatVND(keep)} để giữ hạng ${TIERS[c.tier].label}`,
  }
  return {
    tier: to,
    tierSpend: TIERS[to].minSpend,
    tierSince: at.toISOString(),
    graceMonth: undefined,
    tierHistory: [change, ...c.tierHistory],
  }
}

/** Member spend per customer per month ("yyyy-MM"), from orders that were not cancelled. */
export function memberSpendByMonth(orders: Order[]): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()
  for (const o of orders) {
    if (!o.customerId || !o.memberSpend || o.status === "cancelled") continue
    const months = result.get(o.customerId) ?? new Map<string, number>()
    const key = monthKey(new Date(o.createdAt))
    months.set(key, (months.get(key) ?? 0) + o.memberSpend)
    result.set(o.customerId, months)
  }
  return result
}

export function monthSpendOf(orders: Order[], customerId: string, month: string): number {
  return orders.reduce(
    (sum, o) =>
      o.customerId === customerId && o.status !== "cancelled" && monthKey(new Date(o.createdAt)) === month
        ? sum + (o.memberSpend ?? 0)
        : sum,
    0,
  )
}

export interface KeepStatus {
  month: string
  /** Monthly minimum for the current tier (0 for Đồng). */
  required: number
  spent: number
  missing: number
  /** Days left in the month, today included. */
  daysLeft: number
  /** Why this month is not checked: base tier, or the month of an upgrade. */
  exempt: "base-tier" | "upgrade-month" | null
  /** Tier the member falls to if the month ends short. */
  dropTo: MemberTier | null
}

/** Where the member stands on keeping the tier this month. */
export function keepStatus(c: Customer, spentThisMonth: number, now: Date): KeepStatus {
  const month = monthKey(now)
  const required = TIERS[c.tier].keepPerMonth
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const daysLeft = end.getDate() - now.getDate() + 1
  const exempt = !required ? "base-tier" : c.graceMonth === month ? "upgrade-month" : null
  return {
    month,
    required,
    spent: spentThisMonth,
    missing: Math.max(0, required - spentThisMonth),
    daysLeft,
    exempt,
    dropTo: exempt ? null : previousTier(c.tier),
  }
}
