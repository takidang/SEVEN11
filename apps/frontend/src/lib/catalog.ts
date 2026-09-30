import type { Category, Product } from "@/types"

import { normalizeText } from "./format"

/** Pure catalog queries — pass in whatever product list you hold (static or from the DB). */

export function findCategory(categories: Category[], slug: string) {
  return categories.find((c) => c.slug === slug) ?? null
}

export function findProductBySlug(products: Product[], slug: string) {
  return products.find((p) => p.slug === slug) ?? null
}

export function productsInCategory(products: Product[], categoryId: string, subcategoryId?: string) {
  return products.filter(
    (p) => p.isActive && p.categoryId === categoryId && (!subcategoryId || p.subcategoryId === subcategoryId),
  )
}

/** Accent-insensitive search on name, brand, SKU and barcode. */
export function searchProducts(products: Product[], query: string, { includeInactive = false } = {}) {
  const q = normalizeText(query)
  if (!q) return []
  const terms = q.split(/\s+/)
  return products.filter((p) => {
    if (!includeInactive && !p.isActive) return false
    if (p.barcode === query.trim() || p.sku.toLowerCase() === q) return true
    const haystack = normalizeText(`${p.name} ${p.brand}`)
    return terms.every((t) => haystack.includes(t))
  })
}

/** Products worth showing on the home page rails. */
export function discountedProducts(products: Product[]) {
  return products.filter((p) => p.isActive && p.compareAtPrice && p.compareAtPrice > p.price)
}

export function newProducts(products: Product[]) {
  return products.filter((p) => p.isActive && p.isNew)
}
