import type { Product, StockLevel, Supplier } from "@/types"

export interface Suggestion {
  product: Product
  /** Quantity to order so the shelf reaches 3× the minimum. */
  quantity: number
}

export interface SuggestionPlan {
  /** supplierId → low-stock products it supplies (first active supplier covering the category). */
  bySupplier: Map<string, Suggestion[]>
  /** Low-stock products no active supplier covers. */
  unassigned: Product[]
  total: number
  /** Supplier with the most suggestions (null when nothing is low). */
  topSupplierId: string | null
}

export const REORDER_MULTIPLIER = 3

/** "Tạo phiếu nhập cho hàng sắp hết": active products at/below their minimum in one store. */
export function planLowStockOrder({
  storeId,
  products,
  stock,
  suppliers,
}: {
  storeId: string
  products: Product[]
  stock: StockLevel[]
  suppliers: Supplier[]
}): SuggestionPlan {
  const active = suppliers.filter((s) => s.status === "active")
  const levels = new Map(stock.filter((l) => l.storeId === storeId).map((l) => [l.productId, l] as const))
  const bySupplier = new Map<string, Suggestion[]>()
  const unassigned: Product[] = []
  let total = 0

  for (const product of products) {
    if (!product.isActive) continue
    const level = levels.get(product.id)
    if (!level || level.quantity > level.minQuantity) continue
    total++
    const supplier = active.find((s) => s.categoryIds.includes(product.categoryId))
    if (!supplier) {
      unassigned.push(product)
      continue
    }
    const quantity = Math.max(level.minQuantity * REORDER_MULTIPLIER - level.quantity, 1)
    const list = bySupplier.get(supplier.id) ?? []
    list.push({ product, quantity })
    bySupplier.set(supplier.id, list)
  }

  let topSupplierId: string | null = null
  for (const [supplierId, list] of bySupplier) {
    if (!topSupplierId || list.length > (bySupplier.get(topSupplierId)?.length ?? 0)) topSupplierId = supplierId
  }
  return { bySupplier, unassigned, total, topSupplierId }
}
