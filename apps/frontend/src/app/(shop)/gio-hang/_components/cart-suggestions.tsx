"use client"

import { useMemo, useState } from "react"

import { ProductRail, SectionHeading } from "@/components/shop/product-rail"
import { useActiveProducts } from "@/hooks/use-catalog"
import type { CartLine } from "@/lib/pricing"

/** Categories that go well with almost any convenience-store basket, in display priority. */
const ADD_ON_CATEGORIES = ["tra-sua", "do-uong-dong-chai", "do-an-vat", "cac-loai-banh", "san-pham-tu-sua"]
const EXCLUDED_SUBCATEGORIES = ["tra-sua--topping"]
const LIMIT = 12

/**
 * "Có thể bạn cần thêm": quick add-ons from categories not in the cart yet, deals first.
 * Based on the basket when the page opened, so items added from the rail stay put (and
 * show their quantity stepper) instead of jumping out of it.
 */
export function CartSuggestions({ lines }: { lines: CartLine[] }) {
  const products = useActiveProducts()
  const [initialIds] = useState(() => lines.map((l) => l.productId))

  const suggestions = useMemo(() => {
    const inCart = new Set(initialIds)
    const cartCategories = new Set(products.filter((p) => inCart.has(p.id)).map((p) => p.categoryId))
    const score = (p: (typeof products)[number]) =>
      (p.compareAtPrice && p.compareAtPrice > p.price ? 2 : 0) + (p.isNew ? 1 : 0)

    // Categories the basket is missing come first; each contributes its best deals, interleaved.
    const categories = [...ADD_ON_CATEGORIES].sort(
      (a, b) => Number(cartCategories.has(a)) - Number(cartCategories.has(b)),
    )
    const queues = categories.map((categoryId) =>
      products
        .filter(
          (p) =>
            p.categoryId === categoryId &&
            !inCart.has(p.id) &&
            !p.ageRestricted &&
            !EXCLUDED_SUBCATEGORIES.includes(p.subcategoryId),
        )
        .sort((a, b) => score(b) - score(a) || a.price - b.price),
    )
    const picked = []
    for (let round = 0; picked.length < LIMIT && queues.some((q) => q.length > round); round++) {
      for (const queue of queues) {
        if (queue[round] && picked.length < LIMIT) picked.push(queue[round])
      }
    }
    return picked
  }, [initialIds, products])

  if (!suggestions.length) return null

  return (
    <section>
      <SectionHeading title="Có thể bạn cần thêm" />
      <ProductRail products={suggestions} />
    </section>
  )
}
