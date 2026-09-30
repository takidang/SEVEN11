"use client"

import { BikeIcon, PackageSearchIcon } from "lucide-react"
import Link from "next/link"
import { notFound, useSearchParams } from "next/navigation"
import { useMemo } from "react"

import { ProductCard } from "@/components/shop/product-card"
import { ProductImage } from "@/components/shop/product-image"
import { ProductGrid, SectionHeading } from "@/components/shop/product-rail"
import { Button } from "@/components/ui/button"
import { useCategories, useProducts } from "@/hooks/use-catalog"
import { findCategory, productsInCategory } from "@/lib/catalog"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/types"

import { EmptyState } from "../../../_components/empty-state"
import {
  LISTING_SORTS,
  SORT_PARAM,
  SortSelect,
  useSortedProducts,
  useSortParam,
} from "../../../_components/product-sort"
import { Bone, ProductGridSkeleton } from "../../../_components/skeletons"

/** Query key for the sub-category (`?nhom=snacks`). */
const GROUP_PARAM = "nhom"

export function CategoryView({ slug }: { slug: string }) {
  const categories = useCategories()
  const category = findCategory(categories, slug)
  if (!category) notFound()
  return <CategoryListing category={category} />
}

function CategoryListing({ category }: { category: Category }) {
  const searchParams = useSearchParams()
  const products = useProducts()
  const [sort, setSort] = useSortParam(LISTING_SORTS, "pho-bien")

  const group = searchParams.get(GROUP_PARAM)
  const sub = category.subcategories.find((s) => s.slug === group) ?? null

  const all = useMemo(() => productsInCategory(products, category.id), [products, category.id])
  const sorted = useSortedProducts(all, sort)
  // Titles and counts are known right away; the sorted products arrive once the DB is loaded.
  const sections = useMemo(
    () =>
      category.subcategories
        .map((s) => ({
          sub: s,
          count: all.filter((p) => p.subcategoryId === s.id).length,
          products: sorted ? sorted.filter((p) => p.subcategoryId === s.id) : null,
        }))
        .filter((section) => section.count > 0),
    [category.subcategories, all, sorted],
  )

  const hrefFor = (subSlug: string | null) => {
    const params = new URLSearchParams()
    if (subSlug) params.set(GROUP_PARAM, subSlug)
    const current = searchParams.get(SORT_PARAM)
    if (current) params.set(SORT_PARAM, current)
    const query = params.toString()
    return `/danh-muc/${category.slug}${query ? `?${query}` : ""}`
  }

  const selected = sub ? (sections.find((s) => s.sub.id === sub.id) ?? { sub, count: 0, products: [] }) : null

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 overflow-hidden rounded-full bg-surface ring-1 ring-border/70 sm:size-16">
          <ProductImage src={category.icon} alt="" size={64} priority className="size-full object-cover" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{category.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{all.length} sản phẩm</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 font-medium text-fresh">
              <BikeIcon className="size-4" />
              Giao nhanh 24 phút
            </span>
          </p>
        </div>
      </header>

      {category.ageRestricted ? <AgeNotice /> : null}

      <div className="sticky top-[105px] z-20 -mx-4 border-b border-border/70 bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:top-[45px] lg:top-[65px] lg:-mx-5 lg:px-5">
        <div className="flex items-center gap-3">
          <nav aria-label={`Nhóm sản phẩm ${category.name}`} className="min-w-0 flex-1">
            <ul className="-mx-1 no-scrollbar flex gap-2 overflow-x-auto px-1 py-0.5">
              <li className="shrink-0">
                <GroupChip href={hrefFor(null)} active={!sub}>
                  Tất cả
                </GroupChip>
              </li>
              {category.subcategories.map((s) => (
                <li key={s.id} className="shrink-0">
                  <GroupChip href={hrefFor(s.slug)} active={sub?.id === s.id}>
                    {s.name}
                  </GroupChip>
                </li>
              ))}
            </ul>
          </nav>
          <SortSelect
            value={sort}
            options={LISTING_SORTS}
            onChange={setSort}
            compact
            isDefault={sort === "pho-bien"}
            className="shrink-0"
          />
        </div>
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={PackageSearchIcon}
          title="Danh mục này tạm hết sản phẩm"
          description="Hàng mới về mỗi ngày, bạn quay lại sau hoặc xem các danh mục khác nhé."
          action={
            <Button asChild>
              <Link href="/">Về trang chủ</Link>
            </Button>
          }
        />
      ) : selected ? (
        <section>
          <SectionHeading title={selected.sub.name}>
            <span className="text-sm text-muted-foreground">{selected.count} sản phẩm</span>
          </SectionHeading>
          {selected.count ? (
            <ProductList products={selected.products} count={selected.count} />
          ) : (
            <EmptyState
              icon={PackageSearchIcon}
              title={`Nhóm ${selected.sub.name} tạm hết sản phẩm`}
              description="Bạn xem các sản phẩm khác trong danh mục nhé."
              action={
                <Button asChild variant="outline">
                  <Link href={hrefFor(null)}>Xem tất cả {category.name}</Link>
                </Button>
              }
            />
          )}
        </section>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.sub.id}>
              <SectionHeading title={section.sub.name}>
                <span className="text-sm text-muted-foreground">{section.count} sản phẩm</span>
              </SectionHeading>
              <ProductList products={section.products} count={section.count} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/** Product grid, or a skeleton of the same size while the sort order is still loading. */
function ProductList({ products, count }: { products: Product[] | null; count: number }) {
  if (!products) return <ProductGridSkeleton count={Math.min(count, 12)} />
  return (
    <ProductGrid>
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} priority={i < 5} />
      ))}
    </ProductGrid>
  )
}

function GroupChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap ring-1 transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-brand font-medium text-white ring-brand" : "bg-white text-brand ring-brand/25 hover:bg-brand-soft",
      )}
    >
      {children}
    </Link>
  )
}

function AgeNotice() {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl bg-surface p-3 ring-1 ring-border sm:items-center">
      <span className="flex h-7 shrink-0 items-center rounded-md bg-foreground/85 px-2 text-xs font-bold text-white">
        18+
      </span>
      <p className="text-sm text-foreground">
        <span className="font-semibold">Chỉ bán cho khách từ đủ 18 tuổi.</span>{" "}
        <span className="text-muted-foreground">
          Bạn sẽ xác nhận độ tuổi khi thêm vào giỏ; nhân viên giao hàng có thể kiểm tra giấy tờ tuỳ thân khi nhận hàng.
        </span>
      </p>
    </div>
  )
}

/** Suspense fallback while the search params resolve on the client. */
export function CategorySkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="flex items-center gap-4">
        <Bone className="size-14 rounded-full sm:size-16" />
        <div className="space-y-2">
          <Bone className="h-7 w-56" />
          <Bone className="h-4 w-40" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <ProductGridSkeleton />
    </div>
  )
}
