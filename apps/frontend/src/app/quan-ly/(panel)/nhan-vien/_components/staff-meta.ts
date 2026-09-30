import { SHIFT_TYPE } from "@/lib/order-status"
import { ROLE_ORDER } from "@/lib/permissions"
import type { Employee, Order, Shift, ShiftType, Store } from "@/types"

export const SHIFT_TYPES: ShiftType[] = ["morning", "afternoon", "night"]

export const STAFF_TABS = ["nhan-vien", "lich-ca", "chot-ca"] as const
export type StaffTab = (typeof STAFF_TABS)[number]

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]
const WEEKDAY_LONG = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"]

// ---------------------------------------------------------------------------
// Dates (local time, DST-safe: build dates from y/m/d instead of adding ms)
// ---------------------------------------------------------------------------

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** Monday 00:00 of the week containing `d`. */
export function mondayOf(d: Date) {
  const day = startOfDay(d)
  return addDays(day, -((day.getDay() + 6) % 7))
}

/** yyyy-MM-dd → local midnight. */
export function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** "16/09" */
export function dayMonth(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** "T4" */
export function weekdayShort(d: Date) {
  return WEEKDAY_SHORT[d.getDay()]
}

/** "Thứ tư" */
export function weekdayLong(d: Date) {
  return WEEKDAY_LONG[d.getDay()]
}

/** "05:57" */
export function clock(value: string | Date) {
  const d = new Date(value)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export function shiftId(storeCode: string, date: string, type: ShiftType) {
  return `sh-${storeCode}-${date}-${type}`
}

/** Scheduled window [start, end) of a shift. The night shift runs 22:00 → 06:00 the next day. */
export function shiftWindow(date: string, type: ShiftType) {
  const day = parseDateKey(date)
  const { start, end } = SHIFT_TYPE[type]
  return {
    start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), start),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), end),
  }
}

/** Stores that are not open around the clock do not run the night shift. */
export function runsShift(store: Store, type: ShiftType) {
  return type !== "night" || store.openHours === "24/7"
}

/** Staff who can be put on a store's rota: active employees of that store, managers first. */
export function rosterOf(employees: Employee[], storeId: string) {
  return employees
    .filter((e) => e.storeId === storeId && e.status === "active")
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.fullName.localeCompare(b.fullName, "vi"))
}

/** Last two words of a Vietnamese full name: "Nguyễn Văn An" → "Văn An". */
export function shortName(fullName: string) {
  return fullName.trim().split(/\s+/).slice(-2).join(" ")
}

/** Cash orders rung up at the counter of one store, oldest first — the input of `cashSalesBetween`. */
export function counterCashOrders(orders: Order[], storeId: string) {
  return orders
    .filter(
      (o) =>
        o.storeId === storeId && o.channel === "in-store" && o.paymentMethod === "cash" && o.status !== "cancelled",
    )
    .map((o) => ({ at: new Date(o.createdAt).getTime(), total: o.total }))
    .sort((a, b) => a.at - b.at)
}

/** Σ cash taken in [start, end). */
export function cashSalesBetween(cashOrders: { at: number; total: number }[], start: Date, end: Date) {
  let total = 0
  let count = 0
  for (const o of cashOrders) {
    if (o.at < start.getTime()) continue
    if (o.at >= end.getTime()) break
    total += o.total
    count++
  }
  return { total, count }
}

export interface ShiftCash {
  sales: number
  orders: number
  /** Opening float + cash sales; null before check-in. */
  expected: number | null
  /** Counted cash − expected; null until the shift is closed. */
  difference: number | null
}

export function shiftCash(shift: Shift, cashOrders: { at: number; total: number }[]): ShiftCash {
  const { start, end } = shiftWindow(shift.date, shift.type)
  const { total, count } = cashSalesBetween(cashOrders, start, end)
  const expected = shift.openingCash !== undefined ? shift.openingCash + total : null
  const difference = expected !== null && shift.closingCash !== undefined ? shift.closingCash - expected : null
  return { sales: total, orders: count, expected, difference }
}
