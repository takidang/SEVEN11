"use client"

import { ShoppingBagIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { ProductRail, SectionHeading } from "@/components/shop/product-rail"
import { Button } from "@/components/ui/button"
import { useActiveProducts } from "@/hooks/use-catalog"
import { discountedProducts } from "@/lib/catalog"

export function EmptyCart() {
  const products = useActiveProducts()
  const discounted = useMemo(() => discountedProducts(products).slice(0, 16), [products])

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center rounded-xl px-6 py-12 text-center ring-1 ring-border md:py-16">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShoppingBagIcon className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold">Giỏ hàng của bạn đang trống</h1>
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
          Mở cửa 24 giờ, giao hàng 24 phút – chọn vài món yêu thích rồi quay lại đây để đặt hàng nhé.
        </p>
        <Button asChild className="mt-5 h-10 px-5">
          <Link href="/">Mua sắm ngay</Link>
        </Button>
      </div>

      {discounted.length ? (
        <section>
          <SectionHeading title="Đang giảm giá" href="/khuyen-mai" />
          <ProductRail products={discounted} />
        </section>
      ) : null}
    </div>
  )
}
