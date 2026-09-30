"use client"

import { ClockIcon, MoonIcon, SunIcon, SunriseIcon, ZapIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Countdown } from "@/components/shop/countdown"
import { ProductCard } from "@/components/shop/product-card"
import { ProductGrid } from "@/components/shop/product-rail"
import { useProducts } from "@/hooks/use-catalog"
import { formatTime } from "@/lib/format"
import type { Tone } from "@/lib/order-status"
import { cn } from "@/lib/utils"

import { EmptyState } from "../../_components/empty-state"
import {
  type FlashSlot,
  type FlashSlotState,
  promotionProducts,
  slotOpensLabel,
  slotWindow,
} from "../../_components/flash-slots"

const STATE: Record<FlashSlotState, { label: string; tone: Tone }> = {
  ended: { label: "Đã kết thúc", tone: "neutral" },
  live: { label: "Đang diễn ra", tone: "danger" },
  upcoming: { label: "Sắp diễn ra", tone: "info" },
}

/** Morning / afternoon / evening icon for a slot. */
function SlotIcon({ slot, className }: { slot: FlashSlot; className?: string }) {
  const hour = slot.start.getHours()
  if (hour < 11) return <SunriseIcon className={className} />
  if (hour < 17) return <SunIcon className={className} />
  return <MoonIcon className={className} />
}

/** "2 giờ 15 phút" until `to`. */
function durationUntil(to: Date, now: Date) {
  const minutes = Math.max(1, Math.ceil((to.getTime() - now.getTime()) / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h ? `${h} giờ` : "", m ? `${m} phút` : ""].filter(Boolean).join(" ")
}

/** Today's flash-sale slots as a timeline; picking one shows its products. */
export function FlashTimeline({ slots, featured, now }: { slots: FlashSlot[]; featured: FlashSlot | null; now: Date }) {
  const products = useProducts()
  const [picked, setPicked] = useState<string | null>(null)
  const active = slots.find((s) => s.promotion.id === picked) ?? featured ?? slots[0] ?? null
  const promotion = active?.promotion
  const list = useMemo(() => (promotion ? promotionProducts(promotion, products) : []), [promotion, products])

  return (
    <section id="flash-sale" className="scroll-mt-32 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <ZapIcon className="size-5 fill-red text-red" />
            Flash sale hôm nay
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mỗi khung giờ giảm giá một nhóm sản phẩm, áp dụng cho đơn online và mua tại cửa hàng.
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ClockIcon className="size-4" />
          Bây giờ là <span className="tabular font-semibold text-foreground">{formatTime(now)}</span>
        </p>
      </div>

      {slots.length === 0 || !active ? (
        <EmptyState
          icon={ZapIcon}
          title="Hôm nay chưa có khung giờ flash sale"
          description="Các chương trình giá sốc sẽ được cập nhật tại đây, bạn quay lại sau nhé."
          className="rounded-xl bg-surface/60"
        />
      ) : (
        <>
          <ol className="grid gap-3 md:grid-cols-3" aria-label="Khung giờ flash sale">
            {slots.map((slot) => (
              <li key={slot.promotion.id} className="relative">
                <SlotCard
                  slot={slot}
                  now={now}
                  selected={slot.promotion.id === active.promotion.id}
                  onSelect={() => setPicked(slot.promotion.id)}
                />
              </li>
            ))}
          </ol>

          <div>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-base font-bold text-foreground">Sản phẩm khung giờ {active.promotion.name}</h3>
              <span className="text-sm text-muted-foreground">
                {list.length} sản phẩm · giảm {active.promotion.value}%
              </span>
            </div>
            {active.state !== "live" ? (
              <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
                {active.state === "upcoming"
                  ? `Giá flash sale áp dụng từ ${slotWindow(active)}. Bạn vẫn có thể mua với giá thường ngay bây giờ.`
                  : `Khung giờ hôm nay đã kết thúc${active.nextStart ? `, mở lại lúc ${formatTime(active.nextStart)} ngày mai` : ""}. Giá hiển thị là giá thường.`}
              </p>
            ) : null}
            {list.length ? (
              <ProductGrid>
                {list.map((product, i) => (
                  <ProductCard key={product.id} product={product} priority={i < 5} />
                ))}
              </ProductGrid>
            ) : (
              <EmptyState icon={ZapIcon} title="Khung giờ này tạm hết sản phẩm" className="rounded-xl bg-surface/60" />
            )}
          </div>
        </>
      )}
    </section>
  )
}

function SlotCard({
  slot,
  now,
  selected,
  onSelect,
}: {
  slot: FlashSlot
  now: Date
  selected: boolean
  onSelect: () => void
}) {
  const state = STATE[slot.state]
  const live = slot.state === "live"

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative flex h-full w-full flex-col rounded-xl bg-white p-4 text-left ring-1 transition outline-none hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "ring-2 ring-brand" : "ring-border",
        slot.state === "ended" && !selected && "bg-surface/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full",
            live
              ? "bg-red text-white"
              : slot.state === "upcoming"
                ? "bg-orange-soft text-orange"
                : "bg-muted text-muted-foreground",
          )}
        >
          <SlotIcon slot={slot} className="size-5" />
        </span>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      </div>
      <p className="tabular mt-3 text-sm font-semibold text-muted-foreground">{slotWindow(slot)}</p>
      <p className={cn("text-base font-bold", slot.state === "ended" ? "text-foreground/70" : "text-foreground")}>
        {slot.promotion.name}
        <span className="ml-2 rounded bg-sale-soft px-1.5 py-0.5 align-middle text-xs font-semibold text-sale">
          -{slot.promotion.value}%
        </span>
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{slot.promotion.description}</p>
      <div className="mt-auto pt-3 text-sm">
        {live ? (
          <Countdown endsAt={slot.end} prefix="Kết thúc sau" className="text-sm text-muted-foreground" />
        ) : slot.state === "upcoming" && slot.nextStart ? (
          <span className="text-muted-foreground">
            Bắt đầu sau <span className="font-semibold text-foreground">{durationUntil(slot.nextStart, now)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            {slot.nextStart ? `Mở lại: ${slotOpensLabel(slot, now, { compact: true })}` : "Đã kết thúc"}
          </span>
        )}
      </div>
    </button>
  )
}
