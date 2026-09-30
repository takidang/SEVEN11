"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { useMemo } from "react"

import { ProductImage } from "@/components/shop/product-image"
import { ProductRail, SectionHeading } from "@/components/shop/product-rail"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useCategories, useProducts } from "@/hooks/use-catalog"
import { findProductBySlug } from "@/lib/catalog"
import { useDbReady } from "@/stores/hydration"
import type { Category, Product } from "@/types"

import { Bone } from "../../../_components/skeletons"
import { ProductFacts } from "./product-facts"
import { ProductOffers } from "./product-offers"
import { MobileBuyBar, PurchasePanel, usePurchase } from "./purchase-panel"

export function ProductView({ slug }: { slug: string }) {
  const products = useProducts()
  const ready = useDbReady()
  const product = findProductBySlug(products, slug)

  if (!product) {
    // Seed products render on the server; ones added in the back office appear once the DB loads.
    if (ready) notFound()
    return <ProductSkeleton />
  }
  return <ProductDetail product={product} />
}

function ProductDetail({ product }: { product: Product }) {
  const categories = useCategories()
  const products = useProducts()
  const purchase = usePurchase(product)
  const { display } = purchase
  const category = categories.find((c) => c.id === product.categoryId)
  const sub = category?.subcategories.find((s) => s.id === product.subcategoryId)

  const related = useMemo(() => {
    const others = products.filter((p) => p.isActive && p.id !== product.id)
    const sameSub = others.filter((p) => p.subcategoryId === product.subcategoryId)
    const sameCategory = others.filter(
      (p) => p.categoryId === product.categoryId && p.subcategoryId !== product.subcategoryId,
    )
    return [...sameSub, ...sameCategory].slice(0, 12)
  }, [products, product])

  return (
    <div className="space-y-8">
      <ProductBreadcrumb product={product} category={category} subName={sub?.name} subSlug={sub?.slug} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-10">
        <div className="lg:sticky lg:top-[81px] lg:self-start">
          <div className="relative overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-border sm:p-5">
            <ProductImage
              src={product.image}
              alt={product.name}
              size={520}
              priority
              className="mx-auto aspect-square w-full max-w-[520px]"
            />
            <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-1.5 sm:top-4 sm:left-4">
              {display.flashSale ? (
                <span className="rounded-md bg-red px-2 py-1 text-xs font-bold text-white uppercase">Flash sale</span>
              ) : null}
              {product.isNew ? (
                <span className="rounded-md bg-brand px-2 py-1 text-xs font-bold text-white uppercase">Mới</span>
              ) : null}
              {product.ageRestricted ? (
                <span className="rounded-md bg-foreground/85 px-2 py-1 text-xs font-bold text-white">18+</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">
              {[product.brand, product.origin, `Đơn vị: ${product.unit}`].filter(Boolean).join(" · ")}
            </p>
            <h1 className="mt-1 text-xl leading-snug font-bold text-balance text-foreground sm:text-2xl">
              {product.name}
            </h1>
          </div>

          <PurchasePanel purchase={purchase} />
          <ProductOffers product={product} />
          <ProductFacts product={product} category={category} subName={sub?.name} subSlug={sub?.slug} />
        </div>
      </div>

      {related.length ? (
        <section>
          <SectionHeading
            title="Sản phẩm cùng loại"
            href={category ? `/danh-muc/${category.slug}${sub ? `?nhom=${sub.slug}` : ""}` : undefined}
          />
          <ProductRail products={related} />
        </section>
      ) : null}

      <MobileBuyBar purchase={purchase} />
    </div>
  )
}

function ProductBreadcrumb({
  product,
  category,
  subName,
  subSlug,
}: {
  product: Product
  category?: Category
  subName?: string
  subSlug?: string
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Trang chủ</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {category ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/danh-muc/${category.slug}`}>{category.name}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        ) : null}
        {category && subName && subSlug ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/danh-muc/${category.slug}?nhom=${subSlug}`}>{subName}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        ) : null}
        <BreadcrumbSeparator className="hidden sm:list-item" />
        <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
          <BreadcrumbPage className="max-w-72 truncate">{product.name}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function ProductSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Bone className="h-5 w-64" />
      <div className="grid gap-6 lg:grid-cols-2 xl:gap-10">
        <Bone className="aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <Bone className="h-4 w-48" />
          <Bone className="h-8 w-4/5" />
          <Bone className="h-9 w-40" />
          <Bone className="h-20 w-full rounded-xl" />
          <Bone className="h-12 w-full rounded-xl" />
          <Bone className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
