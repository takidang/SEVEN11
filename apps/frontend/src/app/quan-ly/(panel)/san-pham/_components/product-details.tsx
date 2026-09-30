"use client"

import { LockIcon } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { discountPercent, formatDate, formatPercent, formatVND } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/types"

import { StoreStockTable } from "./store-stock-table"

function Item({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm text-foreground", mono && "font-mono")}>{children}</dd>
    </div>
  )
}

/** Read-only product view for roles that can't edit the catalog (store managers). */
export function ProductDetails({
  product,
  categories,
  scopeStoreId,
}: {
  product: Product
  categories: Category[]
  scopeStoreId: string | null
}) {
  const category = categories.find((c) => c.id === product.categoryId)
  const subcategory = category?.subcategories.find((s) => s.id === product.subcategoryId)
  const margin = product.price > 0 ? (product.price - product.costPrice) / product.price : 0
  const discount = discountPercent(product.price, product.compareAtPrice)

  return (
    <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={product.isActive ? "fresh" : "neutral"}>
          {product.isActive ? "Đang bán" : "Ngừng bán"}
        </StatusBadge>
        {product.isNew ? <StatusBadge tone="brand">Sản phẩm mới</StatusBadge> : null}
        {product.ageRestricted ? <StatusBadge tone="neutral">Giới hạn 18+</StatusBadge> : null}
      </div>

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Giá bán</div>
          <div className="tabular mt-1 text-lg font-semibold text-foreground">{formatVND(product.price)}</div>
          {discount ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground line-through">{formatVND(product.compareAtPrice!)}</span>
              <span className="rounded bg-sale-soft px-1 font-semibold text-sale">-{discount}%</span>
            </div>
          ) : null}
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Giá vốn</div>
          <div className="tabular mt-1 text-lg font-semibold text-foreground">{formatVND(product.costPrice)}</div>
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Biên lợi nhuận</div>
          <div className={cn("tabular mt-1 text-lg font-semibold", margin < 0.2 ? "text-warning" : "text-foreground")}>
            {formatPercent(margin)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Lãi {formatVND(product.price - product.costPrice)} / {product.unit}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Thông tin sản phẩm</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Item label="Danh mục">{category?.name ?? "—"}</Item>
          <Item label="Nhóm hàng">{subcategory?.name ?? "—"}</Item>
          <Item label="Thương hiệu">{product.brand}</Item>
          <Item label="Xuất xứ">{product.origin}</Item>
          <Item label="Đơn vị tính">{product.unit}</Item>
          <Item label="Hạn dùng sau khi nhập">
            {product.shelfLifeDays ? `${product.shelfLifeDays} ngày` : "Dài hạn"}
          </Item>
          <Item label="Mã SKU" mono>
            {product.sku}
          </Item>
          <Item label="Mã vạch" mono>
            {product.barcode}
          </Item>
          <Item label="Ngày tạo">{formatDate(product.createdAt)}</Item>
        </dl>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Tồn kho theo cửa hàng</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Số lượng hiện có / định mức tối thiểu ở từng cửa hàng.</p>
        </div>
        <StoreStockTable productId={product.id} highlightStoreId={scopeStoreId} />
      </section>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="size-3.5" /> Chỉ quản trị chuỗi được sửa thông tin và giá sản phẩm.
      </p>
    </div>
  )
}
