"use client"

import { ArrowRightIcon, CrownIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { usePromotions } from "@/hooks/use-catalog"
import { formatNumber } from "@/lib/format"
import { MAX_DRINK_VOUCHERS_PER_ORDER, TIER_ORDER, TIERS } from "@/lib/membership"
import { isPromotionLive } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { useHydrated } from "@/stores/hydration"
import { useCurrentCustomer } from "@/stores/session"

import { Headline } from "../../_components/headline"

/** Member drink vouchers (per tier) with a way into the membership page. */
export function MemberVoucher({ now }: { now: Date }) {
  const promotions = usePromotions()
  const customer = useCurrentCustomer()
  const hydrated = useHydrated()
  const promo = useMemo(
    () => promotions.find((p) => p.type === "member-voucher" && isPromotionLive(p, now, "online")),
    [promotions, now],
  )
  if (!promo) return null
  const myTier = hydrated && customer ? customer.tier : null

  return (
    <section
      id="uu-dai-thanh-vien"
      className="relative isolate scroll-mt-32 overflow-hidden rounded-2xl bg-orange p-5 text-white sm:p-7"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ backgroundImage: "radial-gradient(circle at 90% 0%, rgb(255 255 255 / 0.35), transparent 45%)" }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <CrownIcon className="size-4" />
            Ưu đãi thành viên
          </p>
          <Headline as="h2" className="mt-2 text-3xl text-balance sm:text-4xl">
            Voucher đồ uống mỗi tháng
          </Headline>
          <p className="mt-3 text-sm text-white/95 sm:text-base">
            Giảm thẳng vào mỗi ly trà sữa, trà trái cây và cà phê pha tại cửa hàng, tối đa{" "}
            {MAX_DRINK_VOUCHERS_PER_ORDER} ly mỗi đơn. Voucher tự áp dụng khi bạn đăng nhập và đặt hàng.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="h-10 bg-white px-4 text-foreground hover:bg-white/90">
              <Link href="/thanh-vien">
                Xem chương trình thành viên
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 border-white/60 bg-transparent px-4 text-white hover:bg-white/15 hover:text-white"
            >
              <Link href="/danh-muc/tra-sua">Đặt đồ uống</Link>
            </Button>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-3">
          {TIER_ORDER.map((id) => {
            const tier = TIERS[id]
            const mine = myTier === id
            return (
              <li
                key={id}
                className={cn(
                  "relative flex flex-col items-center rounded-xl bg-white px-2 py-4 text-center text-foreground sm:px-3",
                  mine && "ring-4 ring-white/60",
                )}
              >
                {mine ? (
                  <span className="absolute -top-2.5 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                    Hạng của bạn
                  </span>
                ) : null}
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tier.className)}>
                  {tier.label}
                </span>
                <Headline as="span" className="mt-2 text-2xl sm:text-3xl">
                  -{formatNumber(tier.drinkVoucher)}
                  <span className="text-base"> ₫</span>
                </Headline>
                <span className="text-xs text-muted-foreground">mỗi ly</span>
                <span className="mt-2 text-xs font-medium text-foreground/80 sm:text-sm">
                  {tier.vouchersPerMonth} voucher/tháng
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
