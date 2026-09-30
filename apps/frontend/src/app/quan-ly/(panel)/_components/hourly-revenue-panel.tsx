"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Panel } from "@/components/admin/page-header"
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { addDays, hourlyRevenue } from "@/lib/analytics"
import { formatCompactVND, formatTime, formatVND } from "@/lib/format"
import type { Order } from "@/types"

import {
  AXIS,
  type ChartView,
  ChartTooltipCard,
  ChartViewToggle,
  GRID_STROKE,
  LegendKey,
  MiniTable,
  niceTicks,
  SLOT,
} from "./chart-kit"

const CHART_HEIGHT = 224

const config = {
  today: { label: "Hôm nay", color: SLOT[1] },
  average: { label: "Trung bình 7 ngày trước", color: SLOT[2] },
} satisfies ChartConfig

interface HourDatum {
  hour: number
  /** Null for hours that haven't started yet. */
  today: number | null
  average: number
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`

/** Today's revenue per hour against the average of the same hour over the previous 7 days. */
export function HourlyRevenuePanel({
  orders,
  today,
  now,
  className,
}: {
  /** Orders already limited to the store scope. */
  orders: Order[]
  /** Local midnight of today. */
  today: Date
  now: Date
  className?: string
}) {
  const [view, setView] = useState<ChartView>("chart")
  const currentHour = now.getHours()

  const todayHours = useMemo(() => hourlyRevenue(orders, today, 1), [orders, today])
  const averageHours = useMemo(() => hourlyRevenue(orders, addDays(today, -7), 7), [orders, today])

  const data = useMemo<HourDatum[]>(
    () =>
      todayHours.map((value, hour) => ({
        hour,
        today: hour <= currentHour ? value : null,
        average: averageHours[hour],
      })),
    [todayHours, averageHours, currentHour],
  )

  const ticks = niceTicks(Math.max(0, ...data.map((d) => Math.max(d.today ?? 0, d.average))))
  const peak = data.reduce<HourDatum | null>(
    (top, d) => (d.today !== null && d.today > 0 && (!top || d.today > (top.today ?? 0)) ? d : top),
    null,
  )

  return (
    <Panel
      title="Doanh thu theo giờ"
      description="Hôm nay so với trung bình cùng giờ của 7 ngày trước"
      actions={<ChartViewToggle value={view} onChange={setView} />}
      className={className}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendKey color={SLOT[1]} marker="line">
            Hôm nay (đến {formatTime(now)})
          </LegendKey>
          <LegendKey color={SLOT[2]} marker="line">
            Trung bình 7 ngày trước
          </LegendKey>
        </div>
        {peak ? (
          <span className="text-xs text-muted-foreground">
            Cao điểm hôm nay:{" "}
            <span className="font-medium text-foreground">
              {hourLabel(peak.hour)} · {formatVND(peak.today ?? 0)}
            </span>
          </span>
        ) : null}
      </div>

      {view === "chart" ? (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: CHART_HEIGHT }}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="hour" {...AXIS} interval={2} tickFormatter={(hour: number) => `${hour}h`} />
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
                const d = payload?.[0]?.payload as HourDatum | undefined
                if (!active || !d) return null
                const running = d.hour === currentHour
                return (
                  <ChartTooltipCard
                    title={`${hourLabel(d.hour)} – ${String(d.hour).padStart(2, "0")}:59${running ? ` (đến ${formatTime(now)})` : ""}`}
                    rows={[
                      {
                        key: "today",
                        label: "Hôm nay",
                        value: d.today === null ? "Chưa đến giờ" : formatVND(d.today),
                        color: SLOT[1],
                        marker: "line",
                      },
                      {
                        key: "average",
                        label: "TB 7 ngày trước",
                        value: formatVND(d.average),
                        color: SLOT[2],
                        marker: "line",
                      },
                    ]}
                  />
                )
              }}
            />
            <Line
              dataKey="average"
              type="monotone"
              stroke="var(--color-average)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-average)", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="today"
              type="monotone"
              stroke="var(--color-today)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === currentHour && props.cx !== undefined && props.cy !== undefined ? (
                  <circle
                    key="now"
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill="var(--color-today)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ) : (
                  <g key={props.index} />
                )
              }
              activeDot={{ r: 4, fill: "var(--color-today)", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      ) : (
        <MiniTable
          caption="Doanh thu theo giờ"
          height={CHART_HEIGHT}
          columns={[
            { key: "hour", header: "Giờ" },
            { key: "today", header: "Hôm nay", align: "right" },
            { key: "average", header: "TB 7 ngày trước", align: "right" },
          ]}
          rows={data.map((d) => ({
            key: String(d.hour),
            emphasis: d.hour === currentHour,
            cells: [
              `${hourLabel(d.hour)} – ${String(d.hour).padStart(2, "0")}:59`,
              d.today === null ? "—" : formatVND(d.today),
              formatVND(d.average),
            ],
          }))}
        />
      )}
    </Panel>
  )
}
