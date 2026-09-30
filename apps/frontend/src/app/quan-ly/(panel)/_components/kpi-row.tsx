"use client"

import { ClockIcon, PackageIcon, ReceiptTextIcon, ShoppingBasketIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { StatCard } from "@/components/admin/stat-card"
import {
  type ProductLookup,
  relativeChange,
  selectOrders,
  summarizeSales,
  todaySoFar,
  yesterdaySameTime,
} from "@/lib/analytics"
import { inventoryValue } from "@/lib/budget"
import { formatNumber, formatRelative, formatVND } from "@/lib/format"
import { useDb } from "@/stores/db"
import type { Order } from "@/types"

const SAME_TIME_YESTERDAY = "so với cùng giờ hôm qua"
const NO_ORDERS_YET = "Chưa có đơn nào hôm nay"

/**
 * Today so far vs yesterday up to the same time, plus the online orders waiting for a confirmation.
 * `orders` are already limited to the store scope.
 */
export function KpiRow({
  orders,
  products,
  storeId,
  now,
}: {
  orders: Order[]
  products: ProductLookup
  /** null = whole chain. */
  storeId: string | null
  now: Date
}) {
  const stock = useDb((s) => s.stock)
  const today = useMemo(
    () => summarizeSales(selectOrders(orders, { storeId: null }, todaySoFar(now)), products),
    [orders, products, now],
  )
  const yesterday = useMemo(
    () => summarizeSales(selectOrders(orders, { storeId: null }, yesterdaySameTime(now)), products),
    [orders, products, now],
  )
  const pending = useMemo(() => orders.filter((o) => o.channel === "online" && o.status === "pending"), [orders])

  // Money tied up in goods sitting on the shelves: what the chain paid for the stock it still holds.
  const inventory = useMemo(() => inventoryValue(stock, products, storeId), [stock, products, storeId])

  // Newest first, so the one waiting longest is last.
  const oldestPending = pending[pending.length - 1]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Doanh thu hôm nay"
        value={formatVND(today.revenue)}
        icon={WalletIcon}
        delta={relativeChange(today.revenue, yesterday.revenue)}
        deltaLabel={SAME_TIME_YESTERDAY}
        hint={today.orders ? "Cùng giờ hôm qua chưa có doanh thu" : NO_ORDERS_YET}
      />
      <StatCard
        label="Số đơn"
        value={formatNumber(today.orders)}
        icon={ReceiptTextIcon}
        delta={relativeChange(today.orders, yesterday.orders)}
        deltaLabel={SAME_TIME_YESTERDAY}
        hint={today.orders ? "Cùng giờ hôm qua chưa có đơn" : NO_ORDERS_YET}
      />
      <StatCard
        label="Giá trị trung bình/đơn"
        value={formatVND(today.aov)}
        icon={ShoppingBasketIcon}
        delta={today.orders ? relativeChange(today.aov, yesterday.aov) : null}
        deltaLabel={SAME_TIME_YESTERDAY}
        hint={today.orders ? "Cùng giờ hôm qua chưa có đơn" : NO_ORDERS_YET}
      />
      <Link
        href="/quan-ly/kho"
        className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <StatCard
          label="Vốn tồn kho"
          value={formatVND(inventory.cost)}
          icon={PackageIcon}
          className="h-full transition-shadow group-hover:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.25)] group-hover:ring-brand/30"
          hint={
            inventory.units ? (
              <span className="group-hover:text-foreground">
                {formatNumber(inventory.units)} sản phẩm · bán hết thu về {formatVND(inventory.retail)}
              </span>
            ) : (
              "Chưa có hàng trong kho"
            )
          }
        />
      </Link>
      <Link
        href="/quan-ly/don-hang?trang-thai=pending"
        className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <StatCard
          label="Đơn online chờ xử lý"
          value={formatNumber(pending.length)}
          icon={ClockIcon}
          className="h-full transition-shadow group-hover:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.25)] group-hover:ring-brand/30"
          hint={
            oldestPending ? (
              <span className="group-hover:text-foreground">
                Đơn chờ lâu nhất đặt {formatRelative(oldestPending.createdAt, now)}
              </span>
            ) : (
              "Không có đơn nào đang chờ xác nhận"
            )
          }
        />
      </Link>
    </div>
  )
}
