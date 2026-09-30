"use client"

import { CalendarClockIcon, CalendarX2Icon, HourglassIcon, Trash2Icon, WalletIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { type ColumnDef, DataTable } from "@/components/admin/data-table"
import { StatCard } from "@/components/admin/stat-card"
import { StatusBadge } from "@/components/admin/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useProductMap } from "@/hooks/use-catalog"
import { formatDate, formatNumber, formatVND, normalizeText } from "@/lib/format"
import { useDb } from "@/stores/db"
import type { InventoryBatch, Product, Store } from "@/types"

import { ProductCell } from "@/components/admin/product-cell"
import { FilterChips, ResultCount, SearchInput, Toolbar } from "@/components/admin/toolbar"
import { type ExpiryInfo, expiryInfo } from "./expiry"

type ExpiryFilter = "all" | "soon" | "expired"

export interface BatchRow {
  batch: InventoryBatch
  product: Product
  store?: Store
  expiry: ExpiryInfo
  value: number
}

const rowKey = (row: BatchRow) => row.batch.id

/** Batches in scope joined with their product, sorted by expiry (soonest first). */
export function useBatchRows(storeId: string | null, now: Date | null): BatchRow[] {
  const batches = useDb((s) => s.batches)
  const stores = useDb((s) => s.stores)
  const productMap = useProductMap()
  return useMemo(() => {
    if (!now) return []
    const storeMap = new Map(stores.map((s) => [s.id, s] as const))
    const rows: BatchRow[] = []
    for (const batch of batches) {
      if (storeId && batch.storeId !== storeId) continue
      const product = productMap.get(batch.productId)
      if (!product) continue
      rows.push({
        batch,
        product,
        store: storeMap.get(batch.storeId),
        expiry: expiryInfo(batch.expiresAt, now),
        value: batch.quantity * product.costPrice,
      })
    }
    return rows.sort((a, b) => a.batch.expiresAt.localeCompare(b.batch.expiresAt))
  }, [batches, stores, productMap, storeId, now])
}

function buildColumns(chain: boolean, onDiscard: ((row: BatchRow) => void) | null): ColumnDef<BatchRow, unknown>[] {
  const columns: ColumnDef<BatchRow, unknown>[] = [
    {
      id: "name",
      header: "Sản phẩm",
      accessorFn: (row) => row.product.name,
      cell: ({ row }) => <ProductCell product={row.original.product} showBarcode={false} />,
      meta: { className: "pl-4 min-w-[260px]" },
    },
  ]
  if (chain) {
    columns.push({
      id: "store",
      header: "Cửa hàng",
      accessorFn: (row) => row.store?.code ?? "",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">{row.original.store?.code}</span>
          <span className="max-w-[160px] truncate">{row.original.store?.name}</span>
        </span>
      ),
    })
  }
  columns.push(
    {
      id: "lotCode",
      header: "Mã lô",
      accessorFn: (row) => row.batch.lotCode,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.batch.lotCode}</span>,
    },
    {
      id: "receivedAt",
      header: "Ngày nhập",
      accessorFn: (row) => row.batch.receivedAt,
      cell: ({ row }) => formatDate(row.original.batch.receivedAt),
    },
    {
      id: "expiresAt",
      header: "Hạn dùng",
      accessorFn: (row) => row.batch.expiresAt,
      cell: ({ row }) => <span className="font-medium">{formatDate(row.original.batch.expiresAt)}</span>,
    },
    {
      id: "quantity",
      header: "Số lượng",
      accessorFn: (row) => row.batch.quantity,
      cell: ({ row }) => (
        <span>
          <span className="font-semibold">{formatNumber(row.original.batch.quantity)}</span>{" "}
          <span className="text-xs text-muted-foreground">{row.original.product.unit}</span>
        </span>
      ),
      meta: { align: "right" },
    },
    {
      id: "status",
      header: "Tình trạng",
      accessorFn: (row) => row.batch.expiresAt,
      cell: ({ row }) => <StatusBadge tone={row.original.expiry.tone}>{row.original.expiry.label}</StatusBadge>,
      meta: { className: onDiscard ? undefined : "pr-4" },
    },
  )
  if (onDiscard) {
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant={row.original.expiry.kind === "expired" ? "destructive" : "ghost"}
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              onDiscard(row.original)
            }}
          >
            <Trash2Icon /> Xuất huỷ
          </Button>
        </div>
      ),
      meta: { className: "w-[110px] pr-3" },
    })
  }
  return columns
}

export function BatchesTab({
  storeId,
  canEdit,
  storeLabel,
  now,
}: {
  storeId: string | null
  canEdit: boolean
  storeLabel: string
  now: Date | null
}) {
  const rows = useBatchRows(storeId, now)
  const [filter, setFilter] = useState<ExpiryFilter>("all")
  const [query, setQuery] = useState("")
  const [discarding, setDiscarding] = useState<BatchRow | null>(null)
  // Keep the dialog text while it animates closed.
  const [shown, setShown] = useState<BatchRow | null>(null)
  if (discarding && discarding !== shown) setShown(discarding)

  const stats = useMemo(() => {
    let soon = 0
    let expired = 0
    let soonValue = 0
    let units = 0
    for (const r of rows) {
      units += r.batch.quantity
      if (r.expiry.kind === "soon") {
        soon++
        soonValue += r.value
      } else if (r.expiry.kind === "expired") expired++
    }
    return { total: rows.length, soon, expired, soonValue, units }
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (filter !== "all") list = list.filter((r) => r.expiry.kind === filter)
    const q = normalizeText(query)
    if (q) {
      list = list.filter(
        (r) =>
          normalizeText(`${r.product.name} ${r.product.sku}`).includes(q) || r.batch.lotCode.toLowerCase().includes(q),
      )
    }
    return list
  }, [rows, filter, query])

  const canDiscard = canEdit && !!storeId
  const columns = useMemo(() => buildColumns(!storeId, canDiscard ? setDiscarding : null), [storeId, canDiscard])

  const confirmDiscard = () => {
    if (!discarding) return
    const { batch, product } = discarding
    useDb.getState().discardBatch(batch.id)
    toast.success(`Đã xuất huỷ lô ${batch.lotCode}`, {
      description: `${formatNumber(batch.quantity)} ${product.unit} ${product.name} · đã trừ khỏi tồn kho`,
    })
    setDiscarding(null)
  }

  // Expiry needs the current time, which is only known after mount.
  if (!now) return <div className="h-96" aria-busy />

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Lô đang theo dõi"
          value={formatNumber(stats.total)}
          icon={CalendarClockIcon}
          hint={`${formatNumber(stats.units)} sản phẩm có hạn dùng`}
        />
        <StatCard
          label="Sắp hết hạn"
          value={formatNumber(stats.soon)}
          icon={HourglassIcon}
          hint="Hết hạn hôm nay hoặc ngày mai"
        />
        <StatCard
          label="Đã hết hạn"
          value={formatNumber(stats.expired)}
          icon={CalendarX2Icon}
          hint={stats.expired ? "Cần xuất huỷ khỏi kệ" : "Không có lô quá hạn"}
        />
        <StatCard
          label="Giá trị sắp hết hạn"
          value={formatVND(stats.soonValue)}
          icon={WalletIcon}
          hint="Theo giá vốn · nên ưu tiên bán trước"
        />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm sản phẩm hoặc mã lô" />
        <FilterChips
          label="Lọc theo hạn dùng"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Tất cả", count: stats.total },
            { value: "soon", label: "Sắp hết hạn (≤ 1 ngày)", count: stats.soon },
            { value: "expired", label: "Đã hết hạn", count: stats.expired },
          ]}
        />
        <ResultCount>{formatNumber(filtered.length)} lô</ResultCount>
      </Toolbar>

      <DataTable
        data={filtered}
        columns={columns}
        getRowId={rowKey}
        rowClassName={(row) => (row.expiry.kind === "expired" ? "bg-red-soft/40 hover:bg-red-soft/60" : undefined)}
        emptyTitle={filter === "expired" ? "Không có lô nào đã hết hạn" : "Không có lô hàng phù hợp"}
        emptyDescription={
          filter === "all" && !query
            ? `Chưa có lô hàng có hạn dùng tại ${storeLabel.toLowerCase()}.`
            : "Thử bộ lọc khác hoặc xoá từ khoá tìm kiếm."
        }
      />

      <AlertDialog open={!!discarding} onOpenChange={(open) => !open && setDiscarding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xuất huỷ lô {shown?.batch.lotCode}?</AlertDialogTitle>
            <AlertDialogDescription>
              {shown ? (
                <>
                  {formatNumber(shown.batch.quantity)} {shown.product.unit} <b>{shown.product.name}</b> (hạn dùng{" "}
                  {formatDate(shown.batch.expiresAt)}) sẽ bị trừ khỏi tồn kho {storeLabel.toLowerCase()}. Giá trị huỷ{" "}
                  {formatVND(shown.value)}. Không thể hoàn tác.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDiscard}>
              <Trash2Icon /> Xuất huỷ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
