"use client"

import { ChartColumnIcon, TableIcon } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/**
 * Small building blocks shared by the dashboard and report charts, following the
 * Charts rules in docs/design-system.md (validated slot order, text never in series
 * colour, values lead in tooltips, a table view next to every chart).
 */

/** Categorical slots, in the validated order. A series keeps its slot when filters change. */
export const SLOT = {
  1: "var(--chart-1)",
  2: "var(--chart-2)",
  3: "var(--chart-3)",
  4: "var(--chart-4)",
  5: "var(--chart-5)",
} as const

/** Axis defaults: no tick lines or axis rules, muted 12px labels (colour comes from ChartContainer). */
export const AXIS = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 12 } as const

/** Hairline, solid, recessive. */
export const GRID_STROKE = "var(--border)"

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]
const WEEKDAY_LONG = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]

/** "T4" — fixed labels, identical in every browser. */
export function weekdayShort(date: Date): string {
  return WEEKDAY_SHORT[date.getDay()]
}

/** "Thứ Tư" */
export function weekdayLong(date: Date): string {
  return WEEKDAY_LONG[date.getDay()]
}

/** "16/09" — built by hand: Intl's vi-VN day+month pattern differs between engines ("16-09"). */
export function dayMonth(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`
}

/**
 * Clean value-axis ticks from 0 (steps of 1, 2, 2.5 or 5 × 10ⁿ) with at most `maxIntervals`
 * intervals; the last tick is the axis maximum.
 */
export function niceTicks(max: number, maxIntervals = 5): number[] {
  if (!(max > 0)) return [0]
  const raw = max / maxIntervals
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude)
  const intervals = Math.max(1, Math.ceil(max / step - 1e-9))
  return Array.from({ length: intervals + 1 }, (_, i) => Math.round(i * step))
}

export interface TooltipRow {
  key: string
  label: React.ReactNode
  value: React.ReactNode
  /** Series colour for the key mark; omit for plain detail rows. */
  color?: string
  /** Line key for line series, square for bars/areas. */
  marker?: "line" | "rect"
}

/** Tooltip body: title, then rows where the value is the strong element and the label follows. */
export function ChartTooltipCard({ title, rows }: { title: React.ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <div className="font-medium text-foreground">{title}</div>
      <div className="grid gap-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            {row.color ? (
              <span
                aria-hidden
                className={cn("shrink-0", row.marker === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]")}
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular ml-auto pl-4 font-semibold text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Legend entry: a mark in the series colour beside plain text. */
export function LegendKey({
  color,
  marker = "rect",
  children,
  className,
}: {
  color: string
  marker?: "line" | "rect"
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span
        aria-hidden
        className={cn("shrink-0", marker === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-[3px]")}
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  )
}

export type ChartView = "chart" | "table"

/** Switch a panel between its chart and the table of the same numbers. */
export function ChartViewToggle({ value, onChange }: { value: ChartView; onChange: (value: ChartView) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as ChartView)
      }}
      aria-label="Kiểu hiển thị"
    >
      <ToggleGroupItem value="chart" aria-label="Biểu đồ" title="Biểu đồ">
        <ChartColumnIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label="Bảng số liệu" title="Bảng số liệu">
        <TableIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export interface MiniTableColumn {
  key: string
  header: string
  align?: "left" | "right"
}

export interface MiniTableRow {
  key: string
  cells: React.ReactNode[]
  /** Highlight the row (e.g. today). */
  emphasis?: boolean
}

/** Compact table view of a chart's numbers, scrolling inside the chart's own height. */
export function MiniTable({
  columns,
  rows,
  height,
  caption,
}: {
  columns: MiniTableColumn[]
  rows: MiniTableRow[]
  height: number
  caption: string
}) {
  return (
    <div className="overflow-auto rounded-lg ring-1 ring-border" style={{ height }}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "h-8 px-3 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground",
                  c.align === "right" && "text-right",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={cn("border-t", row.emphasis && "bg-brand-soft/60 font-medium")}>
              {row.cells.map((cell, i) => (
                <td
                  key={columns[i]?.key ?? i}
                  className={cn("px-3 py-1.5 whitespace-nowrap", columns[i]?.align === "right" && "tabular text-right")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Truncate a category label to roughly fit `width` px of 12px text. */
export function fitLabel(label: string, width: number): string {
  const max = Math.max(4, Math.floor(width / 6.6))
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label
}
