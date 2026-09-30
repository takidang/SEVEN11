"use client"

import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/shop/product-image"
import { useProductMap } from "@/hooks/use-catalog"
import { formatDateTime, formatVND } from "@/lib/format"
import { CHANNEL, ORDER_STATUS } from "@/lib/order-status"
import { useDb } from "@/stores/db"
import type { Order } from "@/types"

/** Rows linking to /don-hang/<code>: thumbnails, code, date, item count, total, status. */
export function OrderList({ orders }: { orders: Order[] }) {
  const productMap = useProductMap()
  const stores = useDb((s) => s.stores)

  return (
    <ul className="divide-y">
      {orders.map((order) => {
        const status = ORDER_STATUS[order.status]
        const units = order.items.reduce((sum, it) => sum + it.quantity, 0)
        const store = stores.find((s) => s.id === order.storeId)
        const first = order.items[0]
        return (
          <li key={order.id}>
            <Link
              href={`/don-hang/${order.code}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            >
              <span className="relative hidden shrink-0 sm:block">
                <span className="block overflow-hidden rounded-lg bg-white ring-1 ring-border/80">
                  <ProductImage
                    src={first?.image ?? (first ? productMap.get(first.productId)?.image : undefined)}
                    alt={first?.name ?? order.code}
                    size={48}
                    className="size-12"
                  />
                </span>
                {order.items.length > 1 ? (
                  <span className="tabular absolute -right-1.5 -bottom-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/85 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    +{order.items.length - 1}
                  </span>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{order.code}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:truncate">
                  {formatDateTime(order.createdAt)} · {units} sản phẩm · {CHANNEL[order.channel]}
                  {store ? ` · CH ${store.code}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                <span className="tabular text-sm font-semibold">{formatVND(order.total)}</span>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
