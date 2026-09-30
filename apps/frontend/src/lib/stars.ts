import type { StarEntry } from "@/types"

/**
 * Gold stars ("sao vàng"): 1 star per 45.000 ₫ of member spend (after discounts, alcohol excluded).
 * The remainder carries over to the next order. Stars expire 12 months after they were earned,
 * oldest first, and are redeemed for personal vouchers (STAR_REWARDS).
 */
export const STAR_SPEND = 45_000
export const STAR_VALID_MONTHS = 12
/** Vouchers bought with stars stay valid this many days. */
export const REWARD_VOUCHER_DAYS = 30

export interface StarReward {
  id: string
  stars: number
  /** Voucher value (VND off the order). */
  value: number
  minOrderValue: number
}

export const STAR_REWARDS: StarReward[] = [
  { id: "sao-10", stars: 10, value: 10_000, minOrderValue: 50_000 },
  { id: "sao-20", stars: 20, value: 22_000, minOrderValue: 100_000 },
  { id: "sao-50", stars: 50, value: 60_000, minOrderValue: 200_000 },
  { id: "sao-100", stars: 100, value: 130_000, minOrderValue: 300_000 },
]

/** Stars an order earns from its spend, and the spend carried to the next star. */
export function earnStars(carry: number, spend: number): { stars: number; carry: number } {
  const pool = carry + Math.max(0, spend)
  return { stars: Math.floor(pool / STAR_SPEND), carry: pool % STAR_SPEND }
}

/**
 * Undoes `earnStars` for a cancelled order. Stars already redeemed can't come back, so the
 * balance stops at 0; `taken` is how many stars were actually removed.
 */
export function takeBackStars(
  stars: number,
  carry: number,
  spend: number,
  earned: number,
): { stars: number; carry: number; taken: number } {
  let nextStars = stars - earned
  let nextCarry = carry - (spend - earned * STAR_SPEND)
  while (nextCarry < 0) {
    nextCarry += STAR_SPEND
    nextStars -= 1
  }
  while (nextCarry >= STAR_SPEND) {
    nextCarry -= STAR_SPEND
    nextStars += 1
  }
  const balance = Math.max(0, nextStars)
  return { stars: balance, carry: nextCarry, taken: stars - balance }
}

/** Stars that must expire at `now`: earned over STAR_VALID_MONTHS ago and not used (oldest used first). */
export function starsToExpire(entries: StarEntry[], now: Date): number {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - STAR_VALID_MONTHS)
  let oldEarned = 0
  let used = 0
  for (const e of entries) {
    if ((e.kind === "earn" || e.kind === "refund") && new Date(e.at) < cutoff) oldEarned += e.delta
    if (e.kind === "redeem" || e.kind === "expire") used -= e.delta
  }
  return Math.max(0, oldEarned - used)
}

/** Spend still needed for the next star. */
export function spendToNextStar(carry: number): number {
  return STAR_SPEND - carry
}
