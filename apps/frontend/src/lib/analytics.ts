import type {
  Category,
  Employee,
  InventoryBatch,
  Order,
  PaymentMethod,
  Product,
  PurchaseOrder,
  SalesChannel,
  StockLevel,
  Store,
} from "@/types"

/**
 * Sales analytics behind the dashboard (`/quan-ly`) and the reports (`/quan-ly/bao-cao`).
 *
 * Pure functions over the raw collections — no React, no store access — so the backend
 * can mirror them 1:1 (one function ≈ one report endpoint). Definitions:
 *
 * - **Revenue** (doanh thu) = Σ `order.total` of orders whose status is not `cancelled`.
 *   It includes the shipping fee and already has every discount deducted.
 * - **Orders** (số đơn) = number of non-cancelled orders.
 * - **AOV** (giá trị trung bình/đơn) = revenue / orders.
 * - **Discount** (giảm giá) = Σ `order.discount` of non-cancelled orders.
 * - **Gross profit** (lợi nhuận gộp) = Σ (`line.lineTotal` − `product.costPrice` × `line.quantity`)
 *   over the lines of non-cancelled orders, using the product's *current* cost price.
 * - **Margin** (biên lợi nhuận gộp) = gross profit / revenue for order-level reports, and
 *   gross profit / item sales for product and category reports.
 * - **Item sales** (doanh thu hàng hoá) = Σ `line.lineTotal`: after line promotions (flash sale,
 *   buy X get Y), before order-level discounts (member voucher, promotion code) and shipping.
 *   Product and category reports use it because order-level amounts can't be split per line.
 * - Time windows are half-open `[from, to)` in the viewer's local time zone; a "day" is a local
 *   calendar day.
 * - Store scope: `storeId: null` means the whole chain.
 */

// ---------------------------------------------------------------------------
// Scope & time
// ---------------------------------------------------------------------------

export type ChannelFilter = SalesChannel | "all"

export interface SalesScope {
  /** A store id, or null for the whole chain. */
  storeId: string | null
  /** Defaults to "all". */
  channel?: ChannelFilter
}

/** Half-open time window `[from, to)`. */
export interface TimeRange {
  from: Date
  to: Date
}

/** A reporting period made of whole calendar days. `to` is the start of the day after the last one. */
export interface ReportPeriod extends TimeRange {
  /** Number of calendar days in the period. */
  days: number
}

export type PeriodPreset = "7d" | "30d" | "this-month" | "last-month"

export const SALES_CHANNELS: SalesChannel[] = ["in-store", "online"]

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "ewallet", "card", "bank-transfer", "cod"]

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Move by whole calendar days, keeping the local time of day. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Numeric local-day key (yyyyMMdd) — cheaper than a string key in hot loops. */
function dayNumber(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate()
}

function countDays(from: Date, to: Date): number {
  let days = 0
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) days++
  return days
}

/** A period covering the calendar days `firstDay`…`lastDay` (inclusive). */
export function periodOfDays(firstDay: Date, lastDay: Date): ReportPeriod {
  const from = startOfDay(firstDay < lastDay ? firstDay : lastDay)
  const to = addDays(startOfDay(firstDay < lastDay ? lastDay : firstDay), 1)
  return { from, to, days: countDays(from, to) }
}

/**
 * Preset reporting periods, relative to `now`:
 * - `7d` / `30d`: the last 7 / 30 calendar days, today included
 * - `this-month`: from the 1st of this month to today
 * - `last-month`: the whole previous calendar month
 */
export function presetPeriod(preset: PeriodPreset, now: Date): ReportPeriod {
  const today = startOfDay(now)
  switch (preset) {
    case "7d":
      return periodOfDays(addDays(today, -6), today)
    case "30d":
      return periodOfDays(addDays(today, -29), today)
    case "this-month":
      return periodOfDays(new Date(today.getFullYear(), today.getMonth(), 1), today)
    case "last-month":
      return periodOfDays(
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
        new Date(today.getFullYear(), today.getMonth(), 0),
      )
  }
}

/**
 * The previous period of equal length: the same number of calendar days right before `period`.
 * While `period` is still running (it contains `now`), the previous one is cut at the same
 * time of day, so a half-finished today is compared with the same hours, not a full day.
 */
export function previousPeriod(period: ReportPeriod, now: Date): ReportPeriod {
  const from = addDays(period.from, -period.days)
  const fullEnd = addDays(period.to, -period.days)
  const running = now >= period.from && now < period.to
  const sameTime = addDays(now, -period.days)
  return { from, to: running && sameTime < fullEnd ? sameTime : fullEnd, days: period.days }
}

/** Today from midnight until `now`. */
export function todaySoFar(now: Date): TimeRange {
  return { from: startOfDay(now), to: now }
}

/** Yesterday from midnight until the same time of day as `now` — the fair comparison for "today so far". */
export function yesterdaySameTime(now: Date): TimeRange {
  return { from: addDays(startOfDay(now), -1), to: addDays(now, -1) }
}

// ---------------------------------------------------------------------------
// Order selection
// ---------------------------------------------------------------------------

/** Orders that count toward revenue: everything except cancelled ones. */
export function isRevenueOrder(order: Order): boolean {
  return order.status !== "cancelled"
}

export function matchesScope(order: Order, scope: SalesScope): boolean {
  if (scope.storeId && order.storeId !== scope.storeId) return false
  if (scope.channel && scope.channel !== "all" && order.channel !== scope.channel) return false
  return true
}

/** Orders (any status) in the scope and, when given, created inside `range`. Keeps the input order. */
export function selectOrders(orders: readonly Order[], scope: SalesScope, range?: TimeRange): Order[] {
  const from = range ? range.from.getTime() : -Infinity
  const to = range ? range.to.getTime() : Infinity
  const result: Order[] = []
  for (const order of orders) {
    if (!matchesScope(order, scope)) continue
    const at = Date.parse(order.createdAt)
    if (at >= from && at < to) result.push(order)
  }
  return result
}

/** When the first order was placed (null for an empty list) — the start of available history. */
export function firstOrderAt(orders: readonly Order[]): Date | null {
  let min = Infinity
  for (const order of orders) min = Math.min(min, Date.parse(order.createdAt))
  return Number.isFinite(min) ? new Date(min) : null
}

export type ProductLookup = ReadonlyMap<string, Product>

export function productLookup(products: readonly Product[]): ProductLookup {
  return new Map(products.map((p) => [p.id, p] as const))
}

/** Σ (lineTotal − current costPrice × quantity). A product that no longer exists counts at cost 0. */
export function orderGrossProfit(order: Order, products: ProductLookup): number {
  let profit = 0
  for (const line of order.items) {
    profit += line.lineTotal - (products.get(line.productId)?.costPrice ?? 0) * line.quantity
  }
  return profit
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

/** Relative change (0.12 = +12%). Null when there is nothing to compare with. */
export function relativeChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null
  return (current - previous) / previous
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface SalesSummary {
  orders: number
  revenue: number
  discount: number
  grossProfit: number
  /** Units sold. */
  quantity: number
  aov: number
  margin: number
}

/** Headline figures over non-cancelled orders. */
export function summarizeSales(orders: readonly Order[], products: ProductLookup): SalesSummary {
  let count = 0
  let revenue = 0
  let discount = 0
  let grossProfit = 0
  let quantity = 0
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    count++
    revenue += order.total
    discount += order.discount
    for (const line of order.items) {
      grossProfit += line.lineTotal - (products.get(line.productId)?.costPrice ?? 0) * line.quantity
      quantity += line.quantity
    }
  }
  return {
    orders: count,
    revenue,
    discount,
    grossProfit,
    quantity,
    aov: ratio(revenue, count),
    margin: ratio(grossProfit, revenue),
  }
}

// ---------------------------------------------------------------------------
// Over time
// ---------------------------------------------------------------------------

export interface DailySales {
  /** Local midnight of the day. */
  date: Date
  orders: number
  revenue: number
  discount: number
  grossProfit: number
  aov: number
  margin: number
}

/** One row per calendar day of `range` (days without sales included), oldest first. */
export function dailySales(orders: readonly Order[], products: ProductLookup, range: TimeRange): DailySales[] {
  const rows: DailySales[] = []
  const index = new Map<number, DailySales>()
  for (let d = startOfDay(range.from); d < range.to; d = addDays(d, 1)) {
    const row: DailySales = { date: d, orders: 0, revenue: 0, discount: 0, grossProfit: 0, aov: 0, margin: 0 }
    rows.push(row)
    index.set(dayNumber(d), row)
  }
  const from = range.from.getTime()
  const to = range.to.getTime()
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    const at = Date.parse(order.createdAt)
    if (at < from || at >= to) continue
    const row = index.get(dayNumber(new Date(at)))
    if (!row) continue
    row.orders++
    row.revenue += order.total
    row.discount += order.discount
    row.grossProfit += orderGrossProfit(order, products)
  }
  for (const row of rows) {
    row.aov = ratio(row.revenue, row.orders)
    row.margin = ratio(row.grossProfit, row.revenue)
  }
  return rows
}

/**
 * Revenue per hour of day (index 0 = 00:00–00:59) averaged over `days` consecutive calendar
 * days starting on `firstDay`. With `days = 1` it is simply that day's hourly revenue.
 */
export function hourlyRevenue(orders: readonly Order[], firstDay: Date, days = 1): number[] {
  const hours = new Array<number>(24).fill(0)
  const from = startOfDay(firstDay).getTime()
  const to = addDays(startOfDay(firstDay), days).getTime()
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    const at = Date.parse(order.createdAt)
    if (at < from || at >= to) continue
    hours[new Date(at).getHours()] += order.total
  }
  return hours.map((sum) => sum / Math.max(1, days))
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export interface ChannelSales {
  channel: SalesChannel
  orders: number
  revenue: number
  aov: number
  /** Share of all orders. */
  orderShare: number
  /** Share of all revenue. */
  revenueShare: number
}

/** Both channels, always in the fixed order in-store → online. */
export function salesByChannel(orders: readonly Order[]): ChannelSales[] {
  const rows = SALES_CHANNELS.map((channel): ChannelSales => ({
    channel,
    orders: 0,
    revenue: 0,
    aov: 0,
    orderShare: 0,
    revenueShare: 0,
  }))
  let totalOrders = 0
  let totalRevenue = 0
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    const row = rows[order.channel === "in-store" ? 0 : 1]
    row.orders++
    row.revenue += order.total
    totalOrders++
    totalRevenue += order.total
  }
  for (const row of rows) {
    row.aov = ratio(row.revenue, row.orders)
    row.orderShare = ratio(row.orders, totalOrders)
    row.revenueShare = ratio(row.revenue, totalRevenue)
  }
  return rows
}

export interface ProductSales {
  productId: string
  quantity: number
  /** Item sales (Σ lineTotal). */
  revenue: number
  grossProfit: number
  margin: number
}

/** Products that sold at least one unit, best first by `rankBy` (ties broken by the other measure). */
export function salesByProduct(
  orders: readonly Order[],
  products: ProductLookup,
  rankBy: "quantity" | "revenue" = "revenue",
): ProductSales[] {
  const rows = new Map<string, ProductSales>()
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    for (const line of order.items) {
      let row = rows.get(line.productId)
      if (!row) {
        row = { productId: line.productId, quantity: 0, revenue: 0, grossProfit: 0, margin: 0 }
        rows.set(line.productId, row)
      }
      row.quantity += line.quantity
      row.revenue += line.lineTotal
      row.grossProfit += line.lineTotal - (products.get(line.productId)?.costPrice ?? 0) * line.quantity
    }
  }
  const list = [...rows.values()]
  for (const row of list) row.margin = ratio(row.grossProfit, row.revenue)
  return list.sort((a, b) =>
    rankBy === "quantity"
      ? b.quantity - a.quantity || b.revenue - a.revenue
      : b.revenue - a.revenue || b.quantity - a.quantity,
  )
}

export interface CategorySales {
  categoryId: string
  quantity: number
  /** Item sales (Σ lineTotal). */
  revenue: number
  grossProfit: number
  margin: number
  /** Share of the item sales of all categories. */
  share: number
}

/** Every category (zero rows included), highest item sales first. */
export function salesByCategory(
  orders: readonly Order[],
  products: ProductLookup,
  categories: readonly Category[],
): CategorySales[] {
  const rows = new Map<string, CategorySales>(
    categories.map((c) => [c.id, { categoryId: c.id, quantity: 0, revenue: 0, grossProfit: 0, margin: 0, share: 0 }]),
  )
  let total = 0
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    for (const line of order.items) {
      const product = products.get(line.productId)
      if (!product) continue
      let row = rows.get(product.categoryId)
      if (!row) {
        row = { categoryId: product.categoryId, quantity: 0, revenue: 0, grossProfit: 0, margin: 0, share: 0 }
        rows.set(product.categoryId, row)
      }
      row.quantity += line.quantity
      row.revenue += line.lineTotal
      row.grossProfit += line.lineTotal - product.costPrice * line.quantity
      total += line.lineTotal
    }
  }
  const list = [...rows.values()]
  for (const row of list) {
    row.margin = ratio(row.grossProfit, row.revenue)
    row.share = ratio(row.revenue, total)
  }
  return list.sort((a, b) => b.revenue - a.revenue)
}

export interface StoreSales {
  storeId: string
  orders: number
  revenue: number
  aov: number
  onlineOrders: number
  /** Share of the store's orders placed online. */
  onlineShare: number
  grossProfit: number
  margin: number
}

/** One row per store in `stores` (zero rows included), highest revenue first. */
export function salesByStore(
  orders: readonly Order[],
  products: ProductLookup,
  stores: readonly Store[],
): StoreSales[] {
  const rows = new Map<string, StoreSales>(
    stores.map((s) => [
      s.id,
      { storeId: s.id, orders: 0, revenue: 0, aov: 0, onlineOrders: 0, onlineShare: 0, grossProfit: 0, margin: 0 },
    ]),
  )
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    const row = rows.get(order.storeId)
    if (!row) continue
    row.orders++
    row.revenue += order.total
    if (order.channel === "online") row.onlineOrders++
    row.grossProfit += orderGrossProfit(order, products)
  }
  const list = [...rows.values()]
  for (const row of list) {
    row.aov = ratio(row.revenue, row.orders)
    row.onlineShare = ratio(row.onlineOrders, row.orders)
    row.margin = ratio(row.grossProfit, row.revenue)
  }
  return list.sort((a, b) => b.revenue - a.revenue)
}

export interface EmployeeSales {
  employeeId: string
  /** The employee's home store (the store of their orders when not in `employees`). */
  storeId: string | null
  orders: number
  revenue: number
  aov: number
  /** Revenue paid in cash. */
  cashRevenue: number
  /** cashRevenue / revenue. */
  cashShare: number
}

/**
 * Sales per employee who rang up (in-store) or confirmed (online) the orders. Every employee in
 * `employees` gets a row even without sales (pass the cashiers of the scope). Highest revenue first.
 */
export function salesByEmployee(orders: readonly Order[], employees: readonly Employee[]): EmployeeSales[] {
  const rows = new Map<string, EmployeeSales>(
    employees.map((e) => [
      e.id,
      { employeeId: e.id, storeId: e.storeId, orders: 0, revenue: 0, aov: 0, cashRevenue: 0, cashShare: 0 },
    ]),
  )
  for (const order of orders) {
    if (!isRevenueOrder(order) || !order.employeeId) continue
    let row = rows.get(order.employeeId)
    if (!row) {
      row = {
        employeeId: order.employeeId,
        storeId: order.storeId,
        orders: 0,
        revenue: 0,
        aov: 0,
        cashRevenue: 0,
        cashShare: 0,
      }
      rows.set(order.employeeId, row)
    }
    row.orders++
    row.revenue += order.total
    if (order.paymentMethod === "cash") row.cashRevenue += order.total
  }
  const list = [...rows.values()]
  for (const row of list) {
    row.aov = ratio(row.revenue, row.orders)
    row.cashShare = ratio(row.cashRevenue, row.revenue)
  }
  return list.sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
}

export interface PaymentSales {
  method: PaymentMethod
  orders: number
  revenue: number
  /** Share of all revenue. */
  share: number
  /** Share of all orders. */
  orderShare: number
}

/** Every payment method (zero rows included), highest revenue first. */
export function salesByPaymentMethod(orders: readonly Order[]): PaymentSales[] {
  const rows = new Map<PaymentMethod, PaymentSales>(
    PAYMENT_METHODS.map((method) => [method, { method, orders: 0, revenue: 0, share: 0, orderShare: 0 }]),
  )
  let totalOrders = 0
  let totalRevenue = 0
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue
    const row = rows.get(order.paymentMethod)
    if (!row) continue
    row.orders++
    row.revenue += order.total
    totalOrders++
    totalRevenue += order.total
  }
  const list = [...rows.values()]
  for (const row of list) {
    row.share = ratio(row.revenue, totalRevenue)
    row.orderShare = ratio(row.orders, totalOrders)
  }
  return list.sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
}

export interface CancellationStats {
  /** Online orders placed (any status). */
  placed: number
  cancelled: number
  /** cancelled / placed. */
  rate: number
  /** Σ total of the cancelled orders. */
  cancelledValue: number
}

/** Cancellation rate of online orders. In-store orders are ignored (they can't be cancelled). */
export function onlineCancellation(orders: readonly Order[]): CancellationStats {
  let placed = 0
  let cancelled = 0
  let cancelledValue = 0
  for (const order of orders) {
    if (order.channel !== "online") continue
    placed++
    if (order.status === "cancelled") {
      cancelled++
      cancelledValue += order.total
    }
  }
  return { placed, cancelled, rate: ratio(cancelled, placed), cancelledValue }
}

// ---------------------------------------------------------------------------
// Operations (dashboard "Cần chú ý")
// ---------------------------------------------------------------------------

/**
 * Store-level stock alerts for active products: `out` = quantity ≤ 0, `low` = 0 < quantity ≤
 * minQuantity (the same rule as `stockState` in hooks/use-stock). For the whole chain each store's
 * level counts separately, so a product out of stock in 3 stores counts 3 times.
 */
export function stockAlerts(
  stock: readonly StockLevel[],
  products: ProductLookup,
  storeId: string | null,
): { out: number; low: number } {
  let out = 0
  let low = 0
  for (const level of stock) {
    if (storeId && level.storeId !== storeId) continue
    if (!products.get(level.productId)?.isActive) continue
    if (level.quantity <= 0) out++
    else if (level.quantity <= level.minQuantity) low++
  }
  return { out, low }
}

/** Batches still holding stock that expire before `now + withinHours` (already expired ones included). */
export function expiringBatches(
  batches: readonly InventoryBatch[],
  storeId: string | null,
  now: Date,
  withinHours = 24,
): { expiring: number; expired: number } {
  const limit = now.getTime() + withinHours * 3_600_000
  let expiring = 0
  let expired = 0
  for (const batch of batches) {
    if (storeId && batch.storeId !== storeId) continue
    if (batch.quantity <= 0) continue
    const at = Date.parse(batch.expiresAt)
    if (at >= limit) continue
    expiring++
    if (at <= now.getTime()) expired++
  }
  return { expiring, expired }
}

/** Purchase orders sent to suppliers (`ordered`) and not received yet; `late` = past their expected date. */
export function awaitingPurchaseOrders(
  purchaseOrders: readonly PurchaseOrder[],
  storeId: string | null,
  now: Date,
): { awaiting: number; late: number } {
  let awaiting = 0
  let late = 0
  for (const po of purchaseOrders) {
    if (po.status !== "ordered" || (storeId && po.storeId !== storeId)) continue
    awaiting++
    if (po.expectedAt && Date.parse(po.expectedAt) < now.getTime()) late++
  }
  return { awaiting, late }
}
