"use client"

import { LandmarkIcon } from "lucide-react"
import { useMemo } from "react"

import { Panel } from "@/components/admin/page-header"
import { Progress } from "@/components/ui/progress"
import { buildBudget, capitalBreakdown, inventoryValue, monthProgress, totalBudget } from "@/lib/budget"
import { formatVND } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"

const monthLabel = (now: Date) => `tháng ${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`

/**
 * The chain as a company: share capital, and how much of this month's operating budget is gone.
 * Purchasing is measured from real purchase orders; the other lines accrue from the monthly rates.
 */
export function BudgetPanel({ storeId, now, className }: { storeId: string | null; now: Date; className?: string }) {
  const purchaseOrders = useDb((s) => s.purchaseOrders)
  const stores = useDb((s) => s.stores)
  const stock = useDb((s) => s.stock)
  const products = useDb((s) => s.products)

  const rows = useMemo(
    () => buildBudget(purchaseOrders, stores.length, storeId, now),
    [purchaseOrders, stores.length, storeId, now],
  )
  const total = totalBudget(rows)
  const elapsed = monthProgress(now)
  const capital = useMemo(() => {
    const lookup = new Map(products.map((p) => [p.id, p]))
    return capitalBreakdown(inventoryValue(stock, lookup, null).cost)
  }, [stock, products])

  return (
    <Panel
      title={`Ngân sách ${monthLabel(now)}`}
      description={
        storeId
          ? "Phần ngân sách chia cho cửa hàng này · đã qua " + Math.round(elapsed * 100) + "% tháng"
          : "Toàn chuỗi · đã qua " + Math.round(elapsed * 100) + "% tháng"
      }
      className={className}
      bodyClassName="space-y-4 p-4"
    >
      {storeId ? null : (
        <div className="rounded-lg bg-surface/70 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LandmarkIcon className="size-3.5" /> Vốn điều lệ đang nằm ở đâu
            </p>
            <p className="tabular text-lg leading-tight font-bold">{formatVND(capital.capital)}</p>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {[
              { label: "Mặt bằng, tủ kệ, thiết bị", value: capital.fixedAssets },
              { label: "Hàng hoá trong kho", value: capital.inventory },
              { label: "Tiền mặt & ngân hàng", value: capital.cash },
            ].map((item) => (
              <li key={item.label} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="tabular font-medium">{formatVND(item.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">Đã chi {Math.round(total.used * 100)}% ngân sách</span>
          <span className="tabular text-sm text-muted-foreground">
            {formatVND(total.spent)} / {formatVND(total.budget)}
          </span>
        </div>
        <Progress
          value={Math.min(100, total.used * 100)}
          className={cn("mt-2 h-2", total.used > elapsed + 0.1 && "[&_[data-slot=progress-indicator]]:bg-orange")}
          aria-label="Tiến độ dùng ngân sách tháng"
        />
      </div>

      <ul className="space-y-3">
        {rows.map((row) => {
          const over = row.used > 1
          return (
            <li key={row.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="font-medium">{row.label}</span>
                <span className={cn("tabular", over ? "font-semibold text-orange" : "text-muted-foreground")}>
                  {formatVND(row.spent)} / {formatVND(row.budget)}
                </span>
              </div>
              <Progress
                value={Math.min(100, row.used * 100)}
                className={cn("mt-1.5 h-1.5", over && "[&_[data-slot=progress-indicator]]:bg-orange")}
                aria-label={`Ngân sách ${row.label}`}
              />
              <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>
            </li>
          )
        })}
      </ul>

      <p className="text-xs leading-5 text-muted-foreground">
        Số liệu tài chính là giả định của nhóm cho một chuỗi 10 cửa hàng, không phải số thật của 7-Eleven.
      </p>
    </Panel>
  )
}
