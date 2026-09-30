"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  type BarShapeProps,
  CartesianGrid,
  Rectangle,
  XAxis,
  type XAxisTickContentProps,
  YAxis,
} from "recharts"

import { Panel } from "@/components/admin/page-header"
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { addDays, dailySales, type ProductLookup } from "@/lib/analytics"
import { formatCompactVND, formatDate, formatNumber, formatTime, formatVND } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Order } from "@/types"

import {
  AXIS,
  type ChartView,
  ChartTooltipCard,
  ChartViewToggle,
  dayMonth,
  GRID_STROKE,
  MiniTable,
  niceTicks,
  SLOT,
  weekdayLong,
  weekdayShort,
} from "./chart-kit"

const CHART_HEIGHT = 264
const DAYS = 14

const config = { revenue: { label: "Doanh thu", color: SLOT[1] } } satisfies ChartConfig

interface DayDatum {
  key: string
  date: Date
  revenue: number
  orders: number
  isToday: boolean
}

/** Revenue per day for the last 14 days (today so far included and emphasised). */
export function RevenueTrendPanel({
  orders,
  products,
  today,
  now,
  className,
}: {
  /** Orders already limited to the store scope. */
  orders: Order[]
  products: ProductLookup
  /** Local midnight of today. */
  today: Date
  now: Date
  className?: string
}) {
  const [view, setView] = useState<ChartView>("chart")

  const data = useMemo<DayDatum[]>(() => {
    const rows = dailySales(orders, products, { from: addDays(today, -(DAYS - 1)), to: addDays(today, 1) })
    return rows.map((row, i) => ({
      key: String(i),
      date: row.date,
      revenue: row.revenue,
      orders: row.orders,
      isToday: i === rows.length - 1,
    }))
  }, [orders, products, today])

  const total = data.reduce((sum, d) => sum + d.revenue, 0)
  const fullDays = data.slice(0, -1)
  const average = fullDays.length ? fullDays.reduce((sum, d) => sum + d.revenue, 0) / fullDays.length : 0
  const best = fullDays.reduce<DayDatum | null>((top, d) => (!top || d.revenue > top.revenue ? d : top), null)
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.revenue)))

  const dayTitle = (d: DayDatum) =>
    d.isToday
      ? `Hôm nay, ${formatDate(d.date)} (đến ${formatTime(now)})`
      : `${weekdayLong(d.date)}, ${formatDate(d.date)}`

  return (
    <Panel
      title="Doanh thu 14 ngày gần nhất"
      description="Theo ngày, hôm nay tính đến hiện tại"
      actions={<ChartViewToggle value={view} onChange={setView} />}
      className={className}
    >
      {view === "chart" ? (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: CHART_HEIGHT }}>
          <BarChart data={data} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="key"
              {...AXIS}
              height={40}
              interval="preserveEnd"
              minTickGap={4}
              tickFormatter={(key: string) => dayMonth(data[Number(key)]?.date ?? today)}
              tick={({ x, y, payload }: XAxisTickContentProps) => {
                const d = data[Number(payload.value)]
                if (!d) return <g />
                const tone = d.isToday ? "fill-foreground font-semibold" : "fill-muted-foreground"
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text dy={8} textAnchor="middle" fontSize={12} className={tone}>
                      {dayMonth(d.date)}
                    </text>
                    <text dy={23} textAnchor="middle" fontSize={11} className={tone}>
                      {d.isToday ? "Hôm nay" : weekdayShort(d.date)}
                    </text>
                  </g>
                )
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
              cursor={{ fill: "var(--muted)", fillOpacity: 0.7 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as DayDatum | undefined
                if (!active || !d) return null
                return (
                  <ChartTooltipCard
                    title={dayTitle(d)}
                    rows={[
                      {
                        key: "revenue",
                        label: "Doanh thu",
                        value: formatVND(d.revenue),
                        color: SLOT[1],
                        marker: "rect",
                      },
                      { key: "orders", label: "Số đơn", value: formatNumber(d.orders) },
                    ]}
                  />
                )
              }}
            />
            <Bar
              dataKey="revenue"
              maxBarSize={24}
              isAnimationActive={false}
              activeBar
              shape={(props: BarShapeProps) => {
                const d = props.payload as DayDatum
                const { x, y, width, height } = props
                return (
                  <g>
                    <Rectangle
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      radius={[4, 4, 0, 0]}
                      fill="var(--color-revenue)"
                      fillOpacity={d.isToday || props.isActive ? 1 : 0.5}
                    />
                    {d.isToday && d.revenue > 0 ? (
                      <text
                        x={x + width / 2}
                        y={y - 7}
                        textAnchor="middle"
                        fontSize={12}
                        className="fill-foreground font-semibold"
                      >
                        {formatCompactVND(d.revenue)}
                      </text>
                    ) : null}
                  </g>
                )
              }}
            />
          </BarChart>
        </ChartContainer>
      ) : (
        <MiniTable
          caption="Doanh thu 14 ngày gần nhất"
          height={CHART_HEIGHT}
          columns={[
            { key: "date", header: "Ngày" },
            { key: "orders", header: "Số đơn", align: "right" },
            { key: "revenue", header: "Doanh thu", align: "right" },
          ]}
          rows={[...data].reverse().map((d) => ({
            key: d.key,
            emphasis: d.isToday,
            cells: [
              d.isToday ? `Hôm nay, ${dayMonth(d.date)}` : `${weekdayShort(d.date)}, ${formatDate(d.date)}`,
              formatNumber(d.orders),
              formatVND(d.revenue),
            ],
          }))}
        />
      )}

      <dl className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3">
        <Figure label={`Tổng ${DAYS} ngày`} value={formatVND(total)} />
        <Figure label={`Trung bình/ngày (${fullDays.length} ngày trước)`} value={formatVND(average)} />
        <Figure
          label="Ngày cao nhất"
          value={best ? formatVND(best.revenue) : "—"}
          note={best ? `${weekdayShort(best.date)}, ${dayMonth(best.date)}` : undefined}
        />
      </dl>
    </Panel>
  )
}

function Figure({
  label,
  value,
  note,
  className,
}: {
  label: string
  value: string
  note?: string
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-base font-semibold text-foreground">{value}</span>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </dd>
    </div>
  )
}
