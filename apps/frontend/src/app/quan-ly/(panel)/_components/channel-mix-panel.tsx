"use client"

import { useMemo } from "react"

import { Panel } from "@/components/admin/page-header"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { addDays, type ChannelSales, salesByChannel, selectOrders } from "@/lib/analytics"
import { formatNumber, formatPercent, formatVND } from "@/lib/format"
import { CHANNEL } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import type { Order, SalesChannel } from "@/types"

import { LegendKey, SLOT } from "./chart-kit"

/** A channel keeps its slot everywhere: in-store = slot 1, online = slot 2. */
const CHANNEL_COLOR: Record<SalesChannel, string> = { "in-store": SLOT[1], online: SLOT[2] }

/** Share of revenue and orders per sales channel over the last 7 days (today included). */
export function ChannelMixPanel({
  orders,
  today,
  className,
}: {
  /** Orders already limited to the store scope. */
  orders: Order[]
  /** Local midnight of today. */
  today: Date
  className?: string
}) {
  const rows = useMemo(
    () => salesByChannel(selectOrders(orders, { storeId: null }, { from: addDays(today, -6), to: addDays(today, 1) })),
    [orders, today],
  )
  const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0)
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)

  return (
    <Panel
      title="Kênh bán (7 ngày)"
      description="Tỷ trọng tại quầy và online, hôm nay tính đến hiện tại"
      className={cn("flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col justify-between gap-5"
    >
      {totalOrders === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Chưa có đơn hàng trong 7 ngày qua.</p>
      ) : (
        <>
          <ShareBar
            label="Doanh thu"
            total={formatVND(totalRevenue)}
            rows={rows}
            share={(r) => r.revenueShare}
            describe={(r) => `${formatPercent(r.revenueShare)} · ${formatVND(r.revenue)}`}
          />
          <ShareBar
            label="Số đơn"
            total={`${formatNumber(totalOrders)} đơn`}
            rows={rows}
            share={(r) => r.orderShare}
            describe={(r) => `${formatPercent(r.orderShare)} · ${formatNumber(r.orders)} đơn`}
          />
          <table className="w-full text-sm">
            <caption className="sr-only">Doanh thu và số đơn theo kênh bán, 7 ngày</caption>
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="pb-2 text-left font-medium">
                  Kênh
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Doanh thu
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Số đơn
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  TB/đơn
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.channel} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-medium text-foreground">
                    <LegendKey color={CHANNEL_COLOR[r.channel]} className="text-sm text-foreground">
                      {CHANNEL[r.channel]}
                    </LegendKey>
                  </th>
                  <td className="tabular py-2 pl-2 text-right text-foreground">{formatVND(r.revenue)}</td>
                  <td className="tabular py-2 pl-2 text-right text-foreground">{formatNumber(r.orders)}</td>
                  <td className="tabular py-2 pl-2 text-right text-foreground">{formatVND(r.aov)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  )
}

/** 100% bar with one segment per channel (2px surface gap, tooltip per segment) and its shares in text. */
function ShareBar({
  label,
  total,
  rows,
  share,
  describe,
}: {
  label: string
  total: string
  rows: ChannelSales[]
  share: (row: ChannelSales) => number
  describe: (row: ChannelSales) => string
}) {
  const visible = rows.filter((r) => share(r) > 0)
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold text-foreground">{total}</span>
      </div>
      <div className="flex h-3.5 w-full gap-0.5">
        {visible.map((r) => (
          <Tooltip key={r.channel}>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                aria-label={`${CHANNEL[r.channel]}: ${describe(r)}`}
                className="h-full min-w-1 outline-none first:rounded-l-[4px] last:rounded-r-[4px] hover:opacity-85 focus-visible:ring-3 focus-visible:ring-ring/50"
                style={{ width: `${share(r) * 100}%`, backgroundColor: CHANNEL_COLOR[r.channel] }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {CHANNEL[r.channel]}: {describe(r)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        {rows.map((r) => (
          <LegendKey key={r.channel} color={CHANNEL_COLOR[r.channel]}>
            {CHANNEL[r.channel]} <span className="font-semibold text-foreground">{formatPercent(share(r))}</span>
          </LegendKey>
        ))}
      </div>
    </div>
  )
}
