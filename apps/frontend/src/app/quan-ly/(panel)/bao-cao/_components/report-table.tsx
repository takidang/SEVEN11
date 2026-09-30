"use client"

import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, InboxIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import type { CsvCell, CsvSection } from "./csv"

export interface ReportColumn<T> {
  key: string
  header: string
  /** Header in the CSV file when it should say more (e.g. the unit). */
  csvHeader?: string
  align?: "left" | "right"
  cell: (row: T) => React.ReactNode
  /** Sort key, and the CSV value unless `csv` is given. */
  value: (row: T) => string | number
  csv?: (row: T) => CsvCell
  /** Totals row cell (shown when the spec has `footer`). */
  footer?: React.ReactNode
  csvFooter?: CsvCell
  sortable?: boolean
  className?: string
}

/** A report table: rendered on screen and exported to CSV from the same definition. */
export interface ReportTableSpec<T> {
  title: string
  columns: ReportColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  footer?: boolean
  emptyText?: string
}

export function tableToCsv<T>(spec: ReportTableSpec<T>): CsvSection {
  const rows: CsvCell[][] = spec.rows.map((row) => spec.columns.map((c) => (c.csv ? c.csv(row) : c.value(row))))
  if (spec.footer) rows.push(spec.columns.map((c) => c.csvFooter ?? ""))
  return { title: spec.title, header: spec.columns.map((c) => c.csvHeader ?? c.header), rows }
}

type Sort = { key: string; desc: boolean } | null

/** Back-office table look (same as DataTable) with sortable headers and an optional totals row. */
export function ReportTable<T>({ spec, className }: { spec: ReportTableSpec<T>; className?: string }) {
  const [sort, setSort] = useState<Sort>(null)

  const rows = useMemo(() => {
    const column = sort ? spec.columns.find((c) => c.key === sort.key) : undefined
    if (!sort || !column) return spec.rows
    return [...spec.rows].sort((a, b) => {
      const x = column.value(a)
      const y = column.value(b)
      const order =
        typeof x === "number" && typeof y === "number"
          ? x === y
            ? 0
            : x < y
              ? -1
              : 1
          : String(x).localeCompare(String(y), "vi")
      return sort.desc ? -order : order
    })
  }, [spec, sort])

  const toggle = (column: ReportColumn<T>) =>
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, desc: !current.desc }
        : { key: column.key, desc: column.align === "right" },
    )

  return (
    <Table className={className}>
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          {spec.columns.map((column) => {
            const sorted = sort?.key === column.key ? (sort.desc ? "desc" : "asc") : null
            const right = column.align === "right"
            return (
              <TableHead
                key={column.key}
                aria-sort={sorted === "desc" ? "descending" : sorted === "asc" ? "ascending" : undefined}
                className={cn(
                  "h-10 px-3 text-xs font-semibold text-muted-foreground first:pl-4 last:pr-4",
                  right && "text-right",
                  column.className,
                )}
              >
                {column.sortable === false ? (
                  column.header
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(column)}
                    className={cn("inline-flex items-center gap-1 hover:text-foreground", right && "flex-row-reverse")}
                  >
                    {column.header}
                    {sorted === "asc" ? (
                      <ArrowUpIcon className="size-3.5" />
                    ) : sorted === "desc" ? (
                      <ArrowDownIcon className="size-3.5" />
                    ) : (
                      <ArrowUpDownIcon className="size-3.5 opacity-40" />
                    )}
                  </button>
                )}
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={spec.rowKey(row)}>
              {spec.columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "px-3 py-2.5 first:pl-4 last:pr-4",
                    column.align === "right" && "tabular text-right",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={spec.columns.length} className="py-12">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <InboxIcon className="size-5" />
                </span>
                <p className="text-sm text-muted-foreground">{spec.emptyText ?? "Không có dữ liệu trong kỳ này"}</p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      {spec.footer && rows.length ? (
        <TableFooter className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {spec.columns.map((column) => (
              <TableCell
                key={column.key}
                className={cn(
                  "px-3 py-2.5 font-semibold text-foreground first:pl-4 last:pr-4",
                  column.align === "right" && "tabular text-right",
                  column.className,
                )}
              >
                {column.footer}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  )
}
