"use client"

import { ArrowRightIcon, ClockIcon, ZapIcon } from "lucide-react"
import Link from "next/link"
import { Fragment, useMemo } from "react"

import { useCategories, useProducts } from "@/hooks/use-catalog"
import { discountedProducts } from "@/lib/catalog"
import { formatCompactVND } from "@/lib/format"
import { TIER_ORDER, TIERS } from "@/lib/membership"
import { cn } from "@/lib/utils"
import { useNow } from "@/stores/hydration"
import type { MemberTier } from "@/types"

import { promotionProducts, slotOpensLabel, slotWindow, useFlashSlots } from "../flash-slots"
import { Headline } from "../headline"
import { type ArtPhoto, PhotoPlate, pickArtPhotos } from "../photo-plate"

const BANNER_FRAME =
  "group @container relative isolate block overflow-hidden rounded-2xl aspect-[16/11] sm:aspect-[16/10] xl:aspect-[16/9] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

/** Two campaign banners side by side (desktop) / swipeable (mobile), built in code — no hotlinked artwork. */
export function HeroBanners() {
  return (
    <section
      aria-label="Chương trình nổi bật"
      className="-mx-4 no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0"
    >
      <FlashSaleBanner className="w-[88%] shrink-0 snap-start md:w-auto" />
      <MemberBanner className="w-[88%] shrink-0 snap-start md:w-auto" />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Banner A — the flash-sale slot that is live now (or opens next)
// ---------------------------------------------------------------------------

function FlashSaleBanner({ className }: { className?: string }) {
  const flash = useFlashSlots()
  const products = useProducts()
  const categories = useCategories()
  const slot = flash?.featured ?? null
  const promotion = slot?.promotion

  const photos = useMemo(() => {
    const pool = promotion ? promotionProducts(promotion, products) : discountedProducts(products)
    return pickArtPhotos(pool, categories)
  }, [promotion, products, categories])

  return (
    <Link
      href="/khuyen-mai"
      aria-label={
        slot
          ? `Flash sale ${slot.promotion.name}: giảm ${slot.promotion.value}%, ${slotWindow(slot)}. Xem khuyến mãi`
          : "Xem flash sale và khuyến mãi"
      }
      className={cn(BANNER_FRAME, "bg-red text-white", className)}
    >
      {/* Sunburst + glow behind the plates */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "repeating-conic-gradient(from 0deg at 74% 50%, rgb(255 255 255 / 0.09) 0deg 7deg, transparent 7deg 14deg)",
        }}
      />
      <div
        aria-hidden
        className="absolute top-1/2 right-[2cqw] -z-10 size-[46cqw] -translate-y-1/2 rounded-full bg-orange/70 blur-2xl"
      />

      <div className="relative flex h-full w-[58%] flex-col p-[4.5cqw]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tracking-wide text-red uppercase @md:px-2.5 @md:py-1 @md:text-xs">
            <ZapIcon className="size-3.5 fill-current" />
            Flash sale
          </span>
          {slot ? (
            <span className="hidden text-sm font-semibold text-white/90 @md:inline">{slotWindow(slot)}</span>
          ) : null}
        </div>

        {flash ? (
          <>
            <Headline className="mt-[3cqw] text-[8.4cqw] text-balance drop-shadow-[0_2px_0_rgb(0_0_0_/_0.12)]">
              {slot ? slot.promotion.name : "Giá sốc mỗi ngày"}
            </Headline>
            <Headline
              as="span"
              className="mt-[2.5cqw] w-fit -rotate-3 rounded-md bg-sale-soft px-[1.6cqw] py-[0.6cqw] text-[6.4cqw] text-red"
            >
              {slot ? `Giảm ${slot.promotion.value}%` : "Mua là có quà"}
            </Headline>
            <div className="mt-auto flex flex-col items-start gap-[2.2cqw]">
              {slot?.state === "live" ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="hidden text-sm font-semibold @md:inline">Kết thúc sau</span>
                  <CountdownDigits endsAt={slot.end} />
                </div>
              ) : slot ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-white/30 @md:text-sm">
                  <ClockIcon className="size-4" />
                  <span className="@md:hidden">{slotOpensLabel(slot, flash.now, { compact: true })}</span>
                  <span className="hidden @md:inline">{slotOpensLabel(slot, flash.now)}</span>
                </span>
              ) : (
                <span className="text-xs font-semibold @md:text-sm">Săn deal giảm giá mỗi ngày</span>
              )}
              <span className="hidden items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-red transition group-hover:gap-2 @md:inline-flex">
                Săn deal ngay
                <ArrowRightIcon className="size-4" />
              </span>
            </div>
          </>
        ) : (
          <div className="mt-[3cqw] flex flex-1 flex-col gap-[2.5cqw]" aria-hidden>
            <div className="h-[8cqw] w-4/5 animate-pulse rounded-md bg-white/20" />
            <div className="h-[6cqw] w-1/2 animate-pulse rounded-md bg-white/20" />
            <div className="mt-auto h-[5cqw] w-3/5 animate-pulse rounded-full bg-white/20" />
          </div>
        )}
      </div>

      <PlateTrio photos={flash ? photos : []} badge={slot ? `-${slot.promotion.value}%` : null} />
    </Link>
  )
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** 01 : 22 : 33 in white boxes. */
function CountdownDigits({ endsAt }: { endsAt: Date }) {
  const now = useNow(1000)
  if (!now) return null
  const total = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000))
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
  return (
    <span className="flex items-center gap-1" role="timer">
      {parts.map((n, i) => (
        <Fragment key={i}>
          {i ? <span className="text-sm font-bold">:</span> : null}
          <span className="tabular min-w-7 rounded-md bg-white px-1 py-0.5 text-center text-sm font-bold text-red @md:text-base">
            {pad(n)}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

/** Three photos on plates, stacked on the right side of a banner. */
function PlateTrio({ photos, badge }: { photos: ArtPhoto[]; badge: string | null }) {
  const [big, second, third] = photos
  const plate = "absolute shadow-[0_10px_24px_-10px_rgb(0_0_0_/_0.45)] ring-[0.8cqw] ring-white/35"
  if (!big) {
    return (
      <div aria-hidden>
        <div className="absolute top-1/2 right-[6cqw] size-[30cqw] -translate-y-1/2 animate-pulse rounded-full bg-white/20" />
      </div>
    )
  }
  return (
    <div aria-hidden>
      {third ? (
        <PhotoPlate
          src={third.src}
          alt={third.alt}
          size={110}
          imageClassName={third.zoom}
          className={cn(plate, "top-[7%] right-[29cqw] size-[15cqw]")}
        />
      ) : null}
      <div className="absolute top-1/2 right-[5cqw] size-[31cqw] -translate-y-[44%]">
        <PhotoPlate
          src={big.src}
          alt={big.alt}
          size={220}
          priority
          imageClassName={big.zoom}
          className={cn(plate, "inset-0 size-full")}
        />
        {badge ? (
          <Headline
            as="span"
            className="absolute -top-[1cqw] -left-[1.5cqw] flex size-[11cqw] -rotate-12 items-center justify-center rounded-full bg-sale-soft text-[4.2cqw] text-red shadow-md"
          >
            {badge}
          </Headline>
        ) : null}
      </div>
      {second ? (
        <PhotoPlate
          src={second.src}
          alt={second.alt}
          size={140}
          imageClassName={second.zoom}
          className={cn(plate, "right-[30cqw] bottom-[7%] size-[19cqw]")}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Banner B — "Mua sắm – nâng hạng" member program
// ---------------------------------------------------------------------------

const TIER_TEXT: Record<MemberTier, string> = {
  bronze: "text-tier-bronze",
  silver: "text-tier-silver",
  gold: "text-tier-gold",
  diamond: "text-tier-diamond",
}

const STEP_HEIGHT: Record<MemberTier, string> = {
  bronze: "h-[15cqw]",
  silver: "h-[21cqw]",
  gold: "h-[27cqw]",
  diamond: "h-[33cqw]",
}

/** Drink photos that sit on the top (diamond) step (clean catalog shots). */
const MEMBER_PHOTO_IDS = ["p0014", "p0010"]

function MemberBanner({ className }: { className?: string }) {
  const products = useProducts()
  const cup = useMemo(
    () =>
      MEMBER_PHOTO_IDS.map((id) => products.find((p) => p.id === id)).find((p) => p?.isActive) ??
      products.find((p) => p.isActive && p.categoryId === "tra-sua"),
    [products],
  )

  return (
    <Link
      href="/thanh-vien"
      aria-label="Chương trình thành viên Mua sắm – nâng hạng"
      className={cn(BANNER_FRAME, "bg-orange text-white", className)}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 82% 12%, rgb(255 255 255 / 0.38), transparent 42%), radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--red) 35%, transparent), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-[10cqw] -left-[8cqw] -z-10 size-[42cqw] rounded-full border-[1.2cqw] border-white/15"
      />

      <div className="relative flex h-full w-[56%] flex-col p-[4.5cqw]">
        <span className="w-fit rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tracking-wide text-foreground uppercase @md:px-2.5 @md:py-1 @md:text-xs">
          Thành viên 7-Eleven
        </span>
        <Headline className="mt-[3cqw] text-[9.4cqw] drop-shadow-[0_3px_0_color-mix(in_srgb,var(--red)_55%,transparent)]">
          Mua sắm –<br />
          nâng hạng
        </Headline>
        <p className="mt-[2.4cqw] max-w-[40cqw] text-xs leading-snug font-medium text-white/95 @md:text-sm">
          Đủ mốc là lên hạng, voucher đồ uống đến -{formatCompactVND(TIERS.diamond.drinkVoucher).toUpperCase()}/ly
        </p>
        <span className="mt-auto hidden w-fit items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-foreground @md:inline-flex">
          Xem quyền lợi
          <ArrowRightIcon className="size-4" />
        </span>
      </div>

      {/* Ascending steps: bronze → silver → gold → diamond, a drink on the top step */}
      <div aria-hidden className="absolute right-[3.5cqw] bottom-0 flex items-end gap-[1cqw]">
        {TIER_ORDER.map((id) => {
          const tier = TIERS[id]
          return (
            <div key={id} className="relative flex w-[11cqw] flex-col items-center">
              {id === "diamond" && cup ? (
                <PhotoPlate
                  src={cup.image}
                  alt={cup.name}
                  size={120}
                  className="mb-[1.2cqw] size-[15cqw] shadow-[0_10px_24px_-10px_rgb(0_0_0_/_0.45)] ring-[0.8cqw] ring-white/40"
                />
              ) : null}
              <div
                className={cn(
                  "flex w-full flex-col items-center rounded-t-[1.6cqw] bg-white pt-[1.6cqw] shadow-[0_-6px_18px_-10px_rgb(0_0_0_/_0.35)]",
                  STEP_HEIGHT[id],
                )}
              >
                <span className={cn("text-[1.9cqw] font-bold whitespace-nowrap uppercase", TIER_TEXT[id])}>
                  {tier.label}
                </span>
                <Headline as="span" className="mt-[0.6cqw] text-[4.6cqw] text-foreground">
                  -{formatCompactVND(tier.drinkVoucher).toUpperCase()}
                </Headline>
                <span className="text-[2.1cqw] font-medium text-muted-foreground">mỗi ly</span>
              </div>
            </div>
          )
        })}
      </div>
    </Link>
  )
}
