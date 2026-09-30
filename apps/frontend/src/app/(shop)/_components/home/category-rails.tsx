"use client"

import { useMemo } from "react"

import { ProductRail, SectionHeading } from "@/components/shop/product-rail"
import { useCategories, useProducts } from "@/hooks/use-catalog"
import { newProducts, productsInCategory } from "@/lib/catalog"
import type { Category, Product } from "@/types"

/** Main categories that get their own rail on the home page, in this order. */
const HOME_RAIL_CATEGORY_IDS = [
  "tra-sua",
  "mon-ngon",
  "cac-loai-banh",
  "do-an-vat",
  "san-pham-tu-sua",
  "do-uong-dong-chai",
]

const RAIL_SIZE = 14

export function NewProductsRail() {
  const products = useProducts()
  const list = useMemo(
    () => [...newProducts(products)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 16),
    [products],
  )
  if (!list.length) return null
  return (
    <section>
      <SectionHeading title="Sản phẩm mới" />
      <ProductRail products={list} />
    </section>
  )
}

export function CategoryRails() {
  const categories = useCategories()
  const products = useProducts()
  const rails = useMemo(
    () =>
      HOME_RAIL_CATEGORY_IDS.map((id) => categories.find((c) => c.id === id))
        .filter((c): c is Category => !!c)
        .map((category) => ({ category, products: productsInCategory(products, category.id).slice(0, RAIL_SIZE) }))
        .filter((rail) => rail.products.length > 0),
    [categories, products],
  )

  return rails.map(({ category, products: list }) => (
    <CategoryRail key={category.id} category={category} products={list} />
  ))
}

function CategoryRail({ category, products }: { category: Category; products: Product[] }) {
  return (
    <section>
      <SectionHeading
        title={category.name}
        href={`/danh-muc/${category.slug}`}
        chips={category.subcategories.map((sub) => ({
          id: sub.id,
          label: sub.name,
          href: `/danh-muc/${category.slug}?nhom=${sub.slug}`,
        }))}
      />
      <ProductRail products={products} />
    </section>
  )
}
