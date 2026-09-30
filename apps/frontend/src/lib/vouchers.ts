import type { Category, Promotion, SalesChannel } from "@/types"

import { formatCompactVND, formatDate, formatNumber, formatTime, formatVND, toDateKey } from "./format"
import { TIERS } from "./membership"
import { effectiveStatus } from "./pricing"

/**
 * Discount vouchers = promotions a shopper redeems with a code (percent / fixed).
 * These helpers say, in plain Vietnamese, how much a voucher takes off, when it
 * expires and what it requires — the same wording wherever vouchers are listed.
 */

const DAY = 86_400_000

/**
 * Vouchers worth showing on a channel: running or coming soon, not paused, ended or used up.
 * Personal vouchers (redeemed with stars) only show to their owner.
 */
export function listVouchers(
  promotions: Promotion[],
  now: Date,
  channel: SalesChannel,
  customerId?: string | null,
): Promotion[] {
  return promotions.filter((p) => {
    if (!p.code || (p.type !== "percent" && p.type !== "fixed")) return false
    if (p.ownerId && p.ownerId !== customerId) return false
    if (!p.channels.includes(channel)) return false
    if (p.usageLimit !== undefined && p.usageCount >= p.usageLimit) return false
    const status = effectiveStatus(p, now)
    return status === "active" || status === "scheduled"
  })
}

/** Big value for the ticket stub: "20K" or "10%" (+ "tối đa 30K"). */
export function voucherStub(p: Promotion): { value: string; cap: string | null } {
  if (p.type === "percent") {
    return {
      value: `${p.value}%`,
      cap: p.maxDiscount ? `tối đa ${formatCompactVND(p.maxDiscount).toUpperCase()}` : null,
    }
  }
  return { value: formatCompactVND(p.value).toUpperCase(), cap: null }
}

/** "Giảm 20.000 ₫" / "Giảm 10%, tối đa 30.000 ₫" */
export function voucherValueText(p: Promotion): string {
  if (p.type === "percent") return `Giảm ${p.value}%${p.maxDiscount ? `, tối đa ${formatVND(p.maxDiscount)}` : ""}`
  return `Giảm ${formatVND(p.value)}`
}

/** Conditions in the order shoppers check them. */
export function voucherConditions(p: Promotion, categories: Category[]): string[] {
  const conditions = [p.minOrderValue ? `Đơn tối thiểu ${formatVND(p.minOrderValue)}` : "Không yêu cầu đơn tối thiểu"]

  const categoryNames = p.categoryIds
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((name): name is string => !!name)
  const scope = [
    ...(p.productIds.length ? [`${formatNumber(p.productIds.length)} sản phẩm chọn lọc`] : []),
    ...categoryNames,
  ]
  conditions.push(scope.length ? `Áp dụng cho ${scope.join(", ")}` : "Áp dụng cho mọi sản phẩm")

  conditions.push(
    p.ownerId
      ? "Voucher riêng của bạn, đổi từ sao vàng"
      : p.tiers.length
        ? `Dành cho hạng ${p.tiers.map((t) => TIERS[t].label).join(", ")}`
        : "Dành cho mọi khách hàng",
  )

  if (!p.channels.includes("in-store")) conditions.push("Chỉ dùng khi đặt online")
  else if (!p.channels.includes("online")) conditions.push("Chỉ dùng khi mua tại cửa hàng")
  else conditions.push("Dùng khi đặt online và mua tại cửa hàng")

  if (p.usageLimit !== undefined) conditions.push(`Còn ${formatNumber(Math.max(0, p.usageLimit - p.usageCount))} lượt`)
  return conditions
}

/** Validity line: "HSD 01/11/2026 · còn 45 ngày", "Hết hạn hôm nay lúc 23:59" or "Bắt đầu từ 21/09/2026". */
export function voucherExpiry(p: Promotion, now: Date): { text: string; urgent: boolean } {
  if (effectiveStatus(p, now) === "scheduled") {
    return { text: `Bắt đầu từ ${formatDate(p.startsAt)}, HSD ${formatDate(p.endsAt)}`, urgent: false }
  }
  const end = new Date(p.endsAt)
  if (toDateKey(end) === toDateKey(now)) return { text: `Hết hạn hôm nay lúc ${formatTime(end)}`, urgent: true }
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY)
  return { text: `HSD ${formatDate(end)} · còn ${daysLeft} ngày`, urgent: daysLeft <= 3 }
}
