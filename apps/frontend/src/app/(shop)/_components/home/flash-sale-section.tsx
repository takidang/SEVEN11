"use client"

import { ClockIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Countdown } from "@/components/shop/countdown"
import { ProductRail, SectionHeading } from "@/components/shop/product-rail"
import { useProducts } from "@/hooks/use-catalog"

import { type FlashSlot, promotionProducts, slotOpensLabel, useFlashSlots } from "../flash-slots"
import { Bone, ProductRailSkeleton } from "../skeletons"

/** Home "Flash Sale": one chip per daily slot, the live (or next) one preselected. */
export function FlashSaleSection() {
  const flash = useFlashSlots()
  const products = useProducts()
  const [picked, setPicked] = useState<string | null>(null)

  const slot = flash ? (flash.slots.find((s) => s.promotion.id === picked) ?? flash.featured ?? flash.slots[0]) : null
  const promotion = slot?.promotion
  const list = useMemo(() => (promotion ? promotionProducts(promotion, products) : []), [promotion, products])

  if (!flash) {
    return (
      <section aria-busy>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-bold text-foreground">Flash Sale</h2>
          <Bone className="h-7 w-28 rounded-full" />
          <Bone className="h-7 w-36 rounded-full" />
          <Bone className="h-7 w-20 rounded-full" />
        </div>
        <ProductRailSkeleton />
      </section>
    )
  }
  if (!slot) return null

  return (
    <section>
      <SectionHeading
        title="Flash Sale"
        href="/khuyen-mai"
        chips={flash.slots.map((s) => ({ id: s.promotion.id, label: s.promotion.name }))}
        activeChip={slot.promotion.id}
        onChipClick={setPicked}
      >
        <SlotStatus slot={slot} now={flash.now} />
      </SectionHeading>
      <ProductRail key={slot.promotion.id} products={list} />
    </section>
  )
}

function SlotStatus({ slot, now }: { slot: FlashSlot; now: Date }) {
  if (slot.state === "live") {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Countdown endsAt={slot.end} prefix="Kết thúc sau" className="text-sm" />
        <span className="hidden sm:inline">· Giảm {slot.promotion.value}%</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <ClockIcon className="size-4 text-orange" />
      {slotOpensLabel(slot, now)}
      <span className="hidden sm:inline">· Giảm {slot.promotion.value}%</span>
    </span>
  )
}
