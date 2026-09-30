"use client"

import { PackageIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { Panel } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Customer, OrderStatus } from "@/types"

import { OrderList } from "./order-list"

const FILTERS: { id: string; label: string; statuses: OrderStatus[] | null }[] = [
  { id: "all", label: "Tất cả", statuses: null },
  { id: "active", label: "Đang xử lý", statuses: ["pending", "confirmed", "preparing", "delivering"] },
  { id: "completed", label: "Hoàn thành", statuses: ["completed"] },
  { id: "cancelled", label: "Đã huỷ", statuses: ["cancelled"] },
]

const PAGE_SIZE = 10

export function OrdersTab({ customer }: { customer: Customer }) {
  const orders = useDb((s) => s.orders)
  const [filterId, setFilterId] = useState("all")
  const [limit, setLimit] = useState(PAGE_SIZE)

  // Collections are stored newest first, so no sorting is needed.
  const mine = useMemo(() => orders.filter((o) => o.customerId === customer.id), [orders, customer.id])
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f.id,
          f.statuses ? mine.filter((o) => f.statuses!.includes(o.status)).length : mine.length,
        ]),
      ),
    [mine],
  )
  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0]
  const filtered = filter.statuses ? mine.filter((o) => filter.statuses!.includes(o.status)) : mine

  if (!mine.length) {
    return (
      <div className="flex flex-col items-center rounded-xl px-6 py-14 text-center ring-1 ring-border">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <PackageIcon className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-bold">Bạn chưa có đơn hàng nào</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Đặt món đầu tiên ngay hôm nay – cửa hàng gần bạn giao tới trong 24 phút.
        </p>
        <Button asChild className="mt-5 h-10 px-5">
          <Link href="/">Mua sắm ngay</Link>
        </Button>
      </div>
    )
  }

  return (
    <Panel
      title="Đơn hàng của tôi"
      description={`${mine.length} đơn gần nhất, mới nhất ở trên cùng`}
      bodyClassName="p-0"
    >
      <div
        className="no-scrollbar flex gap-2 overflow-x-auto border-b px-4 py-3"
        role="tablist"
        aria-label="Lọc đơn hàng"
      >
        {FILTERS.map((f) => {
          const active = f.id === filter.id
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setFilterId(f.id)
                setLimit(PAGE_SIZE)
              }}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap ring-1 transition",
                active ? "bg-brand text-white ring-brand" : "bg-white text-brand ring-brand/25 hover:bg-brand-soft",
              )}
            >
              {f.label}{" "}
              <span className={cn("tabular", active ? "text-white/80" : "text-muted-foreground")}>{counts[f.id]}</span>
            </button>
          )
        })}
      </div>

      {filtered.length ? (
        <OrderList orders={filtered.slice(0, limit)} />
      ) : (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Không có đơn nào trong mục này.</p>
      )}

      {filtered.length > limit ? (
        <div className="border-t p-3 text-center">
          <Button
            variant="ghost"
            className="text-brand hover:text-brand"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
          >
            Xem thêm {Math.min(PAGE_SIZE, filtered.length - limit)} đơn cũ hơn
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}
