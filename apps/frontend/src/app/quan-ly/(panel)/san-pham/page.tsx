"use client"

import {
  BadgePercentIcon,
  PackageCheckIcon,
  PackageIcon,
  PackageMinusIcon,
  PackageXIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"
import { toast } from "sonner"

import { type ColumnDef, DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Toggle } from "@/components/ui/toggle"
import { useCategories, useProducts } from "@/hooks/use-catalog"
import { searchProducts } from "@/lib/catalog"
import { formatNumber, formatPercent, formatVND, normalizeText } from "@/lib/format"
import { canManage } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useCurrentStaff } from "@/stores/session"
import type { Category, Product, Subcategory } from "@/types"

import { ProductCell } from "@/components/admin/product-cell"
import { ProductSheet } from "./_components/product-sheet"
import { replaceQuery } from "@/lib/query"
import { type ScopedStock, StockBadge, useScopedStock } from "@/components/admin/scoped-stock"
import { ResultCount, SearchInput, Toolbar } from "@/components/admin/toolbar"

interface ProductRow {
  product: Product
  category?: Category
  subcategory?: Subcategory
  stock?: ScopedStock
  chain: boolean
  margin: number
}

type StatusFilter = "all" | "active" | "inactive"

const LOW_MARGIN = 0.2

const rowKey = (row: ProductRow) => row.product.id

function ActiveSwitch({ product }: { product: Product }) {
  return (
    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <Switch
        checked={product.isActive}
        aria-label={product.isActive ? `Ngừng bán ${product.name}` : `Mở bán ${product.name}`}
        onCheckedChange={(checked) => {
          useDb.getState().setProductActive(product.id, checked)
          toast.success(checked ? "Đã mở bán sản phẩm" : "Đã ngừng bán sản phẩm", { description: product.name })
        }}
      />
      <span className={cn("text-xs", product.isActive ? "text-foreground" : "text-muted-foreground")}>
        {product.isActive ? "Đang bán" : "Ngừng bán"}
      </span>
    </div>
  )
}

function buildColumns(canEdit: boolean): ColumnDef<ProductRow, unknown>[] {
  return [
    {
      id: "name",
      header: "Sản phẩm",
      accessorFn: (row) => row.product.name,
      cell: ({ row }) => <ProductCell product={row.original.product} />,
      meta: { className: "pl-4 min-w-[260px]" },
    },
    {
      id: "category",
      header: "Danh mục",
      accessorFn: (row) => row.category?.name ?? "",
      cell: ({ row }) => (
        <div className="max-w-[190px] leading-tight">
          <div className="truncate">{row.original.category?.name ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">› {row.original.subcategory?.name ?? "—"}</div>
        </div>
      ),
    },
    {
      id: "price",
      header: "Giá bán",
      accessorFn: (row) => row.product.price,
      cell: ({ row }) => {
        const { price, compareAtPrice } = row.original.product
        return (
          <div className="leading-tight">
            <div className="font-medium">{formatVND(price)}</div>
            {compareAtPrice && compareAtPrice > price ? (
              <div className="text-xs text-muted-foreground line-through">{formatVND(compareAtPrice)}</div>
            ) : null}
          </div>
        )
      },
      meta: { align: "right" },
    },
    {
      id: "costPrice",
      header: "Giá vốn",
      accessorFn: (row) => row.product.costPrice,
      cell: ({ row }) => <span className="text-muted-foreground">{formatVND(row.original.product.costPrice)}</span>,
      meta: { align: "right" },
    },
    {
      id: "margin",
      header: "Biên lợi nhuận",
      accessorFn: (row) => row.margin,
      cell: ({ row }) =>
        row.original.margin < LOW_MARGIN ? (
          <span className="inline-flex items-center gap-1 font-medium text-warning" title="Biên lợi nhuận dưới 20%">
            <TriangleAlertIcon className="size-3.5" />
            {formatPercent(row.original.margin)}
          </span>
        ) : (
          formatPercent(row.original.margin)
        ),
      meta: { align: "right" },
    },
    {
      id: "stock",
      header: "Tồn",
      accessorFn: (row) => row.stock?.quantity ?? 0,
      cell: ({ row }) => (
        <div className={cn("flex justify-end", row.original.chain ? "flex-col items-end gap-1" : "items-center gap-2")}>
          {row.original.chain ? (
            <span className="font-medium">{formatNumber(row.original.stock?.quantity ?? 0)}</span>
          ) : null}
          <StockBadge stock={row.original.stock} chain={row.original.chain} hideOk />
          {row.original.chain ? null : (
            <span className="min-w-8 font-medium">{formatNumber(row.original.stock?.quantity ?? 0)}</span>
          )}
        </div>
      ),
      meta: { align: "right" },
    },
    {
      id: "status",
      header: "Trạng thái",
      enableSorting: false,
      cell: ({ row }) =>
        canEdit ? (
          <ActiveSwitch product={row.original.product} />
        ) : (
          <StatusBadge tone={row.original.product.isActive ? "fresh" : "neutral"}>
            {row.original.product.isActive ? "Đang bán" : "Ngừng bán"}
          </StatusBadge>
        ),
      meta: { className: "pr-4 w-[130px]" },
    },
  ]
}

function ProductsView() {
  const staff = useCurrentStaff()
  const canEdit = !!staff && canManage(staff.role, "products")
  const { storeId } = useStoreScope()
  const products = useProducts()
  const categories = useCategories()
  const stores = useDb((s) => s.stores)
  const stock = useScopedStock(storeId)
  const params = useSearchParams()

  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [onSale, setOnSale] = useState(false)
  const [creating, setCreating] = useState(false)

  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.sortOrder - b.sortOrder), [categories])
  const store = stores.find((s) => s.id === storeId)
  const scopeLabel = store ? `Cửa hàng ${store.code}` : "Toàn chuỗi"

  const rows = useMemo<ProductRow[]>(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c] as const))
    return products.map((product) => {
      const category = categoryMap.get(product.categoryId)
      return {
        product,
        category,
        subcategory: category?.subcategories.find((s) => s.id === product.subcategoryId),
        stock: stock.get(product.id),
        chain: !storeId,
        margin: product.price > 0 ? (product.price - product.costPrice) / product.price : 0,
      }
    })
  }, [products, categories, stock, storeId])

  const filtered = useMemo(() => {
    let list = rows
    const q = query.trim()
    if (q) {
      const matched = new Set(searchProducts(products, q, { includeInactive: true }).map((p) => p.id))
      const code = normalizeText(q)
      list = list.filter(
        (r) => matched.has(r.product.id) || r.product.sku.toLowerCase().includes(code) || r.product.barcode.includes(q),
      )
    }
    if (categoryId !== "all") list = list.filter((r) => r.product.categoryId === categoryId)
    if (status !== "all") list = list.filter((r) => r.product.isActive === (status === "active"))
    if (onSale) list = list.filter((r) => !!r.product.compareAtPrice && r.product.compareAtPrice > r.product.price)
    return list
  }, [rows, products, query, categoryId, status, onSale])

  const stats = useMemo(() => {
    let active = 0
    let low = 0
    let out = 0
    for (const r of rows) {
      if (!r.product.isActive) continue
      active++
      if (r.stock?.state === "low") low++
      else if (!r.stock || r.stock.state === "out") out++
    }
    return { total: rows.length, active, low, out }
  }, [rows])

  const columns = useMemo(() => buildColumns(canEdit), [canEdit])

  const code = params.get("ma")
  const selected = code ? (products.find((p) => p.sku === code || p.barcode === code || p.id === code) ?? null) : null
  // Keep the last product while the sheet animates closed.
  const [shown, setShown] = useState<Product | null>(selected)
  if (selected && selected !== shown) setShown(selected)

  const filtersActive = !!query.trim() || categoryId !== "all" || status !== "all" || onSale

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sản phẩm"
        description={
          store
            ? `Danh mục dùng chung toàn chuỗi · tồn kho tại cửa hàng ${store.code} – ${store.name}`
            : `Danh mục dùng chung toàn chuỗi · tồn kho cộng dồn ${stores.length} cửa hàng`
        }
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> Thêm sản phẩm
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tổng sản phẩm"
          value={formatNumber(stats.total)}
          icon={PackageIcon}
          hint={`${categories.length} danh mục`}
        />
        <StatCard
          label="Đang bán"
          value={formatNumber(stats.active)}
          icon={PackageCheckIcon}
          hint={stats.total - stats.active ? `${stats.total - stats.active} sản phẩm ngừng bán` : "Tất cả đang mở bán"}
        />
        <StatCard
          label="Sắp hết hàng"
          value={formatNumber(stats.low)}
          icon={PackageMinusIcon}
          hint={storeId ? `Tại ${scopeLabel.toLowerCase()}, chạm định mức` : "Chạm định mức ở ít nhất 1 cửa hàng"}
        />
        <StatCard
          label="Hết hàng"
          value={formatNumber(stats.out)}
          icon={PackageXIcon}
          hint={storeId ? `Tại ${scopeLabel.toLowerCase()}` : "Hết ở ít nhất 1 cửa hàng"}
        />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm tên, SKU hoặc mã vạch" />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full bg-card sm:w-[210px]" aria-label="Lọc theo danh mục">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {sortedCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[calc(50%-4px)] bg-card sm:w-[150px]" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="active">Đang bán</SelectItem>
            <SelectItem value="inactive">Ngừng bán</SelectItem>
          </SelectContent>
        </Select>
        <Toggle
          variant="outline"
          pressed={onSale}
          onPressedChange={setOnSale}
          className="w-[calc(50%-4px)] bg-card data-[state=on]:border-brand/40 data-[state=on]:bg-brand-soft data-[state=on]:text-brand sm:w-auto"
        >
          <BadgePercentIcon /> Đang giảm giá
        </Toggle>
        <ResultCount>
          {filtersActive
            ? `${formatNumber(filtered.length)} / ${formatNumber(rows.length)} sản phẩm`
            : `${formatNumber(rows.length)} sản phẩm`}
        </ResultCount>
      </Toolbar>

      <DataTable
        data={filtered}
        columns={columns}
        getRowId={rowKey}
        onRowClick={(row) => replaceQuery({ ma: row.product.sku })}
        rowClassName={(row) => (row.product.isActive ? undefined : "bg-muted/30 text-muted-foreground")}
        emptyTitle="Không tìm thấy sản phẩm"
        emptyDescription="Thử từ khoá khác hoặc bỏ bớt bộ lọc danh mục, trạng thái."
      />

      <ProductSheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) replaceQuery({ ma: null })
        }}
        product={shown}
        canEdit={canEdit}
        categories={sortedCategories}
        scopeStoreId={storeId}
      />

      {canEdit ? (
        <ProductSheet
          open={creating}
          onOpenChange={setCreating}
          product={null}
          canEdit
          categories={sortedCategories}
          scopeStoreId={storeId}
        />
      ) : null}
    </div>
  )
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsView />
    </Suspense>
  )
}
