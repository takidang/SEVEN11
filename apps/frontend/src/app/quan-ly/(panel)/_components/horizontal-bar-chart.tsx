"use client"

import { Bar, BarChart, LabelList, XAxis, YAxis, type YAxisTickContentProps } from "recharts"

import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

import { AXIS, ChartTooltipCard, fitLabel, SLOT } from "./chart-kit"

export interface HorizontalBarDatum {
  key: string
  label: string
  value: number
  /** Extra rows for the tooltip (the series value is always shown first). */
  details?: { label: string; value: string }[]
}

/**
 * Ranked horizontal bars for one series (slot 1, no legend): category labels on the left,
 * the value at each bar end, a tooltip per bar. Pass the data already sorted.
 */
export function HorizontalBarChart({
  data,
  seriesLabel,
  formatValue,
  formatBarLabel,
  labelWidth = 150,
  rowHeight = 34,
  className,
}: {
  data: HorizontalBarDatum[]
  /** Series name in the tooltip, e.g. "Doanh thu". */
  seriesLabel: string
  /** Full value for the tooltip. */
  formatValue: (value: number) => string
  /** Short value at the bar end. */
  formatBarLabel: (value: number) => string
  labelWidth?: number
  rowHeight?: number
  className?: string
}) {
  const isMobile = useIsMobile()
  const width = isMobile ? Math.min(labelWidth, 136) : labelWidth
  const config = { value: { label: seriesLabel, color: SLOT[1] } } satisfies ChartConfig
  const height = data.length * rowHeight + 8

  return (
    <ChartContainer config={config} className={cn("aspect-auto w-full", className)} style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }} barCategoryGap={0}>
        <XAxis type="number" dataKey="value" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="label"
          width={width}
          interval={0}
          {...AXIS}
          tick={({ x, y, payload }: YAxisTickContentProps) => (
            <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} className="fill-muted-foreground">
              <title>{String(payload.value)}</title>
              {fitLabel(String(payload.value), width - AXIS.tickMargin)}
            </text>
          )}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.7 }}
          content={({ active, payload }) => {
            const datum = payload?.[0]?.payload as HorizontalBarDatum | undefined
            if (!active || !datum) return null
            return (
              <ChartTooltipCard
                title={datum.label}
                rows={[
                  {
                    key: "value",
                    label: seriesLabel,
                    value: formatValue(datum.value),
                    color: SLOT[1],
                    marker: "rect",
                  },
                  ...(datum.details ?? []).map((d) => ({ key: d.label, label: d.label, value: d.value })),
                ]}
              />
            )
          }}
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          barSize={Math.min(16, rowHeight - 12)}
          radius={[0, 4, 4, 0]}
          activeBar={{ fillOpacity: 0.82 }}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="value"
            position="right"
            offset={8}
            fontSize={12}
            className="fill-foreground"
            formatter={(value) => formatBarLabel(Number(value))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
