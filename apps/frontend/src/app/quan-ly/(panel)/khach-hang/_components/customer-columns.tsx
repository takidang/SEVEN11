"use client"

import type { ColumnDef } from "@/components/admin/data-table"
import { StatusBadge } from "@/components/admin/status-badge"
import { StarCount } from "@/components/shop/star-rewards"
import { TierBadge } from "@/components/shop/tier-ladder"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { formatDate, formatNumber, formatPhone, formatVND, initials } from "@/lib/format"
import { type KeepStatus, nextTier, TIER_ORDER, TIERS } from "@/lib/membership"
import type { Tone } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import type { Customer, MemberTier } from "@/types"

/** A table row: the member and where they stand on keeping the tier this month. */
export interface CustomerRow {
  customer: Customer
  keep: KeepStatus
}

/** Progress bar filled with the colour of the tier it is heading to. */
export const TIER_BAR: Record<MemberTier, string> = {
  bronze: "*:data-[slot=progress-indicator]:bg-tier-bronze",
  silver: "*:data-[slot=progress-indicator]:bg-tier-silver",
  gold: "*:data-[slot=progress-indicator]:bg-tier-gold",
  diamond: "*:data-[slot=progress-indicator]:bg-tier-diamond",
}

/**
 * Accumulated spend toward the next tier, counted from the current tier's threshold (a drop
 * resets `tierSpend` to that threshold, so the bar starts empty again). `next` is null at the top.
 */
export function tierProgress(customer: Pick<Customer, "tier" | "tierSpend">) {
  const next = nextTier(customer.tier)
  if (!next) return { next: null, ratio: 1, missing: 0 }
  const from = TIERS[customer.tier].minSpend
  const ratio = Math.min(1, Math.max(0, (customer.tierSpend - from) / (next.minSpend - from)))
  return { next, ratio, missing: Math.max(0, next.minSpend - customer.tierSpend) }
}

/** Checked this month and still short of the monthly minimum: drops a tier on the 1st unless they spend more. */
export function isAtRisk(keep: KeepStatus) {
  return !keep.exempt && keep.missing > 0
}

/** This month's keep-the-tier state as a badge: đủ điều kiện · thiếu X ₫ · miễn xét. */
export function keepBadge(keep: KeepStatus): { tone: Tone; label: string } {
  if (keep.exempt) return { tone: "neutral", label: "Miễn xét" }
  if (keep.missing > 0) return { tone: "orange", label: `Thiếu ${formatVND(keep.missing)}` }
  return { tone: "fresh", label: "Đủ điều kiện" }
}

export function CustomerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-dark">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

function TierSpendCell({ customer }: { customer: Customer }) {
  const { next, ratio } = tierProgress(customer)
  const percent = Math.round(ratio * 100)
  return (
    <div className="flex flex-col items-end gap-1">
      <span>{formatVND(customer.tierSpend)}</span>
      <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
        {next ? `${percent}% tới ${next.label}` : "Hạng cao nhất"}
        <Progress
          value={percent}
          className={cn("h-1 w-14", TIER_BAR[next?.id ?? customer.tier])}
          aria-label={next ? `Tiến độ lên hạng ${next.label}` : "Đã ở hạng cao nhất"}
        />
      </span>
    </div>
  )
}

function KeepCell({ keep }: { keep: KeepStatus }) {
  const badge = keepBadge(keep)
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="whitespace-nowrap">
        {keep.exempt ? (
          formatVND(keep.spent)
        ) : (
          <>
            {formatNumber(keep.spent)}
            <span className="text-muted-foreground"> / {formatVND(keep.required)}</span>
          </>
        )}
      </span>
      <StatusBadge tone={badge.tone} className="h-5 px-2 text-[11px]">
        {badge.label}
      </StatusBadge>
    </div>
  )
}

export const customerColumns: ColumnDef<CustomerRow, unknown>[] = [
  {
    id: "name",
    accessorFn: (r) => r.customer.fullName,
    header: "Khách hàng",
    sortingFn: (a, b) => a.original.customer.fullName.localeCompare(b.original.customer.fullName, "vi"),
    cell: ({ row }) => (
      <div className="flex min-w-44 items-center gap-2.5">
        <CustomerAvatar name={row.original.customer.fullName} />
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.original.customer.fullName}</div>
          <div className="tabular text-xs text-muted-foreground">{formatPhone(row.original.customer.phone)}</div>
        </div>
      </div>
    ),
  },
  {
    id: "tier",
    accessorFn: (r) => TIER_ORDER.indexOf(r.customer.tier),
    header: "Hạng",
    cell: ({ row }) => <TierBadge tier={row.original.customer.tier} className="whitespace-nowrap" />,
  },
  {
    id: "tierSpend",
    accessorFn: (r) => r.customer.tierSpend,
    header: "Chi tiêu tích luỹ",
    meta: { align: "right" },
    cell: ({ row }) => <TierSpendCell customer={row.original.customer} />,
  },
  {
    id: "monthSpend",
    accessorFn: (r) => r.keep.spent,
    header: "Giữ hạng tháng này",
    meta: { align: "right" },
    cell: ({ row }) => <KeepCell keep={row.original.keep} />,
  },
  {
    id: "stars",
    accessorFn: (r) => r.customer.stars,
    header: "Sao vàng",
    meta: { align: "right" },
    cell: ({ row }) => <StarCount value={row.original.customer.stars} className="font-normal" />,
  },
  {
    id: "totalSpent",
    accessorFn: (r) => r.customer.totalSpent,
    header: "Tổng chi tiêu",
    meta: { align: "right" },
    cell: ({ row }) => formatVND(row.original.customer.totalSpent),
  },
  {
    id: "orderCount",
    accessorFn: (r) => r.customer.orderCount,
    header: "Số đơn",
    meta: { align: "right" },
    cell: ({ row }) => formatNumber(row.original.customer.orderCount),
  },
  {
    id: "joinedAt",
    accessorFn: (r) => r.customer.joinedAt,
    header: "Ngày tham gia",
    meta: { align: "right" },
    cell: ({ row }) => formatDate(row.original.customer.joinedAt),
  },
]
