"use client"

import { ClockIcon, MapPinIcon, PhoneIcon, UsersRoundIcon } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { formatNumber, formatPhone, formatVND, initials } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import type { Employee, Store } from "@/types"

import { RevenueSparkline } from "./revenue-sparkline"
import { compactMoney, type StoreMetrics } from "./store-metrics"

export function StoreCard({
  store,
  manager,
  staffCount,
  metrics,
  highlight,
  onOpen,
}: {
  store: Store
  manager?: Employee
  staffCount: number
  metrics: StoreMetrics
  /** Label shown when this is the store the viewer works at / is looking at. */
  highlight?: string
  onOpen: () => void
}) {
  const status = STORE_STATUS[store.status]
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl bg-card ring-1 ring-border transition-shadow hover:ring-brand/40",
        highlight && "ring-2 ring-brand hover:ring-brand",
      )}
    >
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-[15px] leading-snug font-semibold">
            <button
              type="button"
              onClick={onOpen}
              className="text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              <span className="tabular text-brand">{store.code}</span> – {store.name}
            </button>
          </h3>
          <StatusBadge tone={status.tone} className="shrink-0">
            {status.label}
          </StatusBadge>
        </div>
        {highlight ? (
          <span className="w-fit rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-dark">
            {highlight}
          </span>
        ) : null}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="mt-px size-3.5 shrink-0" />
          <span>
            {store.address}, {store.ward}, {store.province}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon className="size-3.5" /> {store.openHours}
          </span>
          <span className="tabular inline-flex items-center gap-1.5">
            <PhoneIcon className="size-3.5" /> {formatPhone(store.phone)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 border-t px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Hôm nay</p>
          <p className="tabular truncate text-base font-semibold">{formatVND(metrics.today.revenue)}</p>
          <p className="text-xs text-muted-foreground">{formatNumber(metrics.today.orders)} đơn</p>
        </div>
        <div className="relative min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-muted-foreground">7 ngày</p>
            <p className="tabular text-xs font-semibold" title={formatVND(metrics.weekRevenue)}>
              {compactMoney(metrics.weekRevenue)}
            </p>
          </div>
          <div className="relative z-10">
            <RevenueSparkline days={metrics.days} className="mt-1" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
        {manager ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar className="size-6">
              <AvatarFallback className="bg-brand-soft text-[10px] font-semibold text-brand-dark">
                {initials(manager.fullName)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{manager.fullName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Chưa có quản lý</span>
        )}
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <UsersRoundIcon className="size-3.5" /> {formatNumber(staffCount)} nhân viên
        </span>
      </div>
    </article>
  )
}
