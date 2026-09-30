import type { Tone } from "@/lib/order-status"

export type ExpiryKind = "expired" | "soon" | "ok"

export interface ExpiryInfo {
  kind: ExpiryKind
  label: string
  tone: Tone
  /** Whole calendar days until expiry (negative once expired). */
  days: number
}

const DAY = 86_400_000

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Expiry status of a lot. "soon" = expires today or tomorrow (≤ 1 day) — push it out
 * or discount it; "expired" must be written off (xuất huỷ).
 */
export function expiryInfo(expiresAt: string, now: Date): ExpiryInfo {
  const expires = new Date(expiresAt)
  const days = Math.round((startOfDay(expires) - startOfDay(now)) / DAY)
  if (expires.getTime() <= now.getTime()) return { kind: "expired", label: "Đã hết hạn", tone: "danger", days }
  if (days <= 0) return { kind: "soon", label: "Hết hạn hôm nay", tone: "warning", days: 0 }
  if (days === 1) return { kind: "soon", label: "Hết hạn ngày mai", tone: "warning", days }
  return { kind: "ok", label: `Còn ${days} ngày`, tone: days <= 3 ? "neutral" : "fresh", days }
}
