"use client"

import { SearchIcon, SearchXIcon, TrendingUpIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo } from "react"

import { ProductCard } from "@/components/shop/product-card"
import { ProductGrid, ProductRail, SectionHeading } from "@/components/shop/product-rail"
import { useCategories, useProducts } from "@/hooks/use-catalog"
import { discountedProducts, searchProducts } from "@/lib/catalog"
import { normalizeText } from "@/lib/format"
import type { Product } from "@/types"

import { EmptyState } from "../../_components/empty-state"
import { type SortKey, SortSelect, useSortedProducts, useSortParam } from "../../_components/product-sort"
import { Bone, ProductGridSkeleton } from "../../_components/skeletons"

const SEARCH_SORTS: SortKey[] = ["phu-hop", "pho-bien", "gia-tang", "gia-giam", "giam-gia", "moi-nhat"]

const POPULAR_SEARCHES = ["trà sữa", "mì ly", "bia", "sữa chua", "snack", "bánh mì"]

/** Accent-free lowercase words of a name ("Mì Ly Samyang" -> ["mi", "ly", "samyang"]). */
function wordsOf(text: string) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Every query term is a whole word of `words` (terms of 3+ letters may also match a word's start). */
function matchesWords(words: string[], terms: string[]) {
  return terms.every((t) => words.some((w) => w === t || (t.length >= 3 && w.startsWith(t))))
}

/**
 * Relevance on top of `searchProducts` (which matches substrings): exact SKU/barcode,
 * then names that start with the query as whole words, then whole-word hits — so
 * "mì" ranks "Mì Ly Samyang" above "Milo" and "Fresh Milk".
 */
function relevanceScores(results: Product[], query: string) {
  const terms = wordsOf(query)
  const phrase = terms.join(" ")
  const scores = new Map<string, number>()
  for (const p of results) {
    const words = wordsOf(p.name)
    const name = words.join(" ")
    let score = terms.filter((t) => words.includes(t)).length
    if (` ${name} `.includes(` ${phrase} `)) score += 2
    if (`${name} `.startsWith(`${phrase} `)) score += 4
    if (p.barcode === query.trim() || p.sku.toLowerCase() === query.trim().toLowerCase()) score += 20
    scores.set(p.id, score)
  }
  return scores
}

export function SearchView() {
  const searchParams = useSearchParams()
  const query = (searchParams.get("q") ?? "").trim()
  const products = useProducts()
  const categories = useCategories()
  const [sort, setSort] = useSortParam(SEARCH_SORTS, "phu-hop")

  const results = useMemo(() => {
    // `searchProducts` matches substrings ("mi" also hits "Milk"); keep whole-word hits when there are any.
    const found = searchProducts(products, query)
    const terms = wordsOf(query)
    const strong = found.filter((p) => matchesWords(wordsOf(`${p.name} ${p.brand}`), terms))
    return strong.length ? strong : found
  }, [products, query])
  const relevance = useMemo(() => relevanceScores(results, query), [results, query])
  const sorted = useSortedProducts(results, sort, relevance)
  const deals = useMemo(() => discountedProducts(products).slice(0, 16), [products])

  // Category / group names that match the query ("bia", "snack"…) as shortcuts.
  const matchedGroups = useMemo(() => {
    const terms = wordsOf(query)
    if (!terms.length) return []
    const groups: { href: string; label: string }[] = []
    for (const category of categories) {
      if (matchesWords(wordsOf(category.name), terms))
        groups.push({ href: `/danh-muc/${category.slug}`, label: category.name })
      for (const sub of category.subcategories) {
        if (matchesWords(wordsOf(sub.name), terms))
          groups.push({ href: `/danh-muc/${category.slug}?nhom=${sub.slug}`, label: sub.name })
      }
    }
    return groups.slice(0, 6)
  }, [categories, query])

  if (!query) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tìm kiếm sản phẩm</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập tên sản phẩm hoặc thương hiệu vào ô tìm kiếm, hoặc chọn một từ khoá phổ biến bên dưới.
          </p>
          <PopularSearches className="mt-4" />
        </div>
        <DealsRail products={deals} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold break-words text-foreground sm:text-2xl">Kết quả cho “{query}”</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {results.length ? `Tìm thấy ${results.length} sản phẩm` : "Không có sản phẩm phù hợp"}
            </p>
          </div>
          {results.length > 1 ? <SortSelect value={sort} options={SEARCH_SORTS} onChange={setSort} /> : null}
        </div>
        {matchedGroups.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Danh mục liên quan:</span>
            {matchedGroups.map((group) => (
              <Link
                key={group.href}
                href={group.href}
                className="rounded-full bg-white px-3 py-1 text-sm text-brand ring-1 ring-brand/25 transition hover:bg-brand-soft"
              >
                {group.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {results.length ? (
        sorted ? (
          <ProductGrid>
            {sorted.map((product, i) => (
              <ProductCard key={product.id} product={product} priority={i < 5} />
            ))}
          </ProductGrid>
        ) : (
          <ProductGridSkeleton count={Math.min(results.length, 12)} />
        )
      ) : (
        <div className="rounded-xl bg-surface/60 pb-8">
          <EmptyState
            icon={SearchXIcon}
            title={`Không tìm thấy sản phẩm nào cho “${query}”`}
            description="Kiểm tra lại chính tả, thử từ khoá ngắn hơn hoặc chọn một từ khoá phổ biến."
          />
          <PopularSearches className="justify-center px-4" />
        </div>
      )}

      {results.length ? null : <DealsRail products={deals} />}
    </div>
  )
}

function PopularSearches({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ul className="flex flex-wrap items-center gap-2" aria-label="Tìm kiếm phổ biến">
        <li className="mr-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
          <TrendingUpIcon className="size-4 text-orange" />
          Tìm kiếm phổ biến
        </li>
        {POPULAR_SEARCHES.map((term) => (
          <li key={term}>
            <Link
              href={`/tim-kiem?q=${encodeURIComponent(term)}`}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-foreground ring-1 ring-border transition hover:text-brand hover:ring-brand/40"
            >
              <SearchIcon className="size-3.5 text-muted-foreground" />
              {term}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DealsRail({ products }: { products: Product[] }) {
  if (!products.length) return null
  return (
    <section>
      <SectionHeading title="Đang giảm giá" href="/khuyen-mai" />
      <ProductRail products={products} />
    </section>
  )
}

export function SearchSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Bone className="h-7 w-72" />
        <Bone className="h-4 w-40" />
      </div>
      <ProductGridSkeleton />
    </div>
  )
}
