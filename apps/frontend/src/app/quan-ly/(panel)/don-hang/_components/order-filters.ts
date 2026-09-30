import { normalizeText } from "@/lib/format"
import type { Customer, Order, OrderStatus, SalesChannel } from "@/types"

/**
 * URL contract of the orders board (other pages link here):
 *   ?trang-thai=pending|processing|delivering|completed|cancelled
 *   ?kenh=online|in-store
 *   ?ngay=hom-nay|7-ngay|30-ngay|tat-ca
 *   ?ma=<order code>   opens that order's detail sheet
 */

export type StatusTab = "all" | "pending" | "processing" | "delivering" | "completed" | "cancelled"

export const STATUS_TABS: { id: StatusTab; label: string; statuses: OrderStatus[] | null }[] = [
  { id: "all", label: "Tất cả", statuses: null },
  { id: "pending", label: "Chờ xác nhận", statuses: ["pending"] },
  { id: "processing", label: "Đang xử lý", statuses: ["confirmed", "preparing"] },
  { id: "delivering", label: "Đang giao", statuses: ["delivering"] },
  { id: "completed", label: "Hoàn thành", statuses: ["completed"] },
  { id: "cancelled", label: "Đã huỷ", statuses: ["cancelled"] },
]

export function parseStatusTab(value: string | null): StatusTab {
  return STATUS_TABS.some((t) => t.id === value) ? (value as StatusTab) : "all"
}

export function tabOfStatus(status: OrderStatus): Exclude<StatusTab, "all"> {
  if (status === "confirmed" || status === "preparing") return "processing"
  return status
}

export type ChannelFilter = SalesChannel | "all"

export function parseChannel(value: string | null): ChannelFilter {
  return value === "online" || value === "in-store" ? value : "all"
}

export type DatePreset = "hom-nay" | "7-ngay" | "30-ngay" | "tat-ca"

export const DATE_PRESETS: { id: DatePreset; label: string; days: number | null }[] = [
  { id: "hom-nay", label: "Hôm nay", days: 1 },
  { id: "7-ngay", label: "7 ngày qua", days: 7 },
  { id: "30-ngay", label: "30 ngày qua", days: 30 },
  { id: "tat-ca", label: "Tất cả thời gian", days: null },
]

export const DEFAULT_DATE_PRESET: DatePreset = "hom-nay"

export function parseDatePreset(value: string | null): DatePreset {
  return DATE_PRESETS.some((p) => p.id === value) ? (value as DatePreset) : DEFAULT_DATE_PRESET
}

/** Orders that still need someone to act on them. */
export const OPEN_STATUSES: OrderStatus[] = ["pending", "confirmed", "preparing", "delivering"]

/** ISO lower bound of a date preset (local midnight), or null for "all time". */
export function dateFloor(preset: DatePreset, now: Date): string | null {
  const days = DATE_PRESETS.find((p) => p.id === preset)?.days ?? null
  if (days === null) return null
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  return start.toISOString()
}

export interface OrderFilter {
  channel: ChannelFilter
  datePreset: DatePreset
  search: string
  now: Date
  customerMap: Map<string, Customer>
}

/**
 * Channel + date + search. Open orders (pending → delivering) ignore the date
 * range, so work carried over from yesterday never disappears from the board.
 */
export function filterOrders(orders: Order[], { channel, datePreset, search, now, customerMap }: OrderFilter) {
  const floor = dateFloor(datePreset, now)
  const q = normalizeText(search)
  const digits = search.replace(/\D/g, "")
  return orders.filter((o) => {
    if (channel !== "all" && o.channel !== channel) return false
    if (floor && o.createdAt < floor && !OPEN_STATUSES.includes(o.status)) return false
    if (!q) return true
    if (o.code.toLowerCase().includes(q)) return true
    const customer = o.customerId ? customerMap.get(o.customerId) : undefined
    if (customer && normalizeText(customer.fullName).includes(q)) return true
    if (o.delivery && normalizeText(o.delivery.recipient).includes(q)) return true
    if (digits.length >= 3 && (customer?.phone.includes(digits) || o.delivery?.phone.includes(digits))) return true
    return false
  })
}

/** Pending orders first — longest waiting on top — then everything else newest first. */
export function sortForBoard(orders: Order[]) {
  const pending = orders.filter((o) => o.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (!pending.length) return orders
  return [...pending, ...orders.filter((o) => o.status !== "pending")]
}
