import { formatCompactVND, formatVND, toDateKey } from "@/lib/format"
import type { Order } from "@/types"

export interface DayPoint {
  /** yyyy-MM-dd */
  key: string
  date: Date
  revenue: number
  orders: number
}

export interface StoreMetrics {
  today: { revenue: number; orders: number }
  /** Yesterday from midnight up to the same time as now — a fair comparison for "today so far". */
  yesterdaySoFar: { revenue: number; orders: number }
  /** Oldest first, today last. */
  days: DayPoint[]
  weekRevenue: number
  weekOrders: number
}

export const METRIC_DAYS = 7

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]

/** "T3 15/09" */
export function dayLabel(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  return `${WEEKDAY[date.getDay()]} ${dd}/${mm}`
}

/** Compact money for tight spots ("13,1 tr"), full format below 1.000 ₫. */
export function compactMoney(value: number) {
  return Math.abs(value) >= 1_000 ? formatCompactVND(value) : formatVND(value)
}

function emptyMetrics(dayStarts: Date[]): StoreMetrics {
  return {
    today: { revenue: 0, orders: 0 },
    yesterdaySoFar: { revenue: 0, orders: 0 },
    days: dayStarts.map((date) => ({ key: toDateKey(date), date, revenue: 0, orders: 0 })),
    weekRevenue: 0,
    weekOrders: 0,
  }
}

/**
 * Revenue (non-cancelled order totals) per store for the last 7 days, in one
 * pass over the orders. Returns a map keyed by store id plus the chain total.
 */
export function computeStoreMetrics(orders: Order[], storeIds: string[], now: Date) {
  const dayStarts = Array.from(
    { length: METRIC_DAYS },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (METRIC_DAYS - 1 - i)),
  )
  const firstDay = dayStarts[0].getTime()
  const todayStart = dayStarts[METRIC_DAYS - 1].getTime()
  const yesterdayStart = dayStarts[METRIC_DAYS - 2].getTime()
  const yesterdayCutoff = now.getTime() - 86_400_000
  const dayIndex = new Map(dayStarts.map((d, i) => [toDateKey(d), i] as const))

  const byStore = new Map<string, StoreMetrics>(storeIds.map((id) => [id, emptyMetrics(dayStarts)] as const))
  const chain = emptyMetrics(dayStarts)

  for (const o of orders) {
    if (o.status === "cancelled") continue
    const at = new Date(o.createdAt)
    const time = at.getTime()
    if (time < firstDay) continue
    const i = dayIndex.get(toDateKey(at))
    if (i === undefined) continue
    let store = byStore.get(o.storeId)
    if (!store) {
      store = emptyMetrics(dayStarts)
      byStore.set(o.storeId, store)
    }
    for (const m of [store, chain]) {
      m.days[i].revenue += o.total
      m.days[i].orders += 1
      m.weekRevenue += o.total
      m.weekOrders += 1
      if (time >= todayStart) {
        m.today.revenue += o.total
        m.today.orders += 1
      } else if (time >= yesterdayStart && time <= yesterdayCutoff) {
        m.yesterdaySoFar.revenue += o.total
        m.yesterdaySoFar.orders += 1
      }
    }
  }

  return { byStore, chain }
}
