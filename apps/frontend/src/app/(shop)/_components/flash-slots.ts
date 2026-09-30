"use client"

import { useMemo } from "react"

import { usePromotions } from "@/hooks/use-catalog"
import { formatTime } from "@/lib/format"
import { effectiveStatus, isPromotionLive } from "@/lib/pricing"
import { useDbReady, useNow } from "@/stores/hydration"
import type { Product, Promotion } from "@/types"

/**
 * Today's flash-sale time slots ("Buổi sáng năng động", "Ăn xế", "Ăn tối"),
 * derived from the promotions in the DB so the back office can pause/edit them.
 */
export type FlashSlotState = "live" | "upcoming" | "ended"

export interface FlashSlot {
  promotion: Promotion
  /** Today's window. */
  start: Date
  end: Date
  state: FlashSlotState
  /** When the slot opens next: today when upcoming, tomorrow once ended; null when live or the campaign is over. */
  nextStart: Date | null
}

function atTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

export function getFlashSlots(promotions: Promotion[], now: Date): FlashSlot[] {
  const slots: FlashSlot[] = []
  for (const promotion of promotions) {
    if (promotion.type !== "flash-sale" || !promotion.dailyStart || !promotion.dailyEnd) continue
    if (!promotion.channels.includes("online")) continue
    const status = effectiveStatus(promotion, now)
    if (status === "paused" || status === "ended") continue

    const start = atTime(now, promotion.dailyStart)
    const end = atTime(now, promotion.dailyEnd)
    const campaignStart = new Date(promotion.startsAt)
    const campaignEnd = new Date(promotion.endsAt)
    // Campaign doesn't run today.
    if (campaignStart >= end) continue

    let state: FlashSlotState
    let nextStart: Date | null = null
    if (isPromotionLive(promotion, now, "online")) {
      state = "live"
    } else if (now < start || now < campaignStart) {
      state = "upcoming"
      nextStart = campaignStart > start ? campaignStart : start
    } else {
      state = "ended"
      const tomorrow = new Date(start)
      tomorrow.setDate(tomorrow.getDate() + 1)
      nextStart = tomorrow <= campaignEnd ? tomorrow : null
    }
    slots.push({ promotion, start, end, state, nextStart })
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** The slot to feature: live now, else the next one to open. */
export function featuredSlot(slots: FlashSlot[]): FlashSlot | null {
  const live = slots.find((s) => s.state === "live")
  if (live) return live
  const next = slots.filter((s) => s.nextStart).sort((a, b) => a.nextStart!.getTime() - b.nextStart!.getTime())[0]
  return next ?? null
}

/** Flash-sale slots for the current time; null until the DB and clock are ready (render a skeleton). */
export function useFlashSlots(): { slots: FlashSlot[]; featured: FlashSlot | null; now: Date } | null {
  const ready = useDbReady()
  const promotions = usePromotions()
  const now = useNow(15_000)
  return useMemo(() => {
    if (!ready || !now) return null
    const slots = getFlashSlots(promotions, now)
    return { slots, featured: featuredSlot(slots), now }
  }, [ready, promotions, now])
}

/** Active products a promotion applies to, in the promotion's own order. */
export function promotionProducts(promotion: Promotion, products: Product[]): Product[] {
  if (!promotion.productIds.length && !promotion.categoryIds.length) return products.filter((p) => p.isActive)
  const byId = new Map(products.map((p) => [p.id, p] as const))
  const listed = promotion.productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p && p.isActive)
  const listedIds = new Set(listed.map((p) => p.id))
  const inCategories = promotion.categoryIds.length
    ? products.filter((p) => p.isActive && promotion.categoryIds.includes(p.categoryId) && !listedIds.has(p.id))
    : []
  return [...listed, ...inCategories]
}

/** "14:00 – 17:00" */
export function slotWindow(slot: FlashSlot) {
  return `${formatTime(slot.start)} – ${formatTime(slot.end)}`
}

/** "Bắt đầu lúc 14:00" / "Bắt đầu lúc 06:00 ngày mai" / "Đã kết thúc" (compact: "06:00 ngày mai"). */
export function slotOpensLabel(slot: FlashSlot, now: Date, { compact = false } = {}) {
  if (!slot.nextStart) return "Đã kết thúc"
  const tomorrow = slot.nextStart.getDate() !== now.getDate()
  const at = `${formatTime(slot.nextStart)}${tomorrow ? " ngày mai" : ""}`
  return compact ? at : `Bắt đầu lúc ${at}`
}
