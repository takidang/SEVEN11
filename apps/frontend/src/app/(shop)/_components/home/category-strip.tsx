"use client"

import { ZapIcon } from "lucide-react"
import Link from "next/link"

import { ProductImage } from "@/components/shop/product-image"
import { SectionHeading } from "@/components/shop/product-rail"
import { useCategories } from "@/hooks/use-catalog"

import { ScrollRow } from "../scroll-row"

const ITEM = "group flex w-[76px] shrink-0 snap-start flex-col items-center gap-2 text-center outline-none sm:w-[88px]"
const LABEL = "line-clamp-2 text-xs leading-4 text-foreground/85 group-hover:text-brand"
const CIRCLE =
  "flex size-14 items-center justify-center overflow-hidden rounded-full ring-1 ring-border/70 transition group-hover:ring-brand/40 group-focus-visible:ring-3 group-focus-visible:ring-ring/50 sm:size-16"

/** "Danh mục sản phẩm" — round category icons in a scrollable row. */
export function CategoryStrip() {
  const categories = useCategories()

  return (
    <section>
      <SectionHeading title="Danh mục sản phẩm" />
      <ScrollRow
        label="Danh mục sản phẩm"
        contentClassName="gap-1 sm:gap-2"
        arrowClassName="top-7 sm:top-8 -translate-y-1/2"
      >
        <Link href="/khuyen-mai" className={ITEM}>
          <span className={`${CIRCLE} bg-red text-white`}>
            <ZapIcon className="size-7 fill-current" />
          </span>
          <span className={LABEL}>Flash Sale</span>
        </Link>
        {categories.map((category) => (
          <Link key={category.id} href={`/danh-muc/${category.slug}`} className={ITEM}>
            <span className={`${CIRCLE} bg-surface`}>
              <ProductImage src={category.icon} alt="" size={64} className="size-full object-cover" />
            </span>
            <span className={LABEL}>{category.name}</span>
          </Link>
        ))}
      </ScrollRow>
    </section>
  )
}
