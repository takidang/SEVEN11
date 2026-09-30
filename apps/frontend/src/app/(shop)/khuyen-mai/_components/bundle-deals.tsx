"use client"

import { GiftIcon } from "lucide-react"
import { useMemo } from "react"

import { ProductRail } from "@/components/shop/product-rail"
import { usePromotions, useProducts } from "@/hooks/use-catalog"
import { formatDate } from "@/lib/format"
import { isPromotionLive } from "@/lib/pricing"

import { EmptyState } from "../../_components/empty-state"
import { promotionProducts } from "../../_components/flash-slots"
import { Headline } from "../../_components/headline"

/** "Mua X tặng Y" deals that are running online right now, each with its products. */
export function BundleDeals({ now }: { now: Date }) {
  const promotions = usePromotions()
  const products = useProducts()

  const deals = useMemo(
    () =>
      promotions
        .filter((p) => p.type === "buy-x-get-y" && p.buyQuantity && p.getQuantity && isPromotionLive(p, now, "online"))
        .map((promotion) => ({ promotion, products: promotionProducts(promotion, products) }))
        .filter((deal) => deal.products.length > 0),
    [promotions, products, now],
  )

  return (
    <section id="mua-kem-co-qua" className="scroll-mt-32 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <GiftIcon className="size-5 text-orange" />
          Mua kèm có quà
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Quà tặng được trừ thẳng vào giỏ hàng khi bạn chọn đủ số lượng cùng một sản phẩm.
        </p>
      </div>

      {deals.length ? (
        deals.map(({ promotion, products: list }) => (
          <div
            key={promotion.id}
            className="-mx-4 bg-orange-soft/60 px-4 py-4 sm:mx-0 sm:rounded-2xl sm:p-5 sm:ring-1 sm:ring-orange/15"
          >
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Headline
                as="span"
                className="rounded-lg bg-orange px-3 py-1 text-2xl text-white shadow-[0_3px_0_color-mix(in_srgb,var(--red)_45%,transparent)]"
              >
                Mua {promotion.buyQuantity} tặng {promotion.getQuantity}
              </Headline>
              <div className="min-w-0">
                <h3 className="font-bold text-foreground">{promotion.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {promotion.description} Áp dụng đến {formatDate(promotion.endsAt)}.
                </p>
              </div>
            </div>
            <ProductRail products={list} />
          </div>
        ))
      ) : (
        <EmptyState
          icon={GiftIcon}
          title="Chưa có chương trình mua kèm có quà"
          description="Các ưu đãi mua kèm mới sẽ xuất hiện tại đây."
          className="rounded-xl bg-surface/60"
        />
      )}
    </section>
  )
}
