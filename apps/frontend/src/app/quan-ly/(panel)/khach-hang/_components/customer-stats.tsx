"use client"

import { AwardIcon, StarIcon, TrendingDownIcon, UsersIcon } from "lucide-react"
import { useMemo } from "react"

import { StatCard } from "@/components/admin/stat-card"
import { formatDate, formatNumber, formatPercent } from "@/lib/format"
import { monthKey, monthLabel, monthStart, shiftMonth, TIER_ORDER, TIERS } from "@/lib/membership"
import { STAR_REWARDS } from "@/lib/stars"
import type { MemberTier } from "@/types"

import { type CustomerRow, isAtRisk } from "./customer-columns"

const DAY = 86_400_000

/** Fewest stars any reward costs. */
const MIN_REWARD_STARS = Math.min(...STAR_REWARDS.map((r) => r.stars))

/** KPI row of the customers page. `rows` is already limited to the store scope. */
export function CustomerStats({
  rows,
  now,
  storeCode,
}: {
  rows: CustomerRow[]
  now: Date
  /** Set when the list is limited to members who bought at one store. */
  storeCode?: string
}) {
  const stats = useMemo(() => {
    const byTier: Record<MemberTier, number> = { bronze: 0, silver: 0, gold: 0, diamond: 0 }
    const since = new Date(now.getTime() - 30 * DAY)
    let joined = 0
    let atRisk = 0
    let stars = 0
    let canRedeem = 0
    for (const { customer, keep } of rows) {
      byTier[customer.tier]++
      if (new Date(customer.joinedAt) >= since) joined++
      if (isAtRisk(keep)) atRisk++
      stars += customer.stars
      if (customer.stars >= MIN_REWARD_STARS) canRedeem++
    }
    return { byTier, joined, atRisk, stars, canRedeem }
  }, [rows, now])

  const total = rows.length
  const month = monthKey(now)
  const reviewDay = monthStart(shiftMonth(month, 1))

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={storeCode ? `Khách của cửa hàng ${storeCode}` : "Tổng thành viên"}
        value={formatNumber(total)}
        icon={UsersIcon}
        hint={`${formatNumber(stats.joined)} thành viên mới trong 30 ngày`}
      />

      {/* Members per tier: one series, so every bar uses chart slot 1; the track is 100% of members. */}
      <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-border">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Theo hạng thành viên</span>
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <AwardIcon className="size-4" />
          </span>
        </div>
        <ul className="grid gap-1.5">
          {TIER_ORDER.map((tier) => {
            const count = stats.byTier[tier]
            const share = count / Math.max(1, total)
            return (
              <li key={tier} className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground">{TIERS[tier].label}</span>
                <span className="block h-1.5 rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-chart-1" style={{ width: `${share * 100}%` }} />
                </span>
                <span className="tabular text-right whitespace-nowrap">
                  <span className="font-semibold text-foreground">{formatNumber(count)}</span>
                  <span className="text-muted-foreground"> · {formatPercent(share, 0)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <StatCard
        label="Nguy cơ xuống hạng"
        value={formatNumber(stats.atRisk)}
        icon={TrendingDownIcon}
        hint={`Chưa đủ mức giữ hạng tháng ${monthLabel(month)}, xét ngày ${formatDate(reviewDay)}`}
      />

      <StatCard
        label="Sao vàng chưa dùng"
        value={formatNumber(stats.stars)}
        icon={StarIcon}
        hint={`${formatNumber(stats.canRedeem)} thành viên đủ ${MIN_REWARD_STARS} sao để đổi voucher`}
      />
    </div>
  )
}
