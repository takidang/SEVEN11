import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/shop/product-image"
import {
  type CancellationStats,
  type CategorySales,
  type DailySales,
  dailySales,
  type EmployeeSales,
  onlineCancellation,
  type PaymentSales,
  type ProductLookup,
  type ProductSales,
  type ReportPeriod,
  salesByCategory,
  salesByEmployee,
  salesByPaymentMethod,
  salesByProduct,
  salesByStore,
  type StoreSales,
  summarizeSales,
} from "@/lib/analytics"
import { perStoreCosts, type ProfitLine, profitAndLoss } from "@/lib/budget"
import { formatDate, formatNumber, formatPercent, formatVND, toDateKey } from "@/lib/format"
import { PAYMENT_METHOD, STORE_STATUS } from "@/lib/order-status"
import type { Category, Employee, Order, Store } from "@/types"

import { weekdayShort } from "../../_components/chart-kit"
import type { CsvSection } from "./csv"
import { type ReportColumn, type ReportTableSpec, tableToCsv } from "./report-table"

/**
 * View models for the report tabs. Each builder aggregates once (lib/analytics) and returns
 * the chart data plus table specs, so the screen and the CSV export always show the same numbers.
 */

export type ReportTab = "doanh-thu" | "lai-lo" | "hang-hoa" | "cua-hang" | "nhan-vien" | "thanh-toan" | "giao-hang"

export const REPORT_TABS: { value: ReportTab; label: string; chainOnly?: boolean }[] = [
  { value: "doanh-thu", label: "Doanh thu" },
  { value: "lai-lo", label: "Lãi lỗ" },
  { value: "hang-hoa", label: "Hàng hoá" },
  { value: "cua-hang", label: "Cửa hàng", chainOnly: true },
  { value: "nhan-vien", label: "Nhân viên" },
  { value: "thanh-toan", label: "Thanh toán" },
  { value: "giao-hang", label: "Giao hàng" },
]

export interface ReportInput {
  /** Orders of the period in the store scope and channel (any status). */
  orders: Order[]
  /** Orders of the previous period, same filters; null when there is no history to compare with. */
  previousOrders: Order[] | null
  products: ProductLookup
  categories: Category[]
  stores: Store[]
  employees: Employee[]
  storeId: string | null
  period: ReportPeriod
}

export type RevenueReport = { tab: "doanh-thu"; days: DailySales[]; table: ReportTableSpec<DailySales> }
export type ProductsReport = {
  tab: "hang-hoa"
  categories: (CategorySales & { name: string })[]
  categoryTable: ReportTableSpec<CategorySales & { name: string }>
  productTable: ReportTableSpec<ProductSales & { rank: number }>
}
export type StoreRow = StoreSales & { store?: Store; netProfit: number }

export type StoresReport = {
  tab: "cua-hang"
  rows: StoreRow[]
  table: ReportTableSpec<StoreRow>
}
export type StaffReport = { tab: "nhan-vien"; table: ReportTableSpec<EmployeeSales> }
export type PaymentsReport = {
  tab: "thanh-toan"
  rows: PaymentSales[]
  table: ReportTableSpec<PaymentSales>
  cancellation: CancellationStats
  previousCancellation: CancellationStats | null
}
/** Deliveries of one store over the period. Riders are our own staff, so there is no platform fee. */
export interface DeliverySales {
  storeId: string
  name: string
  orders: number
  /** Revenue of the delivered orders. */
  revenue: number
  /** Delivery fees the shoppers paid. */
  collected: number
  /** Orders that got free delivery. */
  freeTrips: number
  km: number
}

export type DeliveryReport = {
  tab: "giao-hang"
  rows: DeliverySales[]
  table: ReportTableSpec<DeliverySales>
}

export type ProfitReport = {
  tab: "lai-lo"
  lines: ProfitLine[]
  netProfit: number
  grossMargin: number
  netMargin: number
  /** Same numbers scaled to one month, so a 7-day period still says something about the business. */
  monthly: { revenue: number; netProfit: number }
}

export type Report =
  ProfitReport | RevenueReport | ProductsReport | StoresReport | StaffReport | PaymentsReport | DeliveryReport

const money = (value: number) => formatVND(value)
const percentOrDash = (ratio: number, base: number) => (base > 0 ? formatPercent(ratio) : "—")
const percentCsv = (ratio: number, base: number) => (base > 0 ? formatPercent(ratio) : "")

/** Right-aligned money column over a numeric field, with a totals cell. */
function moneyColumn<T>(key: string, header: string, get: (row: T) => number, total?: number): ReportColumn<T> {
  return {
    key,
    header,
    csvHeader: `${header} (₫)`,
    align: "right",
    cell: (row) => money(get(row)),
    value: get,
    footer: total === undefined ? undefined : money(total),
    csvFooter: total,
  }
}

function countColumn<T>(key: string, header: string, get: (row: T) => number, total?: number): ReportColumn<T> {
  return {
    key,
    header,
    align: "right",
    cell: (row) => formatNumber(get(row)),
    value: get,
    footer: total === undefined ? undefined : formatNumber(total),
    csvFooter: total,
  }
}

/** Percent column: `ratio` of `base` (shows "—" when the base is 0). */
function percentColumn<T>(
  key: string,
  header: string,
  ratio: (row: T) => number,
  base: (row: T) => number,
  total?: { ratio: number; base: number },
): ReportColumn<T> {
  return {
    key,
    header,
    align: "right",
    cell: (row) => percentOrDash(ratio(row), base(row)),
    value: (row) => (base(row) > 0 ? ratio(row) : -Infinity),
    csv: (row) => percentCsv(ratio(row), base(row)),
    footer: total ? percentOrDash(total.ratio, total.base) : undefined,
    csvFooter: total ? percentCsv(total.ratio, total.base) : undefined,
  }
}

const sum = <T,>(rows: T[], get: (row: T) => number) => rows.reduce((acc, row) => acc + get(row), 0)
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

// ---------------------------------------------------------------------------

export function buildReport(tab: ReportTab, input: ReportInput): Report {
  switch (tab) {
    case "doanh-thu":
      return buildRevenue(input)
    case "lai-lo":
      return buildProfit(input)
    case "hang-hoa":
      return buildProducts(input)
    case "cua-hang":
      return buildStores(input)
    case "nhan-vien":
      return buildStaff(input)
    case "thanh-toan":
      return buildPayments(input)
    case "giao-hang":
      return buildDelivery(input)
  }
}

export function reportToCsv(report: Report): CsvSection[] {
  switch (report.tab) {
    case "doanh-thu":
      return [tableToCsv(report.table)]
    case "lai-lo":
      return [
        {
          title: "Lãi lỗ",
          header: ["Khoản mục", "Số tiền (₫)"],
          rows: report.lines.map((line) => [line.label, line.amount]),
        },
      ]
    case "hang-hoa":
      return [tableToCsv(report.categoryTable), tableToCsv(report.productTable)]
    case "cua-hang":
      return [tableToCsv(report.table)]
    case "nhan-vien":
      return [tableToCsv(report.table)]
    case "thanh-toan": {
      const c = report.cancellation
      return [
        tableToCsv(report.table),
        {
          title: "Huỷ đơn online",
          header: ["Chỉ số", "Giá trị"],
          rows: [
            ["Đơn online đã đặt", c.placed],
            ["Đơn bị huỷ", c.cancelled],
            ["Tỷ lệ huỷ", percentCsv(c.rate, c.placed)],
            ["Giá trị đơn bị huỷ (₫)", c.cancelledValue],
          ],
        },
      ]
    }
    case "giao-hang":
      return [tableToCsv(report.table)]
  }
}

function buildRevenue({ orders, products, period }: ReportInput): RevenueReport {
  const days = dailySales(orders, products, period)
  const total = {
    orders: sum(days, (d) => d.orders),
    revenue: sum(days, (d) => d.revenue),
    discount: sum(days, (d) => d.discount),
    grossProfit: sum(days, (d) => d.grossProfit),
  }
  return {
    tab: "doanh-thu",
    days,
    table: {
      title: "Doanh thu theo ngày",
      rows: days,
      rowKey: (d) => toDateKey(d.date),
      footer: true,
      columns: [
        {
          key: "date",
          header: "Ngày",
          cell: (d) => (
            <>
              <span className="inline-block w-7 text-muted-foreground">{weekdayShort(d.date)}</span>
              {formatDate(d.date)}
            </>
          ),
          value: (d) => d.date.getTime(),
          csv: (d) => formatDate(d.date),
          footer: "Tổng cộng",
          csvFooter: "Tổng cộng",
        },
        countColumn("orders", "Số đơn", (d) => d.orders, total.orders),
        moneyColumn("revenue", "Doanh thu", (d) => d.revenue, total.revenue),
        moneyColumn("discount", "Giảm giá", (d) => d.discount, total.discount),
        moneyColumn("grossProfit", "Lợi nhuận gộp", (d) => d.grossProfit, total.grossProfit),
        percentColumn(
          "margin",
          "Biên %",
          (d) => d.margin,
          (d) => d.revenue,
          { ratio: ratio(total.grossProfit, total.revenue), base: total.revenue },
        ),
      ],
    },
  }
}

function buildProducts({ orders, products, categories }: ReportInput): ProductsReport {
  const names = new Map(categories.map((c) => [c.id, c.name] as const))
  const rows = salesByCategory(orders, products, categories).map((row) => ({
    ...row,
    name: names.get(row.categoryId) ?? row.categoryId,
  }))
  const total = {
    quantity: sum(rows, (r) => r.quantity),
    revenue: sum(rows, (r) => r.revenue),
    grossProfit: sum(rows, (r) => r.grossProfit),
  }
  const top = salesByProduct(orders, products, "revenue")
    .slice(0, 20)
    .map((row, i) => ({ ...row, rank: i + 1 }))

  return {
    tab: "hang-hoa",
    categories: rows,
    categoryTable: {
      title: "Doanh thu theo danh mục",
      rows,
      rowKey: (r) => r.categoryId,
      footer: true,
      columns: [
        {
          key: "name",
          header: "Danh mục",
          cell: (r) => r.name,
          value: (r) => r.name,
          footer: "Tổng cộng",
          csvFooter: "Tổng cộng",
        },
        countColumn("quantity", "SL bán", (r) => r.quantity, total.quantity),
        moneyColumn("revenue", "Doanh thu", (r) => r.revenue, total.revenue),
        moneyColumn("grossProfit", "Lợi nhuận gộp", (r) => r.grossProfit, total.grossProfit),
        percentColumn(
          "margin",
          "Biên %",
          (r) => r.margin,
          (r) => r.revenue,
          { ratio: ratio(total.grossProfit, total.revenue), base: total.revenue },
        ),
        percentColumn(
          "share",
          "Tỷ trọng",
          (r) => r.share,
          () => total.revenue,
          { ratio: total.revenue > 0 ? 1 : 0, base: total.revenue },
        ),
      ],
    },
    productTable: {
      title: "Top 20 sản phẩm theo doanh thu",
      rows: top,
      rowKey: (r) => r.productId,
      emptyText: "Chưa bán được sản phẩm nào trong kỳ này",
      columns: [
        { key: "rank", header: "#", align: "right", cell: (r) => r.rank, value: (r) => r.rank, className: "w-10" },
        {
          key: "sku",
          header: "SKU",
          cell: (r) => <span className="font-mono text-xs">{products.get(r.productId)?.sku ?? "—"}</span>,
          value: (r) => products.get(r.productId)?.sku ?? "",
        },
        {
          key: "name",
          header: "Sản phẩm",
          cell: (r) => {
            const product = products.get(r.productId)
            return (
              <span className="flex min-w-56 items-center gap-2.5">
                <ProductImage
                  src={product?.image}
                  alt={product?.name ?? "Sản phẩm"}
                  size={28}
                  className="size-7 shrink-0 rounded-md bg-white ring-1 ring-border"
                />
                <span className="max-w-xs truncate" title={product?.name}>
                  {product?.name ?? "Sản phẩm đã xoá"}
                </span>
              </span>
            )
          },
          value: (r) => products.get(r.productId)?.name ?? r.productId,
        },
        countColumn("quantity", "SL", (r) => r.quantity),
        moneyColumn("revenue", "Doanh thu", (r) => r.revenue),
        moneyColumn("grossProfit", "Lợi nhuận gộp", (r) => r.grossProfit),
      ],
    },
  }
}

function buildStores({ orders, products, stores, period }: ReportInput): StoresReport {
  const byId = new Map(stores.map((s) => [s.id, s] as const))
  // Each store carries its own payroll, rent and utilities, so a store can lose money while the
  // chain as a whole makes it — that has to be visible without opening every store one by one.
  const costPerStore = perStoreCosts(period.days, stores.length)
  const running = costPerStore.payroll + costPerStore.rent + costPerStore.utilities + costPerStore.marketing
  const rows = salesByStore(orders, products, stores).map((row) => ({
    ...row,
    store: byId.get(row.storeId),
    netProfit: row.grossProfit - running,
  }))
  const total = {
    orders: sum(rows, (r) => r.orders),
    revenue: sum(rows, (r) => r.revenue),
    online: sum(rows, (r) => r.onlineOrders),
    grossProfit: sum(rows, (r) => r.grossProfit),
    netProfit: sum(rows, (r) => r.netProfit),
  }
  return {
    tab: "cua-hang",
    rows,
    table: {
      title: "Doanh thu theo cửa hàng",
      rows,
      rowKey: (r) => r.storeId,
      footer: true,
      columns: [
        {
          key: "store",
          header: "Cửa hàng",
          cell: (r) => (
            <span className="flex flex-col">
              <span className="flex items-center gap-2 font-medium">
                {r.store?.code ?? r.storeId}
                {r.store && r.store.status !== "active" ? (
                  <StatusBadge tone={STORE_STATUS[r.store.status].tone} className="h-5 px-2">
                    {STORE_STATUS[r.store.status].label}
                  </StatusBadge>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{r.store?.name}</span>
            </span>
          ),
          value: (r) => (r.store ? `${r.store.code} – ${r.store.name}` : r.storeId),
          footer: "Toàn chuỗi",
          csvFooter: "Toàn chuỗi",
        },
        countColumn("orders", "Số đơn", (r) => r.orders, total.orders),
        moneyColumn("revenue", "Doanh thu", (r) => r.revenue, total.revenue),
        moneyColumn("aov", "TB/đơn", (r) => Math.round(r.aov), Math.round(ratio(total.revenue, total.orders))),
        percentColumn(
          "online",
          "Online %",
          (r) => r.onlineShare,
          (r) => r.orders,
          { ratio: ratio(total.online, total.orders), base: total.orders },
        ),
        moneyColumn("grossProfit", "Lợi nhuận gộp", (r) => r.grossProfit, total.grossProfit),
        {
          key: "netProfit",
          header: "Lãi thuần",
          csvHeader: "Lãi thuần (₫)",
          align: "right",
          cell: (r) => (
            <span className={r.netProfit < 0 ? "font-semibold text-sale" : undefined}>
              {r.netProfit < 0 ? `− ${money(-r.netProfit)}` : money(r.netProfit)}
            </span>
          ),
          value: (r) => r.netProfit,
          footer: money(total.netProfit),
          csvFooter: total.netProfit,
        },
      ],
    },
  }
}

function buildStaff({ orders, employees, stores, storeId }: ReportInput): StaffReport {
  const people = new Map(employees.map((e) => [e.id, e] as const))
  const storeById = new Map(stores.map((s) => [s.id, s] as const))
  const cashiers = employees.filter(
    (e) => e.role === "cashier" && e.status !== "inactive" && (!storeId || e.storeId === storeId),
  )
  const rows = salesByEmployee(orders, cashiers)
  const total = {
    orders: sum(rows, (r) => r.orders),
    revenue: sum(rows, (r) => r.revenue),
    cash: sum(rows, (r) => r.cashRevenue),
  }
  const storeLabel = (id: string | null) => {
    const store = id ? storeById.get(id) : undefined
    return store ? `${store.code} – ${store.name}` : "Toàn chuỗi"
  }
  return {
    tab: "nhan-vien",
    table: {
      title: "Doanh thu theo nhân viên",
      rows,
      rowKey: (r) => r.employeeId,
      footer: true,
      emptyText: "Không có nhân viên nào trong phạm vi này",
      columns: [
        {
          key: "employee",
          header: "Nhân viên",
          cell: (r) => {
            const person = people.get(r.employeeId)
            return (
              <span className="flex flex-col">
                <span className="font-medium">{person?.fullName ?? r.employeeId}</span>
                <span className="text-xs text-muted-foreground">{person?.code}</span>
              </span>
            )
          },
          value: (r) => people.get(r.employeeId)?.fullName ?? r.employeeId,
          csv: (r) => {
            const person = people.get(r.employeeId)
            return person ? `${person.fullName} (${person.code})` : r.employeeId
          },
          footer: "Tổng cộng",
          csvFooter: "Tổng cộng",
        },
        {
          key: "store",
          header: "Cửa hàng",
          cell: (r) => <span className="text-muted-foreground">{storeLabel(r.storeId)}</span>,
          value: (r) => storeLabel(r.storeId),
        },
        countColumn("orders", "Số đơn", (r) => r.orders, total.orders),
        moneyColumn("revenue", "Doanh thu", (r) => r.revenue, total.revenue),
        moneyColumn("aov", "TB/đơn", (r) => Math.round(r.aov), Math.round(ratio(total.revenue, total.orders))),
        percentColumn(
          "cash",
          "Tỷ lệ tiền mặt",
          (r) => r.cashShare,
          (r) => r.revenue,
          { ratio: ratio(total.cash, total.revenue), base: total.revenue },
        ),
      ],
    },
  }
}

function buildPayments({ orders, previousOrders }: ReportInput): PaymentsReport {
  const rows = salesByPaymentMethod(orders)
  const total = { orders: sum(rows, (r) => r.orders), revenue: sum(rows, (r) => r.revenue) }
  return {
    tab: "thanh-toan",
    rows,
    cancellation: onlineCancellation(orders),
    previousCancellation: previousOrders ? onlineCancellation(previousOrders) : null,
    table: {
      title: "Doanh thu theo phương thức thanh toán",
      rows,
      rowKey: (r) => r.method,
      footer: true,
      columns: [
        {
          key: "method",
          header: "Phương thức",
          cell: (r) => PAYMENT_METHOD[r.method],
          value: (r) => PAYMENT_METHOD[r.method],
          footer: "Tổng cộng",
          csvFooter: "Tổng cộng",
        },
        countColumn("orders", "Số đơn", (r) => r.orders, total.orders),
        moneyColumn("revenue", "Doanh thu", (r) => r.revenue, total.revenue),
        percentColumn(
          "share",
          "Tỷ trọng",
          (r) => r.share,
          () => total.revenue,
          { ratio: total.revenue > 0 ? 1 : 0, base: total.revenue },
        ),
      ],
    },
  }
}

/**
 * Delivery over the period, per store: how many orders were ridden out, how far, and how much of
 * the delivery fee the shoppers actually paid (orders over the free-shipping threshold pay none).
 */
function buildDelivery({ orders, stores, storeId }: ReportInput): DeliveryReport {
  const byStore = new Map<string, DeliverySales>()
  for (const order of orders) {
    if (!order.delivery || order.status === "cancelled") continue
    if (storeId && order.storeId !== storeId) continue
    const store = stores.find((s) => s.id === order.storeId)
    const row = byStore.get(order.storeId) ?? {
      storeId: order.storeId,
      name: store ? `${store.code} – ${store.name}` : order.storeId,
      orders: 0,
      revenue: 0,
      collected: 0,
      freeTrips: 0,
      km: 0,
    }
    row.orders += 1
    row.revenue += order.total
    row.collected += order.shippingFee
    if (!order.shippingFee) row.freeTrips += 1
    row.km += order.delivery.distanceKm ?? 0
    byStore.set(order.storeId, row)
  }
  const rows = [...byStore.values()].sort((a, b) => b.orders - a.orders)
  const total = {
    orders: sum(rows, (r) => r.orders),
    revenue: sum(rows, (r) => r.revenue),
    collected: sum(rows, (r) => r.collected),
    freeTrips: sum(rows, (r) => r.freeTrips),
    km: sum(rows, (r) => r.km),
  }
  const avgKm = (r: DeliverySales) => (r.orders ? r.km / r.orders : 0)
  const km = (value: number) => `${formatNumber(Math.round(value * 10) / 10)} km`

  return {
    tab: "giao-hang",
    rows,
    table: {
      title: "Giao hàng theo cửa hàng",
      rows,
      rowKey: (r) => r.storeId,
      footer: true,
      columns: [
        {
          key: "store",
          header: "Cửa hàng",
          cell: (r) => r.name,
          value: (r) => r.name,
          footer: "Tổng cộng",
          csvFooter: "Tổng cộng",
        },
        countColumn("orders", "Đơn giao", (r) => r.orders, total.orders),
        {
          key: "avgKm",
          header: "Quãng TB",
          align: "right",
          cell: (r) => km(avgKm(r)),
          value: avgKm,
          footer: km(total.orders ? total.km / total.orders : 0),
          csvFooter: total.orders ? total.km / total.orders : 0,
        },
        countColumn("free", "Đơn miễn phí giao", (r) => r.freeTrips, total.freeTrips),
        moneyColumn("collected", "Phí giao thu được", (r) => r.collected, total.collected),
        moneyColumn("revenue", "Doanh thu đơn giao", (r) => r.revenue, total.revenue),
      ],
    },
  }
}

/** Revenue and cost of goods come from the orders; running costs from the monthly rates. */
function buildProfit({ orders, products, stores, storeId, period }: ReportInput): ProfitReport {
  const sales = summarizeSales(orders, products)
  const pnl = profitAndLoss({
    revenue: sales.revenue,
    grossProfit: sales.grossProfit,
    days: period.days,
    storeCount: stores.length,
    storeId,
  })
  const months = period.days / 30
  return {
    tab: "lai-lo",
    lines: pnl.lines,
    netProfit: pnl.netProfit,
    grossMargin: pnl.grossMargin,
    netMargin: pnl.netMargin,
    monthly: {
      revenue: months ? Math.round(sales.revenue / months) : 0,
      netProfit: months ? Math.round(pnl.netProfit / months) : 0,
    },
  }
}
