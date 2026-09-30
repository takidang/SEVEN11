import { budgetLines, company, headOfficeMonthlyPayroll, perStoreMonthly } from "@/data/company"
import type { Product, PurchaseOrder, StockLevel } from "@/types"

/**
 * Monthly operating budget vs what has actually been spent. Purchasing is real (it comes from the
 * received purchase orders); the fixed costs are accrued day by day from the per-store rates,
 * because the project has no expense module yet — the backend would read real expense records.
 */
export interface BudgetRow {
  id: string
  label: string
  note: string
  /** Allowed for the whole month. */
  budget: number
  /** Spent so far this month. */
  spent: number
  /** 0–1 (can exceed 1 when overspent). */
  used: number
}

/** Share of the month already gone, so a fixed monthly cost accrues day by day. */
export function monthProgress(now: Date): number {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.min(1, (now.getDate() - 1 + now.getHours() / 24) / days)
}

function purchasingSpend(purchaseOrders: PurchaseOrder[], now: Date, storeId: string | null): number {
  const month = now.getMonth()
  const year = now.getFullYear()
  return purchaseOrders
    .filter((po) => {
      if (po.status === "cancelled" || po.status === "draft") return false
      if (storeId && po.storeId !== storeId) return false
      const at = new Date(po.receivedAt ?? po.createdAt)
      return at.getMonth() === month && at.getFullYear() === year
    })
    .reduce((sum, po) => sum + po.items.reduce((s, i) => s + i.costPrice * i.quantity, 0), 0)
}

/** `storeId` null = whole chain; one store gets its share of the chain budget. */
export function buildBudget(
  purchaseOrders: PurchaseOrder[],
  storeCount: number,
  storeId: string | null,
  now: Date,
): BudgetRow[] {
  const share = storeId ? 1 / Math.max(1, storeCount) : 1
  const progress = monthProgress(now)
  const stores = storeId ? 1 : storeCount

  return budgetLines.map((line) => {
    const budget = Math.round(line.monthly * share)
    let spent: number
    if (line.source === "purchase-orders") {
      spent = purchasingSpend(purchaseOrders, now, storeId)
    } else if (line.id === "payroll") {
      spent = Math.round((perStoreMonthly.payroll * stores + (storeId ? 0 : headOfficeMonthlyPayroll)) * progress)
    } else if (line.id === "rent") {
      spent = Math.round(perStoreMonthly.rent * stores * progress)
    } else if (line.id === "utilities") {
      spent = Math.round(perStoreMonthly.utilities * stores * progress)
    } else {
      spent = Math.round(budget * progress)
    }
    return { id: line.id, label: line.label, note: line.note, budget, spent, used: budget ? spent / budget : 0 }
  })
}

export function totalBudget(rows: BudgetRow[]) {
  const budget = rows.reduce((s, r) => s + r.budget, 0)
  const spent = rows.reduce((s, r) => s + r.spent, 0)
  return { budget, spent, used: budget ? spent / budget : 0 }
}

/** Giá vốn của toàn bộ hàng đang có trong kho (`storeId` null = cả chuỗi). */
export function inventoryValue(
  stock: StockLevel[],
  products: ReadonlyMap<string, Product>,
  storeId: string | null,
): { cost: number; retail: number; units: number } {
  let cost = 0
  let retail = 0
  let units = 0
  for (const level of stock) {
    if (storeId && level.storeId !== storeId) continue
    const product = products.get(level.productId)
    if (!product || level.quantity <= 0) continue
    cost += level.quantity * product.costPrice
    retail += level.quantity * product.price
    units += level.quantity
  }
  return { cost, retail, units }
}

/**
 * Where the share capital currently sits. Cash is what is left after the fixed assets and the
 * goods on the shelves, so the three lines always add back up to the capital.
 */
export function capitalBreakdown(inventoryCost: number) {
  const cash = company.charterCapital - company.fixedAssets - inventoryCost
  return {
    capital: company.charterCapital,
    fixedAssets: company.fixedAssets,
    inventory: inventoryCost,
    cash,
  }
}

/** One line of the profit & loss statement. */
export interface ProfitLine {
  id: string
  label: string
  /** Negative for costs. */
  amount: number
  /** Subtotals are shown in bold with a rule above. */
  total?: boolean
  note?: string
}

/**
 * Running costs for a period of `days`, prorated from the monthly rates. Picking one store gives
 * that store's own payroll, rent and utilities, plus its share of the head office and marketing.
 */
export function operatingCosts(days: number, storeCount: number, storeId: string | null) {
  return costsFor(days, storeCount, storeId ? 1 : storeCount, storeId ? 1 / Math.max(1, storeCount) : 1)
}

/** Running costs of a single store for `days` — its own payroll and rent, plus its share of the chain's. */
export function perStoreCosts(days: number, storeCount: number) {
  return costsFor(days, storeCount, 1, 1 / Math.max(1, storeCount))
}

function costsFor(days: number, _storeCount: number, stores: number, share: number) {
  const months = days / 30
  const marketing = budgetLines.find((l) => l.id === "marketing")?.monthly ?? 0
  return {
    payroll: Math.round((perStoreMonthly.payroll * stores + headOfficeMonthlyPayroll * share) * months),
    rent: Math.round(perStoreMonthly.rent * stores * months),
    utilities: Math.round(perStoreMonthly.utilities * stores * months),
    marketing: Math.round(marketing * share * months),
  }
}

/**
 * Profit & loss for a period: real revenue and cost of goods from the orders, running costs from
 * the monthly rates. Without this the reports stop at gross profit and nobody can tell whether
 * the chain actually makes money.
 */
export function profitAndLoss(input: {
  revenue: number
  grossProfit: number
  days: number
  storeCount: number
  storeId: string | null
}): { lines: ProfitLine[]; netProfit: number; grossMargin: number; netMargin: number } {
  const costs = operatingCosts(input.days, input.storeCount, input.storeId)
  const running = costs.payroll + costs.rent + costs.utilities + costs.marketing
  const netProfit = input.grossProfit - running
  const lines: ProfitLine[] = [
    { id: "revenue", label: "Doanh thu", amount: input.revenue },
    { id: "cogs", label: "Giá vốn hàng bán", amount: -(input.revenue - input.grossProfit) },
    { id: "gross", label: "Lãi gộp", amount: input.grossProfit, total: true },
    { id: "payroll", label: "Lương nhân viên", amount: -costs.payroll, note: "Gồm cả nhân viên giao hàng" },
    { id: "rent", label: "Thuê mặt bằng", amount: -costs.rent },
    { id: "utilities", label: "Điện nước", amount: -costs.utilities },
    { id: "marketing", label: "Marketing & khuyến mãi", amount: -costs.marketing },
    { id: "net", label: "Lãi thuần", amount: netProfit, total: true },
  ]
  return {
    lines,
    netProfit,
    grossMargin: input.revenue ? input.grossProfit / input.revenue : 0,
    netMargin: input.revenue ? netProfit / input.revenue : 0,
  }
}
