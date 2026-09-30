"use client"

import { Area, AreaChart, YAxis } from "recharts"

import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { formatNumber, formatVND } from "@/lib/format"
import { cn } from "@/lib/utils"

import { dayLabel, type DayPoint } from "./store-metrics"

const config = { revenue: { label: "Doanh thu", color: "var(--chart-1)" } } satisfies ChartConfig

/** Tiny single-series revenue trend: no axes, no legend; the total is printed next to it by the caller. */
export function RevenueSparkline({ days, className }: { days: DayPoint[]; className?: string }) {
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-10 w-full", className)}>
      <AreaChart data={days} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
        <YAxis hide domain={[0, "dataMax"]} />
        <ChartTooltip
          cursor={false}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={{ zIndex: 20 }}
          content={({ active, payload }) => {
            const point = active ? (payload?.[0]?.payload as DayPoint | undefined) : undefined
            if (!point) return null
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md">
                <p className="font-medium">{dayLabel(point.date)}</p>
                <p className="tabular text-muted-foreground">
                  {formatVND(point.revenue)} · {formatNumber(point.orders)} đơn
                </p>
              </div>
            )
          }}
        />
        <Area
          dataKey="revenue"
          type="monotone"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          fill="var(--color-revenue)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
