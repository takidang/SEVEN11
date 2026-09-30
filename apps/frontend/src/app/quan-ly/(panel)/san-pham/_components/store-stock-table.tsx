"use client"

import { useMemo } from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { STOCK_STATE, stockState } from "@/hooks/use-stock"
import { formatNumber } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"

/** "Tồn kho theo cửa hàng": every store's quantity / minimum for one product. */
export function StoreStockTable({
  productId,
  highlightStoreId,
}: {
  productId: string
  highlightStoreId: string | null
}) {
  const stores = useDb((s) => s.stores)
  const stock = useDb((s) => s.stock)

  const rows = useMemo(() => {
    const levels = new Map(stock.filter((l) => l.productId === productId).map((l) => [l.storeId, l] as const))
    return stores.map((store) => ({ store, level: levels.get(store.id) }))
  }, [stores, stock, productId])

  const total = rows.reduce((sum, r) => sum + (r.level?.quantity ?? 0), 0)
  const needRestock = rows.filter((r) => stockState(r.level) !== "ok").length

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 pl-3 text-xs font-semibold text-muted-foreground">Cửa hàng</TableHead>
            <TableHead className="h-9 text-right text-xs font-semibold text-muted-foreground">Tồn</TableHead>
            <TableHead className="h-9 text-right text-xs font-semibold text-muted-foreground">Định mức</TableHead>
            <TableHead className="h-9 pr-3 text-xs font-semibold text-muted-foreground">Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ store, level }) => {
            const state = STOCK_STATE[stockState(level)]
            const current = store.id === highlightStoreId
            return (
              <TableRow key={store.id} className={cn(current && "bg-brand-soft/60 hover:bg-brand-soft/60")}>
                <TableCell className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{store.code}</span>
                    <span className="max-w-[180px] truncate">{store.name}</span>
                    {store.status !== "active" ? (
                      <span className="text-xs text-muted-foreground">({STORE_STATUS[store.status].label})</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="tabular py-2 text-right font-medium">
                  {formatNumber(level?.quantity ?? 0)}
                </TableCell>
                <TableCell className="tabular py-2 text-right text-muted-foreground">
                  {formatNumber(level?.minQuantity ?? 0)}
                </TableCell>
                <TableCell className="py-2 pr-3">
                  <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableCell className="py-2 pl-3 text-xs font-semibold text-muted-foreground">Toàn chuỗi</TableCell>
            <TableCell className="tabular py-2 text-right font-semibold">{formatNumber(total)}</TableCell>
            <TableCell />
            <TableCell className="py-2 pr-3 text-xs text-muted-foreground">
              {needRestock ? `${needRestock} cửa hàng cần bổ sung` : "Đủ hàng ở mọi cửa hàng"}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
