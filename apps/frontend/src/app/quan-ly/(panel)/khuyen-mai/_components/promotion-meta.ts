import { BadgePercentIcon, BanknoteIcon, GiftIcon, type LucideIcon, TicketIcon, ZapIcon } from "lucide-react"

import { formatDate, formatNumber, formatVND } from "@/lib/format"
import { TIER_ORDER, TIERS } from "@/lib/membership"
import type { Category, Promotion, PromotionStatus, PromotionType } from "@/types"

export const PROMOTION_TYPE: Record<PromotionType, { label: string; icon: LucideIcon; hint: string }> = {
  "flash-sale": {
    label: "Flash sale",
    icon: ZapIcon,
    hint: "Giảm % theo khung giờ mỗi ngày, tự áp dụng",
  },
  percent: {
    label: "Giảm %",
    icon: BadgePercentIcon,
    hint: "Khách nhập mã để giảm theo %, có mức giảm tối đa",
  },
  fixed: {
    label: "Giảm tiền",
    icon: BanknoteIcon,
    hint: "Khách nhập mã để giảm một số tiền cố định",
  },
  "buy-x-get-y": {
    label: "Mua X tặng Y",
    icon: GiftIcon,
    hint: "Tự tặng thêm sản phẩm khi mua đủ số lượng",
  },
  "member-voucher": {
    label: "Voucher thành viên",
    icon: TicketIcon,
    hint: "Giảm mỗi ly đồ uống theo hạng thành viên",
  },
}

export const TYPE_ORDER: PromotionType[] = ["flash-sale", "percent", "fixed", "buy-x-get-y", "member-voucher"]

/** Types customers redeem by typing a code (the pricing engine only applies these through `code`). */
export const CODE_TYPES: PromotionType[] = ["percent", "fixed"]

export const STATUS_ORDER: PromotionStatus[] = ["active", "scheduled", "paused", "ended"]

const DAY = 86_400_000

/** "-3k" */
function shortMoney(value: number) {
  return value >= 1_000 ? `${formatNumber(value / 1_000)}k` : formatVND(value)
}

/** How many products / which categories a promotion covers. */
export function scopeSummary(promotion: Promotion, categories: Category[]) {
  const names = promotion.categoryIds
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n)
  const parts: string[] = []
  if (promotion.productIds.length) parts.push(`${formatNumber(promotion.productIds.length)} sản phẩm`)
  if (names.length) parts.push(names.length > 2 ? `${names.length} danh mục` : names.join(", "))
  return parts.length ? parts.join(" + ") : "Toàn bộ sản phẩm"
}

/** One-line value of the offer, e.g. "-15% · 06:00–10:00 hằng ngày". */
export function valueSummary(promotion: Promotion) {
  const min = promotion.minOrderValue ? `đơn từ ${formatVND(promotion.minOrderValue)}` : null
  switch (promotion.type) {
    case "percent":
      return [`-${promotion.value}%`, promotion.maxDiscount ? `tối đa ${formatVND(promotion.maxDiscount)}` : null, min]
        .filter(Boolean)
        .join(" · ")
    case "fixed":
      return [`-${formatVND(promotion.value)}`, min].filter(Boolean).join(" · ")
    case "flash-sale":
      return promotion.dailyStart && promotion.dailyEnd
        ? `-${promotion.value}% · ${promotion.dailyStart}–${promotion.dailyEnd} hằng ngày`
        : `-${promotion.value}% cả ngày`
    case "buy-x-get-y": {
      const count = promotion.productIds.length
      return `Mua ${promotion.buyQuantity ?? 1} tặng ${promotion.getQuantity ?? 1}${count ? ` · ${formatNumber(count)} sản phẩm` : ""}`
    }
    case "member-voucher": {
      const tiers = TIER_ORDER.filter((t) => promotion.tiers.includes(t))
      return `${tiers.map((t) => `-${shortMoney(TIERS[t].drinkVoucher)}`).join("/")} mỗi ly theo hạng`
    }
  }
}

/** Period text plus a relative hint that depends on the status. */
export function periodSummary(promotion: Promotion, status: PromotionStatus, now: Date) {
  const range = `${formatDate(promotion.startsAt)} – ${formatDate(promotion.endsAt)}`
  const start = new Date(promotion.startsAt).getTime()
  const end = new Date(promotion.endsAt).getTime()
  const days = (ms: number) => Math.max(1, Math.ceil(ms / DAY))
  let hint: string
  if (now.getTime() > end) hint = `kết thúc ${days(now.getTime() - end)} ngày trước`
  else if (status === "scheduled" || now.getTime() < start) hint = `bắt đầu sau ${days(start - now.getTime())} ngày`
  else if (end - now.getTime() < DAY) hint = "kết thúc trong hôm nay"
  else hint = `còn ${days(end - now.getTime())} ngày`
  return { range, hint }
}
