"use client"

import { ArrowRightIcon, InboxIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { Panel } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { formatNumber, formatRelative, formatVND } from "@/lib/format"
import { ORDER_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Order, OrderStatus } from "@/types"

const IN_PROGRESS: OrderStatus[] = ["pending", "confirmed", "preparing", "delivering"]

/**
 * The latest online orders that aren't finished yet. `wide` (full-width panel) lays each
 * order out on one line like a table row; otherwise two compact lines.
 */
export function LiveOrdersPanel({
  orders,
  now,
  showStore,
  wide = false,
  limit = 6,
  className,
}: {
  /** Orders already limited to the store scope (newest first). */
  orders: Order[]
  now: Date
  showStore: boolean
  wide?: boolean
  limit?: number
  className?: string
}) {
  const customers = useDb((s) => s.customers)
  const stores = useDb((s) => s.stores)
  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.fullName] as const)), [customers])
  const storeCode = useMemo(() => new Map(stores.map((s) => [s.id, s.code] as const)), [stores])
  const live = useMemo(() => orders.filter((o) => o.channel === "online" && IN_PROGRESS.includes(o.status)), [orders])
  const shown = live.slice(0, limit)

  const nameOf = (order: Order) =>
    (order.customerId ? customerName.get(order.customerId) : undefined) ?? order.delivery?.recipient ?? "Khách lẻ"

  return (
    <Panel
      title="Đơn online đang xử lý"
      description={live.length ? `${formatNumber(live.length)} đơn chưa hoàn thành, mới nhất trước` : "Mới nhất trước"}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/quan-ly/don-hang">
            Xem tất cả <ArrowRightIcon />
          </Link>
        </Button>
      }
      className={className}
      bodyClassName="p-0"
    >
      {shown.length ? (
        <ul className="divide-y">
          {shown.map((order) => {
            const status = ORDER_STATUS[order.status]
            const meta = [showStore ? `CH ${storeCode.get(order.storeId) ?? ""}` : null, nameOf(order)]
              .filter(Boolean)
              .join(" · ")
            return (
              <li key={order.id}>
                <Link
                  href={`/quan-ly/don-hang?ma=${encodeURIComponent(order.code)}`}
                  className={cn(
                    "block px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/60",
                    wide && "xl:grid xl:grid-cols-[10rem_minmax(0,1fr)_8rem_9rem_8rem] xl:items-center xl:gap-4",
                  )}
                >
                  {wide ? (
                    <>
                      <span className="hidden text-sm font-medium text-foreground xl:block">{order.code}</span>
                      <span className="hidden truncate text-sm text-muted-foreground xl:block">{meta}</span>
                      <span className="hidden text-sm text-muted-foreground xl:block">
                        {formatRelative(order.createdAt, now)}
                      </span>
                      <span className="hidden xl:block">
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </span>
                      <span className="tabular hidden text-right text-sm font-semibold text-foreground xl:block">
                        {formatVND(order.total)}
                      </span>
                    </>
                  ) : null}
                  <span className={cn("block", wide && "xl:hidden")}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-foreground">{order.code}</span>
                      <span className="tabular text-sm font-semibold text-foreground">{formatVND(order.total)}</span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-3">
                      <span className="truncate text-xs text-muted-foreground">
                        {formatRelative(order.createdAt, now)} · {meta}
                      </span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <InboxIcon className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">Không có đơn online nào đang xử lý.</p>
        </div>
      )}
    </Panel>
  )
}
