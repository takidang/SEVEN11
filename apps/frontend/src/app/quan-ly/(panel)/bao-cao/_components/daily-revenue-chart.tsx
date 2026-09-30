"use client"

import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import type { DailySales } from "@/lib/analytics"
import { formatCompactVND, formatDate, formatNumber, formatVND, toDateKey } from "@/lib/format"

import {
  AXIS,
  ChartTooltipCard,
  dayMonth,
  GRID_STROKE,
  niceTicks,
  SLOT,
  weekdayLong,
} from "../../_components/chart-kit"

const HEIGHT = 280

const config = { revenue: { label: "Doanh thu", color: SLOT[1] } } satisfies ChartConfig

interface Point {
  key: string
  date: Date
  revenue: number
  orders: number
  grossProfit: number
  isToday: boolean
}

/** Revenue per day of the period: one series (slot 1), 2px line over a 10% area, crosshair tooltip. */
export function DailyRevenueChart({ days, now }: { days: DailySales[]; now: Date }) {
  const todayKey = toDateKey(now)
  const data = useMemo<Point[]>(
    () =>
      days.map((d, i) => ({
        key: String(i),
        date: d.date,
        revenue: d.revenue,
        orders: d.orders,
        grossProfit: d.grossProfit,
        isToday: toDateKey(d.date) === todayKey,
      })),
    [days, todayKey],
  )
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.revenue)))
  // Markers only while points are few enough to stay apart.
  const dot =
    data.length <= 16
      ? { r: 4, fill: "var(--color-revenue)", fillOpacity: 1, stroke: "var(--card)", strokeWidth: 2 }
      : false

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: HEIGHT }}>
      <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="key"
          {...AXIS}
          interval="preserveStartEnd"
          minTickGap={18}
          tickFormatter={(key: string) => {
            const point = data[Number(key)]
            return point ? (point.isToday ? "Hôm nay" : dayMonth(point.date)) : ""
          }}
        />
        <YAxis
          {...AXIS}
          width={52}
          domain={[0, ticks[ticks.length - 1] || 1]}
          ticks={ticks}
          tickFormatter={(v: number) => formatCompactVND(v)}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as Point | undefined
            if (!active || !point) return null
            return (
              <ChartTooltipCard
                title={`${weekdayLong(point.date)}, ${formatDate(point.date)}${point.isToday ? " (hôm nay, đến hiện tại)" : ""}`}
                rows={[
                  {
                    key: "revenue",
                    label: "Doanh thu",
                    value: formatVND(point.revenue),
                    color: SLOT[1],
                    marker: "rect",
                  },
                  { key: "orders", label: "Số đơn", value: formatNumber(point.orders) },
                  { key: "profit", label: "Lợi nhuận gộp", value: formatVND(point.grossProfit) },
                ]}
              />
            )
          }}
        />
        <Area
          dataKey="revenue"
          type="monotone"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="var(--color-revenue)"
          fillOpacity={0.1}
          dot={dot}
          activeDot={{ r: 5, fill: "var(--color-revenue)", fillOpacity: 1, stroke: "var(--card)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
