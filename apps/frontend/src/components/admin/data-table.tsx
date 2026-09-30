"use client"

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, InboxIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export type { ColumnDef } from "@tanstack/react-table"

/**
 * The back-office table: sortable headers, client-side pagination, row click
 * (mouse or Enter/Space), an empty state. Filter the `data` before passing it in
 * (search/filters live in the page toolbar, above the table).
 *
 * Paging: editing rows in place (new array, same number of rows) keeps the current
 * page; when the number of rows changes (a filter, a search) it goes back to page 1.
 * Pass `getRowId` when rows can be re-ordered so React keeps row identity.
 *
 * Column meta:
 *   meta: { align: "right" }   → right-align numbers (they also get tabular figures)
 *   meta: { className: "w-24" } → extra classes on header + cells
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: "left" | "right" | "center"
    className?: string
  }
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 20,
  onRowClick,
  emptyTitle = "Không có dữ liệu",
  emptyDescription,
  initialSorting = [],
  className,
  rowClassName,
  getRowId,
}: {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  pageSize?: number
  onRowClick?: (row: TData) => void
  emptyTitle?: string
  emptyDescription?: string
  initialSorting?: SortingState
  className?: string
  rowClassName?: (row: TData) => string | undefined
  getRowId?: (row: TData) => string
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })
  const [rowCount, setRowCount] = useState(data.length)
  if (rowCount !== data.length) {
    // The result set changed (filter/search): start again from the first page.
    setRowCount(data.length)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }
  const pageCount = Math.max(1, Math.ceil(data.length / pagination.pageSize))
  const pageIndex = Math.min(pagination.pageIndex, pageCount - 1)

  // TanStack Table returns non-memoizable functions; the React Compiler is off in this project.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize: pagination.pageSize } },
    onSortingChange: (updater) => {
      // A new sort order starts from the first page.
      setSorting(updater)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    autoResetPageIndex: false,
  })

  const total = data.length
  const from = total === 0 ? 0 : pageIndex * pagination.pageSize + 1
  const to = Math.min(total, (pageIndex + 1) * pagination.pageSize)

  return (
    <div className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-border", className)}>
      <Table>
        <TableHeader className="bg-muted/50">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta
                const sortable = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-10 text-xs font-semibold text-muted-foreground",
                      meta?.align === "right" && "text-right",
                      meta?.align === "center" && "text-center",
                      meta?.className,
                    )}
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          meta?.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUpIcon className="size-3.5" />
                        ) : sorted === "desc" ? (
                          <ArrowDownIcon className="size-3.5" />
                        ) : (
                          <ArrowUpDownIcon className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.target !== event.currentTarget) return
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          onRowClick(row.original)
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  onRowClick &&
                    "cursor-pointer outline-none focus-visible:bg-muted/60 focus-visible:shadow-[inset_0_0_0_2px_var(--color-ring)]",
                  rowClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-2.5",
                        meta?.align === "right" && "tabular text-right",
                        meta?.align === "center" && "text-center",
                        meta?.className,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-14">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <InboxIcon className="size-5" />
                  </span>
                  <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
                  {emptyDescription ? (
                    <p className="max-w-sm text-xs text-muted-foreground">{emptyDescription}</p>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {total > pagination.pageSize ? (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            {formatNumber(from)}–{formatNumber(to)} / {formatNumber(total)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Trang trước"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="tabular px-2 text-muted-foreground">
              {pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Trang sau"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
