"use client"

import { CheckCircle2Icon, ChevronRightIcon, CircleAlertIcon, ShieldCheckIcon } from "lucide-react"

import { LogoMark } from "@/components/brand/logo"
import { StarCount } from "@/components/shop/star-rewards"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useKeepStatus } from "@/hooks/use-membership"
import { formatDate, formatVND } from "@/lib/format"
import { type KeepStatus, monthLabel, monthStart, nextTier, shiftMonth, TIER_ORDER, TIERS } from "@/lib/membership"
import { cn } from "@/lib/utils"
import { useNow } from "@/stores/hydration"
import type { Customer } from "@/types"

function millions(value: number) {
  if (!value) return "0 ₫"
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000)} triệu`
}

/** Position on a bar with the four tiers evenly spaced (thresholds are far apart: 1, 3, 8 triệu). */
function ladderPercent(spend: number) {
  const last = TIER_ORDER.length - 1
  for (let i = 0; i < last; i++) {
    const from = TIERS[TIER_ORDER[i]].minSpend
    const to = TIERS[TIER_ORDER[i + 1]].minSpend
    if (spend < to) return ((i + (spend - from) / (to - from)) / last) * 100
  }
  return 100
}

/** Tier card: accumulated spend toward the next tier, this month's keep-the-tier check and gold stars. */
export function MemberCard({ customer, onOpenTab }: { customer: Customer; onOpenTab: (tab: string) => void }) {
  const now = useNow(60_000)
  const keep = useKeepStatus(customer, now)
  if (!now || !keep) return <Skeleton className="h-72 w-full rounded-xl md:h-60" />

  const current = TIERS[customer.tier]
  const upgrade = nextTier(customer.tier)

  return (
    <section className="grid grid-cols-1 overflow-hidden rounded-xl bg-card ring-1 ring-border md:grid-cols-[300px_minmax(0,1fr)]">
      <div className={cn("relative flex min-h-48 flex-col justify-between overflow-hidden p-5", current.faceClassName)}>
        <span aria-hidden className="absolute -top-14 -right-12 size-48 rounded-full bg-white/50" />
        <span aria-hidden className="absolute -bottom-20 -left-10 size-44 rounded-full bg-white/40" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold tracking-wide text-foreground uppercase ring-1 ring-black/5">
            Thẻ thành viên
          </span>
          <LogoMark className="size-9 rounded-[7px] ring-2 ring-white" />
        </div>
        <div className="relative">
          <p className="text-[42px] leading-none font-black uppercase italic" style={{ fontStretch: "75%" }}>
            {current.label}
          </p>
          <button
            type="button"
            onClick={() => onOpenTab("sao-vang")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm text-foreground ring-1 ring-black/5 transition hover:bg-white/90"
          >
            <StarCount value={customer.stars} /> sao vàng
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Chi tiêu tích luỹ xét hạng</p>
            <p className="tabular text-2xl font-bold">{formatVND(customer.tierSpend)}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenTab("hang")}
            className="inline-flex items-center gap-0.5 text-sm font-medium text-brand hover:underline"
          >
            Điều kiện các hạng <ChevronRightIcon className="size-4" />
          </button>
        </div>

        <div>
          <div className="relative">
            <Progress
              value={ladderPercent(customer.tierSpend)}
              className="h-2.5"
              aria-label="Tiến độ chi tiêu tích luỹ lên hạng"
            />
            {TIER_ORDER.slice(1, -1).map((id, i) => (
              <span
                key={id}
                aria-hidden
                className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-border"
                style={{ left: `${((i + 1) / (TIER_ORDER.length - 1)) * 100}%` }}
              />
            ))}
          </div>
          <div className="relative mt-2 h-8 text-[11px] leading-4 text-muted-foreground">
            {TIER_ORDER.map((id, i) => {
              const last = i === TIER_ORDER.length - 1
              return (
                <span
                  key={id}
                  className={cn(
                    "absolute whitespace-nowrap",
                    i === 0 ? "left-0" : last ? "right-0 text-right" : "-translate-x-1/2 text-center",
                    id === customer.tier && "font-semibold text-foreground",
                  )}
                  style={i > 0 && !last ? { left: `${(i / (TIER_ORDER.length - 1)) * 100}%` } : undefined}
                >
                  {TIERS[id].label}
                  <br />
                  {millions(TIERS[id].minSpend)}
                </span>
              )
            })}
          </div>
        </div>

        <p className="rounded-lg bg-muted/70 px-3 py-2 text-sm leading-6">
          {upgrade ? (
            <>
              Chi tiêu thêm <span className="font-semibold">{formatVND(upgrade.minSpend - customer.tierSpend)}</span> để
              lên hạng <span className="font-semibold">{upgrade.label}</span> ngay lập tức.
            </>
          ) : (
            <>
              Bạn đang ở hạng cao nhất, giảm <span className="font-semibold">{formatVND(current.drinkVoucher)}</span>{" "}
              mỗi ly đồ uống.
            </>
          )}
        </p>

        <KeepPanel customer={customer} keep={keep} />
      </div>
    </section>
  )
}

function KeepPanel({ customer, keep }: { customer: Customer; keep: KeepStatus }) {
  const tier = TIERS[customer.tier]
  const nextMonth = shiftMonth(keep.month, 1)

  if (keep.exempt === "base-tier") {
    return (
      <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
        <ShieldCheckIcon className="mt-1 size-4 shrink-0 text-brand" />
        Hạng {tier.label} không cần duy trì. Lên hạng rồi thì mỗi tháng cần chi tối thiểu một mức để giữ hạng.
      </p>
    )
  }

  if (keep.exempt === "upgrade-month") {
    return (
      <p className="flex items-start gap-2 text-sm leading-6">
        <ShieldCheckIcon className="mt-1 size-4 shrink-0 text-fresh" />
        <span>
          Bạn vừa lên hạng {tier.label} trong tháng {monthLabel(keep.month)} nên tháng này không bị xét. Từ tháng{" "}
          {monthLabel(nextMonth)}, chi tối thiểu <span className="font-semibold">{formatVND(tier.keepPerMonth)}</span>{" "}
          mỗi tháng để giữ hạng.
        </span>
      </p>
    )
  }

  const done = keep.missing === 0
  return (
    <div
      className={cn(
        "rounded-lg p-3 ring-1",
        done ? "bg-fresh-soft/60 ring-fresh/20" : "bg-orange-soft/60 ring-orange/25",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">
          Giữ hạng {tier.label} tháng {monthLabel(keep.month)}
        </span>
        <span className="tabular text-muted-foreground">
          {formatVND(keep.spent)} / {formatVND(keep.required)}
        </span>
      </div>
      <Progress
        value={Math.min(100, (keep.spent / keep.required) * 100)}
        className={cn(
          "mt-2 h-1.5 bg-white",
          done ? "[&_[data-slot=progress-indicator]]:bg-fresh" : "[&_[data-slot=progress-indicator]]:bg-orange",
        )}
        aria-label="Tiến độ giữ hạng tháng này"
      />
      <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-5">
        {done ? (
          <>
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-fresh" />
            Đã đủ điều kiện giữ hạng {tier.label} sau đợt xét ngày {formatDate(monthStart(nextMonth))}.
          </>
        ) : (
          <>
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-orange" />
            <span>
              Chi thêm <span className="font-semibold">{formatVND(keep.missing)}</span> trong {keep.daysLeft} ngày còn
              lại để giữ hạng {tier.label}. Nếu không, từ {formatDate(monthStart(nextMonth))} bạn xuống hạng{" "}
              {keep.dropTo ? TIERS[keep.dropTo].label : ""}.
            </span>
          </>
        )}
      </p>
    </div>
  )
}
