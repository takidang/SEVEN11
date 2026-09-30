"use client"

import { CrownIcon, GiftIcon, TicketPercentIcon, ZapIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { usePromotions } from "@/hooks/use-catalog"
import { formatDate, formatTime, formatVND } from "@/lib/format"
import { DRINK_CATEGORY_IDS, MAX_DRINK_VOUCHERS_PER_ORDER, TIER_ORDER, TIERS } from "@/lib/membership"
import { effectiveStatus, isPromotionLive } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { useHydrated } from "@/stores/hydration"
import { useCurrentCustomer } from "@/stores/session"
import type { Product, Promotion } from "@/types"

import { promotionProducts, slotOpensLabel, slotWindow, useFlashSlots } from "../../../_components/flash-slots"
import { Bone } from "../../../_components/skeletons"

interface Offer {
  key: string
  icon: LucideIcon
  tone: string
  title: React.ReactNode
  detail: React.ReactNode
  action?: React.ReactNode
}

function appliesTo(promotion: Promotion, product: Product) {
  return promotionProducts(promotion, [product]).length > 0
}

/** Promotions that touch this product right now: flash-sale slots, buy X get Y, member drink vouchers, codes. */
export function ProductOffers({ product }: { product: Product }) {
  const flash = useFlashSlots()
  const promotions = usePromotions()
  const customer = useCurrentCustomer()
  const hydrated = useHydrated()

  const offers = useMemo<Offer[] | null>(() => {
    if (!flash) return null
    const { now } = flash
    const list: Offer[] = []

    for (const slot of flash.slots) {
      if (!appliesTo(slot.promotion, product)) continue
      list.push({
        key: slot.promotion.id,
        icon: ZapIcon,
        tone: "bg-red-soft text-red",
        title: `Flash sale ${slot.promotion.name}: giảm ${slot.promotion.value}%`,
        detail:
          slot.state === "live"
            ? `Đang diễn ra, kết thúc lúc ${formatTime(slot.end)}`
            : `Khung giờ ${slotWindow(slot)} mỗi ngày · ${slotOpensLabel(slot, now)}`,
      })
    }

    for (const promo of promotions) {
      if (promo.type !== "buy-x-get-y" || !promo.buyQuantity || !promo.getQuantity) continue
      if (!isPromotionLive(promo, now, "online") || !appliesTo(promo, product)) continue
      list.push({
        key: promo.id,
        icon: GiftIcon,
        tone: "bg-orange-soft text-orange",
        title: `Mua ${promo.buyQuantity} tặng ${promo.getQuantity}`,
        detail: `${promo.description} Áp dụng đến ${formatDate(promo.endsAt)}.`,
      })
    }

    const memberPromo = promotions.find((p) => p.type === "member-voucher" && isPromotionLive(p, now, "online"))
    if (memberPromo && DRINK_CATEGORY_IDS.includes(product.categoryId)) {
      const [lowest, highest] = [TIERS[TIER_ORDER[0]], TIERS[TIER_ORDER[TIER_ORDER.length - 1]]]
      const tier = hydrated && customer && memberPromo.tiers.includes(customer.tier) ? TIERS[customer.tier] : null
      list.push({
        key: memberPromo.id,
        icon: CrownIcon,
        tone: "bg-orange-soft text-orange",
        title: tier
          ? `Hạng ${tier.label} của bạn: giảm ${formatVND(tier.drinkVoucher)} mỗi ly`
          : `Thành viên giảm ${formatVND(lowest.drinkVoucher)} – ${formatVND(highest.drinkVoucher)} mỗi ly`,
        detail: tier
          ? `Tự động áp dụng khi đặt hàng, tối đa ${MAX_DRINK_VOUCHERS_PER_ORDER} ly mỗi đơn.`
          : `Theo hạng ${TIER_ORDER.map((t) => TIERS[t].label).join(", ")} · tối đa ${MAX_DRINK_VOUCHERS_PER_ORDER} ly mỗi đơn.`,
        action: (
          <Link href="/thanh-vien" className="text-sm font-medium whitespace-nowrap text-brand hover:underline">
            Tìm hiểu
          </Link>
        ),
      })
    }

    for (const promo of promotions) {
      if (
        !promo.code ||
        promo.ownerId ||
        !promo.channels.includes("online") ||
        effectiveStatus(promo, now) !== "active"
      )
        continue
      if (promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit) continue
      // Only codes aimed at this product or its category; storewide codes live on /khuyen-mai.
      if (!promo.productIds.includes(product.id) && !promo.categoryIds.includes(product.categoryId)) continue
      list.push({
        key: promo.id,
        icon: TicketPercentIcon,
        tone: "bg-brand-soft text-brand",
        title: (
          <>
            Nhập mã <span className="font-mono font-semibold">{promo.code}</span>
          </>
        ),
        detail: promo.description,
        action: (
          <Link href="/khuyen-mai" className="text-sm font-medium whitespace-nowrap text-brand hover:underline">
            Xem mã
          </Link>
        ),
      })
    }
    return list
  }, [flash, promotions, product, customer, hydrated])

  if (!offers) return <Bone className="h-28 w-full rounded-xl" />
  if (!offers.length) return null

  return (
    <section className="rounded-xl ring-1 ring-border">
      <h2 className="border-b px-4 py-3 text-[15px] font-semibold text-foreground">Ưu đãi áp dụng</h2>
      <ul className="divide-y">
        {offers.map((offer) => (
          <li key={offer.key} className="flex items-start gap-3 px-4 py-3">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", offer.tone)}>
              <offer.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-foreground">{offer.title}</p>
              <p className="mt-0.5 text-muted-foreground">{offer.detail}</p>
            </div>
            {offer.action ? <div className="shrink-0 pt-0.5">{offer.action}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
