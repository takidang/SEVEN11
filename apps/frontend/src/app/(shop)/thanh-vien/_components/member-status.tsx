"use client"

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CrownIcon,
  ShieldCheckIcon,
  StarIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { StarCount } from "@/components/shop/star-rewards"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useKeepStatus } from "@/hooks/use-membership"
import { formatDate, formatPhone, formatVND, initials } from "@/lib/format"
import { type KeepStatus, monthLabel, monthStart, nextTier, shiftMonth, TIERS } from "@/lib/membership"
import { spendToNextStar, STAR_REWARDS } from "@/lib/stars"
import { cn } from "@/lib/utils"
import { useDbReady, useHydrated, useNow } from "@/stores/hydration"
import { useCurrentCustomer } from "@/stores/session"
import type { Customer } from "@/types"

import { Bone } from "../../_components/skeletons"

export const SIGN_IN_HREF = "/dang-nhap?next=/tai-khoan"
export const SIGN_UP_HREF = "/dang-nhap?tab=dang-ky&next=/tai-khoan"
export const TIER_TAB_HREF = "/tai-khoan?tab=hang"
export const STARS_TAB_HREF = "/tai-khoan?tab=sao-vang"

/** The signed-in member's tier, this month's keep-the-tier progress and gold stars, or a sign-up prompt. */
export function MemberStatus() {
  const hydrated = useHydrated()
  const ready = useDbReady()
  const customer = useCurrentCustomer()
  const now = useNow(60_000)

  if (!hydrated || !ready || !now) {
    return (
      <div className="space-y-4 rounded-2xl p-5 ring-1 ring-border" aria-busy>
        <div className="flex items-center gap-3">
          <Bone className="size-12 rounded-full" />
          <div className="space-y-2">
            <Bone className="h-5 w-40" />
            <Bone className="h-4 w-28" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Bone key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-2xl bg-brand-soft p-5 md:flex-row md:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <CrownIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-foreground">Bạn đang ở hạng nào?</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Đăng nhập để xem hạng, chi tiêu tích luỹ, mức giữ hạng tháng này và số sao vàng của bạn. Chưa có tài khoản?
            Đăng ký miễn phí để nhận ngay hạng {TIERS.bronze.label} cùng gói quà khách mới.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
          <Button asChild className="h-10 px-4">
            <Link href={SIGN_UP_HREF}>Đăng ký miễn phí</Link>
          </Button>
          <Button asChild variant="outline" className="h-10 bg-white px-4">
            <Link href={SIGN_IN_HREF}>Đăng nhập</Link>
          </Button>
        </div>
      </section>
    )
  }

  return <SignedInStatus customer={customer} now={now} />
}

function SignedInStatus({ customer, now }: { customer: Customer; now: Date }) {
  const keep = useKeepStatus(customer, now)
  const tier = TIERS[customer.tier]

  return (
    <section aria-label="Hạng thành viên của bạn" className="overflow-hidden rounded-2xl bg-white ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-3 border-b bg-surface/70 px-5 py-4">
        <Avatar className="size-12">
          <AvatarFallback className="bg-brand text-base font-semibold text-white">
            {initials(customer.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-foreground">{customer.fullName}</h2>
          <p className="text-sm text-muted-foreground">{formatPhone(customer.phone)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", tier.className)}>Hạng {tier.label}</span>
          <span className="text-xs text-muted-foreground">Từ {formatDate(customer.tierSince)}</span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        <SpendTile customer={customer} />
        {keep ? <KeepTile customer={customer} keep={keep} /> : <Bone className="h-36 rounded-xl" />}
        <StarsTile customer={customer} className="md:col-span-2 xl:col-span-1" />
      </div>
    </section>
  )
}

function Tile({
  icon: Icon,
  iconClassName,
  title,
  className,
  children,
}: {
  icon: LucideIcon
  iconClassName?: string
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col rounded-xl p-4 ring-1 ring-border", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className={cn("size-4 text-brand", iconClassName)} />
        {title}
      </h3>
      {children}
    </div>
  )
}

function TileNote({ tone, children }: { tone: "good" | "warn" | "info"; children: React.ReactNode }) {
  const Icon = tone === "good" ? CheckCircle2Icon : tone === "warn" ? CircleAlertIcon : TrendingUpIcon
  return (
    <p className="mt-3 flex items-start gap-2 text-sm text-foreground">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "good" ? "text-fresh" : tone === "warn" ? "text-warning" : "text-brand",
        )}
      />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

function TileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-auto inline-flex w-fit items-center gap-1 pt-3 text-sm font-medium text-brand hover:underline"
    >
      {children}
      <ArrowRightIcon className="size-4" />
    </Link>
  )
}

/** Accumulated spend and the gap to the next tier. */
function SpendTile({ customer }: { customer: Customer }) {
  const next = nextTier(customer.tier)
  // Top tier: show the threshold that was reached instead of the next one.
  const milestone = next ?? TIERS[customer.tier]
  const spend = customer.tierSpend
  const percent = next ? Math.min(100, Math.round((spend / next.minSpend) * 100)) : 100

  return (
    <Tile icon={TrendingUpIcon} title="Chi tiêu tích luỹ">
      <p className="mt-2 text-2xl font-bold text-foreground">{formatVND(spend)}</p>
      <Progress
        value={percent}
        aria-label={next ? `Đạt ${percent}% mốc hạng ${next.label}` : "Đã đạt hạng cao nhất"}
        className="mt-3 h-2"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Mốc hạng {milestone.label}: {formatVND(milestone.minSpend)}
      </p>
      {next ? (
        <TileNote tone="info">
          Chi tiêu thêm <strong>{formatVND(Math.max(0, next.minSpend - spend))}</strong> để lên hạng {next.label}.
        </TileNote>
      ) : (
        <TileNote tone="good">Bạn đang ở hạng cao nhất. Giữ mức chi tiêu mỗi tháng để giữ hạng nhé.</TileNote>
      )}
      <TileLink href={TIER_TAB_HREF}>Chi tiết hạng của tôi</TileLink>
    </Tile>
  )
}

/** This month's spend against the tier's monthly minimum. */
function KeepTile({ customer, keep }: { customer: Customer; keep: KeepStatus }) {
  const tier = TIERS[customer.tier]
  const nextMonth = shiftMonth(keep.month, 1)
  const reviewDay = formatDate(monthStart(nextMonth))
  const lastDay = formatDate(new Date(monthStart(nextMonth).getTime() - 1))
  const checked = !keep.exempt && keep.required > 0
  const percent = checked ? Math.min(100, Math.round((keep.spent / keep.required) * 100)) : 0
  const dropTo = keep.dropTo ? TIERS[keep.dropTo] : null

  return (
    <Tile
      icon={ShieldCheckIcon}
      title={`${keep.exempt === "base-tier" ? "Chi tiêu" : "Giữ hạng"} tháng ${monthLabel(keep.month)}`}
    >
      <p className="mt-2 text-2xl font-bold text-foreground">
        {formatVND(keep.spent)}
        {checked ? (
          <span className="text-base font-medium text-muted-foreground"> / {formatVND(keep.required)}</span>
        ) : null}
      </p>
      {checked ? (
        <>
          <Progress value={percent} aria-label={`Đạt ${percent}% mức giữ hạng ${tier.label}`} className="mt-3 h-2" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Chi tiêu tháng này · {keep.daysLeft === 1 ? "hôm nay là ngày cuối tháng" : `còn ${keep.daysLeft} ngày`}
          </p>
          {keep.missing > 0 ? (
            <TileNote tone="warn">
              Chi thêm <strong>{formatVND(keep.missing)}</strong> đến hết {lastDay} để giữ hạng {tier.label}.
              {dropTo ? (
                <span className="text-muted-foreground">
                  {" "}
                  Nếu chưa đủ, ngày {reviewDay} bạn xuống hạng {dropTo.label}.
                </span>
              ) : null}
            </TileNote>
          ) : (
            <TileNote tone="good">
              Bạn đã chi đủ để giữ hạng {tier.label} sang tháng {monthLabel(nextMonth)}.
            </TileNote>
          )}
        </>
      ) : (
        <>
          <p className="mt-1.5 text-xs text-muted-foreground">Chi tiêu tháng này</p>
          <TileNote tone="good">
            {keep.exempt === "upgrade-month" ? (
              <>
                Bạn vừa lên hạng {tier.label} trong tháng này nên tháng {monthLabel(keep.month)} không bị xét giữ hạng.
                Từ tháng {monthLabel(nextMonth)}, chi tối thiểu {formatVND(tier.keepPerMonth)} mỗi tháng để giữ hạng.
              </>
            ) : (
              <>Hạng {tier.label} không cần chi tiêu tối thiểu mỗi tháng để giữ hạng.</>
            )}
          </TileNote>
        </>
      )}
    </Tile>
  )
}

/** Gold star balance and the nearest voucher it buys. */
function StarsTile({ customer, className }: { customer: Customer; className?: string }) {
  const best = STAR_REWARDS.filter((r) => r.stars <= customer.stars).at(-1)
  const upcoming = STAR_REWARDS.find((r) => r.stars > customer.stars)

  return (
    <Tile icon={StarIcon} iconClassName="fill-amber-400 text-amber-500" title="Sao vàng" className={className}>
      <StarCount value={customer.stars} className="mt-2 self-start text-2xl font-bold text-foreground" />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Chi tiêu thêm {formatVND(spendToNextStar(customer.starCarry))} để có thêm 1 sao
      </p>
      {best ? (
        <TileNote tone="good">
          Đủ sao để đổi voucher <strong>{formatVND(best.value)}</strong>.
        </TileNote>
      ) : upcoming ? (
        <TileNote tone="info">
          Còn {upcoming.stars - customer.stars} sao nữa để đổi voucher {formatVND(upcoming.value)}.
        </TileNote>
      ) : null}
      <TileLink href={STARS_TAB_HREF}>Đổi sao lấy voucher</TileLink>
    </Tile>
  )
}
