"use client"

import { CrownIcon, GiftIcon, TicketPercentIcon, ZapIcon } from "lucide-react"

import { useNow } from "@/stores/hydration"

import { useFlashSlots } from "../../_components/flash-slots"
import { Headline } from "../../_components/headline"
import { Bone, ProductGridSkeleton } from "../../_components/skeletons"
import { BundleDeals } from "./bundle-deals"
import { FlashTimeline } from "./flash-timeline"
import { MemberVoucher } from "./member-voucher"
import { PromoCodes } from "./promo-codes"

const SECTIONS = [
  { id: "flash-sale", label: "Flash sale hôm nay", icon: ZapIcon },
  { id: "ma-giam-gia", label: "Mã giảm giá", icon: TicketPercentIcon },
  { id: "mua-kem-co-qua", label: "Mua kèm có quà", icon: GiftIcon },
  { id: "uu-dai-thanh-vien", label: "Ưu đãi thành viên", icon: CrownIcon },
]

const longDate = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

export function PromotionsView() {
  const flash = useFlashSlots()

  return (
    <div className="space-y-10">
      <PromoHero />
      {flash ? (
        <>
          <FlashTimeline slots={flash.slots} featured={flash.featured} now={flash.now} />
          <PromoCodes now={flash.now} />
          <BundleDeals now={flash.now} />
          <MemberVoucher now={flash.now} />
        </>
      ) : (
        <div className="space-y-6" aria-busy>
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Bone key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <ProductGridSkeleton />
        </div>
      )}
    </div>
  )
}

function PromoHero() {
  const now = useNow(60_000)

  return (
    <header className="@container relative isolate overflow-hidden rounded-2xl bg-red px-5 py-6 text-white sm:px-8 sm:py-8">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "repeating-conic-gradient(from 0deg at 88% 120%, rgb(255 255 255 / 0.08) 0deg 6deg, transparent 6deg 12deg)",
        }}
      />
      <div aria-hidden className="absolute -right-10 -bottom-24 -z-10 size-72 rounded-full bg-orange/60 blur-3xl" />

      <p className="text-sm font-semibold text-white/90 first-letter:uppercase">
        {now ? longDate.format(now) : <span className="inline-block h-4 w-40 animate-pulse rounded bg-white/25" />}
      </p>
      <Headline as="h1" className="mt-2 text-[34px] text-balance sm:text-5xl">
        Flash sale &amp; ưu đãi
      </Headline>
      <p className="mt-3 max-w-2xl text-sm text-white/95 sm:text-base">
        Giá sốc theo khung giờ mỗi ngày, mã giảm giá cho đơn online, quà tặng khi mua kèm và voucher đồ uống cho thành
        viên.
      </p>
      <nav aria-label="Các mục ưu đãi" className="mt-5">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium ring-1 ring-white/30 transition hover:bg-white hover:text-red"
              >
                <section.icon className="size-4" />
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
