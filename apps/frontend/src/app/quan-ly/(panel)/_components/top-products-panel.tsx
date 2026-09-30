"use client"

import { PackageIcon } from "lucide-react"
import { useMemo } from "react"

import { Panel } from "@/components/admin/page-header"
import { ProductImage } from "@/components/shop/product-image"
import { addDays, type ProductLookup, salesByProduct, selectOrders } from "@/lib/analytics"
import { formatNumber, formatVND } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Order } from "@/types"

const LIMIT = 8

/** Best sellers by units over the last 7 days (today included). `columns={2}` splits the ranking in two lists. */
export function TopProductsPanel({
  orders,
  products,
  today,
  columns = 1,
  className,
}: {
  /** Orders already limited to the store scope. */
  orders: Order[]
  products: ProductLookup
  /** Local midnight of today. */
  today: Date
  columns?: 1 | 2
  className?: string
}) {
  const categories = useDb((s) => s.categories)
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name] as const)), [categories])
  const rows = useMemo(
    () =>
      salesByProduct(
        selectOrders(orders, { storeId: null }, { from: addDays(today, -6), to: addDays(today, 1) }),
        products,
        "quantity",
      ).slice(0, LIMIT),
    [orders, products, today],
  )

  return (
    <Panel
      title="Top sản phẩm bán chạy (7 ngày)"
      description="Xếp theo số lượng bán"
      className={className}
      bodyClassName="p-0"
    >
      {rows.length ? (
        <div className={cn(columns === 2 && "grid md:grid-cols-2 md:divide-x")}>
          {(columns === 2 ? [rows.slice(0, LIMIT / 2), rows.slice(LIMIT / 2)] : [rows]).map((chunk, c) =>
            chunk.length ? (
              <ol
                key={c}
                start={c === 0 ? 1 : LIMIT / 2 + 1}
                className={cn("divide-y", c > 0 && "border-t md:border-t-0")}
              >
                {chunk.map((row) => {
                  const rank = rows.indexOf(row) + 1
                  const product = products.get(row.productId)
                  return (
                    <li key={row.productId} className="flex items-center gap-3 px-4 py-2">
                      <span
                        className={cn(
                          "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          rank <= 3 ? "bg-brand-soft text-brand-dark" : "text-muted-foreground",
                        )}
                      >
                        {rank}
                      </span>
                      <ProductImage
                        src={product?.image}
                        alt={product?.name ?? "Sản phẩm"}
                        size={36}
                        className="size-9 shrink-0 rounded-lg bg-white ring-1 ring-border"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground" title={product?.name}>
                          {product?.name ?? "Sản phẩm đã xoá"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {product ? (categoryName.get(product.categoryId) ?? product.sku) : row.productId}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-sm font-semibold text-foreground">
                          {formatNumber(row.quantity)}{" "}
                          <span className="font-normal text-muted-foreground">{product?.unit ?? "sp"}</span>
                        </p>
                        <p className="tabular text-xs text-muted-foreground">{formatVND(row.revenue)}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : null,
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <PackageIcon className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">Chưa bán được sản phẩm nào trong 7 ngày qua.</p>
        </div>
      )}
    </Panel>
  )
}
