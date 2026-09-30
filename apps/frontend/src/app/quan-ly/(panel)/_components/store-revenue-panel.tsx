"use client"

import { useMemo } from "react"

import { Panel } from "@/components/admin/page-header"
import { addDays, type ProductLookup, salesByStore, selectOrders } from "@/lib/analytics"
import { formatCompactVND, formatNumber, formatVND } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { useDb } from "@/stores/db"
import type { Order } from "@/types"

import { type HorizontalBarDatum, HorizontalBarChart } from "./horizontal-bar-chart"

/** Chain scope only: revenue per store over the last 7 days, highest first. */
export function StoreRevenuePanel({
  orders,
  products,
  today,
  className,
}: {
  orders: Order[]
  products: ProductLookup
  /** Local midnight of today. */
  today: Date
  className?: string
}) {
  const stores = useDb((s) => s.stores)
  const data = useMemo<HorizontalBarDatum[]>(() => {
    const byId = new Map(stores.map((s) => [s.id, s] as const))
    const rows = salesByStore(
      selectOrders(orders, { storeId: null }, { from: addDays(today, -6), to: addDays(today, 1) }),
      products,
      stores,
    )
    return rows.map((row) => {
      const store = byId.get(row.storeId)
      return {
        key: row.storeId,
        label: store ? `${store.code} · ${store.name}` : row.storeId,
        value: row.revenue,
        details: [
          { label: "Số đơn", value: formatNumber(row.orders) },
          { label: "TB/đơn", value: formatVND(row.aov) },
          ...(store && store.status !== "active"
            ? [{ label: "Trạng thái", value: STORE_STATUS[store.status].label }]
            : []),
        ],
      }
    })
  }, [orders, products, stores, today])

  return (
    <Panel
      title="Doanh thu theo cửa hàng (7 ngày)"
      description="Từ cao đến thấp, hôm nay tính đến hiện tại"
      className={className}
    >
      <HorizontalBarChart
        data={data}
        seriesLabel="Doanh thu"
        formatValue={formatVND}
        formatBarLabel={formatCompactVND}
        labelWidth={184}
        rowHeight={38}
      />
    </Panel>
  )
}
