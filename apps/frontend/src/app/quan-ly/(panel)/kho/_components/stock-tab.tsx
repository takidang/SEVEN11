"use client"

import {
  BoxesIcon,
  GaugeIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PackageMinusIcon,
  PackageXIcon,
  SlidersHorizontalIcon,
  WalletIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { type ColumnDef, DataTable } from "@/components/admin/data-table"
import { StatCard } from "@/components/admin/stat-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCategories, useProducts } from "@/hooks/use-catalog"
import type { StockState } from "@/hooks/use-stock"
import { searchProducts } from "@/lib/catalog"
import { formatNumber, formatVND, normalizeText } from "@/lib/format"
import type { Category, Product } from "@/types"

import { ProductCell } from "@/components/admin/product-cell"
import { type ScopedStock, StockBadge, useScopedStock } from "@/components/admin/scoped-stock"
import { ResultCount, SearchInput, Toolbar } from "@/components/admin/toolbar"
import { AdjustStockDialog, MinQuantityDialog, type StockTarget } from "./stock-dialogs"

/** `restock` = out of stock or at/below the minimum (what needs a purchase order). */
export type StockFilter = "all" | "restock" | "low" | "out"

/** Discontinued products keep their stock but aren't flagged for restocking. */
type RowState = StockState | "inactive"

interface StockRow {
  product: Product
  category?: Category
  stock: ScopedStock
  state: RowState
  chain: boolean
  value: number
}

const STATE_RANK: Record<RowState, number> = { out: 0, low: 1, ok: 2, inactive: 3 }
const EMPTY_STOCK: ScopedStock = {
  quantity: 0,
  minQuantity: 0,
  state: "out",
  lowStores: 0,
  outStores: 0,
  lowStoreIds: [],
  outStoreIds: [],
  quantityByStore: new Map(),
}
const rowKey = (row: StockRow) => row.product.id
const noop = () => {}

function RowActions({
  row,
  onAdjust,
  onEditMin,
}: {
  row: StockRow
  onAdjust: (row: StockRow) => void
  onEditMin: (row: StockRow) => void
}) {
  return (
    <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Thao tác với ${row.product.name}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => onAdjust(row)}>
            <SlidersHorizontalIcon /> Điều chỉnh tồn
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEditMin(row)}>
            <GaugeIcon /> Sửa định mức
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/quan-ly/san-pham?ma=${encodeURIComponent(row.product.sku)}`}>
              <PackageIcon /> Xem sản phẩm
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function buildColumns(
  canEdit: boolean,
  onAdjust: (row: StockRow) => void,
  onEditMin: (row: StockRow) => void,
): ColumnDef<StockRow, unknown>[] {
  const columns: ColumnDef<StockRow, unknown>[] = [
    {
      id: "name",
      header: "Sản phẩm",
      accessorFn: (row) => row.product.name,
      cell: ({ row }) => <ProductCell product={row.original.product} showBarcode={false} />,
      meta: { className: "pl-4 min-w-[260px]" },
    },
    {
      id: "category",
      header: "Danh mục",
      accessorFn: (row) => row.category?.name ?? "",
      cell: ({ row }) => <span className="block max-w-[200px] truncate">{row.original.category?.name ?? "—"}</span>,
    },
    {
      id: "quantity",
      header: "Tồn",
      accessorFn: (row) => row.stock.quantity,
      cell: ({ row }) => <span className="font-semibold">{formatNumber(row.original.stock.quantity)}</span>,
      meta: { align: "right" },
    },
    {
      id: "minQuantity",
      header: "Định mức tối thiểu",
      accessorFn: (row) => row.stock.minQuantity,
      cell: ({ row }) => <span className="text-muted-foreground">{formatNumber(row.original.stock.minQuantity)}</span>,
      meta: { align: "right" },
    },
    {
      id: "state",
      header: "Tình trạng",
      accessorFn: (row) => STATE_RANK[row.state],
      cell: ({ row }) =>
        row.original.state === "inactive" ? (
          <StatusBadge tone="neutral">Ngừng bán</StatusBadge>
        ) : (
          <StockBadge stock={row.original.stock} chain={row.original.chain} />
        ),
    },
    {
      id: "value",
      header: "Giá trị tồn",
      accessorFn: (row) => row.value,
      cell: ({ row }) => formatVND(row.original.value),
      meta: { align: "right", className: canEdit ? undefined : "pr-4" },
    },
  ]
  if (canEdit) {
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => <RowActions row={row.original} onAdjust={onAdjust} onEditMin={onEditMin} />,
      meta: { className: "w-12 pr-3" },
    })
  }
  return columns
}

export function StockTab({
  storeId,
  canEdit,
  storeLabel,
  filter,
  onFilterChange,
}: {
  storeId: string | null
  /** Manage role and a concrete store selected. */
  canEdit: boolean
  storeLabel: string
  filter: StockFilter
  onFilterChange: (filter: StockFilter) => void
}) {
  const products = useProducts()
  const categories = useCategories()
  const stock = useScopedStock(storeId)

  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState("all")
  const [adjusting, setAdjusting] = useState<StockTarget | null>(null)
  const [editingMin, setEditingMin] = useState<StockTarget | null>(null)

  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.sortOrder - b.sortOrder), [categories])

  const rows = useMemo<StockRow[]>(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c] as const))
    return products.map((product) => {
      const level = stock.get(product.id) ?? EMPTY_STOCK
      return {
        product,
        category: categoryMap.get(product.categoryId),
        stock: level,
        state: product.isActive ? level.state : ("inactive" as const),
        chain: !storeId,
        value: level.quantity * product.costPrice,
      }
    })
  }, [products, categories, stock, storeId])

  const stats = useMemo(() => {
    let low = 0
    let out = 0
    let value = 0
    let units = 0
    for (const r of rows) {
      if (r.state === "low") low++
      else if (r.state === "out") out++
      value += r.value
      units += r.stock.quantity
    }
    return { items: rows.length, low, out, value, units }
  }, [rows])

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
    if (filter === "restock") list = list.filter((r) => r.state === "low" || r.state === "out")
    else if (filter !== "all") list = list.filter((r) => r.state === filter)
    return list
  }, [rows, products, query, categoryId, filter])

  const columns = useMemo(() => {
    if (!canEdit || !storeId) return buildColumns(false, noop, noop)
    return buildColumns(
      true,
      (row) => setAdjusting({ product: row.product, storeId }),
      (row) => setEditingMin({ product: row.product, storeId }),
    )
  }, [canEdit, storeId])

  const chainHint = "Ở ít nhất 1 cửa hàng"

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Mặt hàng"
          value={formatNumber(stats.items)}
          icon={BoxesIcon}
          hint={`${formatNumber(stats.units)} sản phẩm trong kho`}
        />
        <StatCard
          label="Sắp hết"
          value={formatNumber(stats.low)}
          icon={PackageMinusIcon}
          hint={storeId ? "Đang bán, tồn bằng hoặc dưới định mức" : chainHint}
        />
        <StatCard
          label="Hết hàng"
          value={formatNumber(stats.out)}
          icon={PackageXIcon}
          hint={storeId ? "Đang bán, tồn bằng 0" : chainHint}
        />
        <StatCard label="Giá trị tồn" value={formatVND(stats.value)} icon={WalletIcon} hint="Tính theo giá vốn" />
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
        <Select value={filter} onValueChange={(v) => onFilterChange(v as StockFilter)}>
          <SelectTrigger className="w-full bg-card sm:w-[170px]" aria-label="Lọc theo tình trạng tồn">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Tất cả tình trạng</SelectItem>
            <SelectItem value="restock">Hết & sắp hết ({formatNumber(stats.low + stats.out)})</SelectItem>
            <SelectItem value="low">Sắp hết ({formatNumber(stats.low)})</SelectItem>
            <SelectItem value="out">Hết hàng ({formatNumber(stats.out)})</SelectItem>
          </SelectContent>
        </Select>
        <ResultCount>
          {filtered.length === rows.length
            ? `${formatNumber(rows.length)} mặt hàng`
            : `${formatNumber(filtered.length)} / ${formatNumber(rows.length)} mặt hàng`}
        </ResultCount>
      </Toolbar>

      <DataTable
        data={filtered}
        columns={columns}
        getRowId={rowKey}
        onRowClick={canEdit && storeId ? (row) => setAdjusting({ product: row.product, storeId }) : undefined}
        emptyTitle={filter === "all" ? "Không tìm thấy mặt hàng" : "Không có mặt hàng nào ở tình trạng này"}
        emptyDescription="Thử từ khoá khác hoặc bỏ bớt bộ lọc."
      />

      <AdjustStockDialog target={adjusting} storeLabel={storeLabel} onClose={() => setAdjusting(null)} />
      <MinQuantityDialog target={editingMin} storeLabel={storeLabel} onClose={() => setEditingMin(null)} />
    </div>
  )
}
