"use client"

import { PackageSearchIcon, PlusIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

import { type ColumnDef, DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate, formatNumber, formatTime, formatVND, normalizeText } from "@/lib/format"
import { PURCHASE_STATUS } from "@/lib/order-status"
import { canManage } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useCurrentStaff } from "@/stores/session"
import type { PurchaseOrder, PurchaseOrderStatus, Store, Supplier } from "@/types"

import { replaceQuery } from "@/lib/query"
import { ResultCount, SearchInput, Toolbar } from "@/components/admin/toolbar"
import { type PurchaseFormMode, PurchaseOrderFormSheet } from "./_components/purchase-order-form"
import { PurchaseOrderSheet } from "./_components/purchase-order-sheet"

type StatusTab = "all" | PurchaseOrderStatus

interface PurchaseRow {
  po: PurchaseOrder
  supplier?: Supplier
  store?: Store
  units: number
}

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "draft", label: PURCHASE_STATUS.draft.label },
  { value: "ordered", label: PURCHASE_STATUS.ordered.label },
  { value: "received", label: PURCHASE_STATUS.received.label },
  { value: "cancelled", label: PURCHASE_STATUS.cancelled.label },
]

const rowKey = (row: PurchaseRow) => row.po.id

const SUGGEST_MODE: PurchaseFormMode = { kind: "create", suggest: true }
const CREATE_MODE: PurchaseFormMode = { kind: "create", suggest: false }

function buildColumns(chain: boolean): ColumnDef<PurchaseRow, unknown>[] {
  const columns: ColumnDef<PurchaseRow, unknown>[] = [
    {
      id: "code",
      header: "Mã phiếu",
      accessorFn: (row) => row.po.code,
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.po.code}</span>,
      meta: { className: "pl-4" },
    },
    {
      id: "createdAt",
      header: "Ngày tạo",
      accessorFn: (row) => row.po.createdAt,
      cell: ({ row }) => (
        <div className="leading-tight">
          <div>{formatDate(row.original.po.createdAt)}</div>
          <div className="text-xs text-muted-foreground">{formatTime(row.original.po.createdAt)}</div>
        </div>
      ),
    },
    {
      id: "supplier",
      header: "Nhà cung cấp",
      accessorFn: (row) => row.supplier?.name ?? "",
      cell: ({ row }) => (
        <div className="max-w-[200px] leading-tight">
          <div className="truncate font-medium">{row.original.supplier?.name ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.supplier?.code}</div>
        </div>
      ),
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
          <span className="max-w-[120px] truncate">{row.original.store?.name}</span>
        </span>
      ),
    })
  }
  columns.push(
    {
      id: "items",
      header: "Mặt hàng",
      accessorFn: (row) => row.po.items.length,
      cell: ({ row }) => (
        <span>
          {formatNumber(row.original.po.items.length)}
          <span className="block text-xs text-muted-foreground">{formatNumber(row.original.units)} sp</span>
        </span>
      ),
      meta: { align: "right" },
    },
    {
      id: "total",
      header: "Tổng tiền",
      accessorFn: (row) => row.po.total,
      cell: ({ row }) => <span className="font-medium">{formatVND(row.original.po.total)}</span>,
      meta: { align: "right" },
    },
    {
      id: "expectedAt",
      header: "Dự kiến giao",
      accessorFn: (row) => row.po.expectedAt ?? "",
      cell: ({ row }) =>
        row.original.po.expectedAt ? (
          formatDate(row.original.po.expectedAt)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Trạng thái",
      accessorFn: (row) => row.po.status,
      cell: ({ row }) => {
        const status = PURCHASE_STATUS[row.original.po.status]
        return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      },
      meta: { className: "pr-4" },
    },
  )
  return columns
}

function PurchaseOrdersView() {
  const staff = useCurrentStaff()
  const canEdit = !!staff && canManage(staff.role, "purchasing")
  const { storeId } = useStoreScope()
  const purchaseOrders = useDb((s) => s.purchaseOrders)
  const suppliers = useDb((s) => s.suppliers)
  const stores = useDb((s) => s.stores)
  const params = useSearchParams()

  const [status, setStatus] = useState<StatusTab>("all")
  const [query, setQuery] = useState("")
  const [supplierId, setSupplierId] = useState("all")
  const [formMode, setFormMode] = useState<PurchaseFormMode | null>(null)

  const store = stores.find((s) => s.id === storeId)

  const rows = useMemo<PurchaseRow[]>(() => {
    const supplierMap = new Map(suppliers.map((s) => [s.id, s] as const))
    const storeMap = new Map(stores.map((s) => [s.id, s] as const))
    return purchaseOrders
      .filter((po) => !storeId || po.storeId === storeId)
      .map((po) => ({
        po,
        supplier: supplierMap.get(po.supplierId),
        store: storeMap.get(po.storeId),
        units: po.items.reduce((sum, it) => sum + it.quantity, 0),
      }))
  }, [purchaseOrders, suppliers, stores, storeId])

  const searched = useMemo(() => {
    let list = rows
    if (supplierId !== "all") list = list.filter((r) => r.po.supplierId === supplierId)
    const q = normalizeText(query)
    if (q) {
      list = list.filter(
        (r) =>
          r.po.code.toLowerCase().includes(q) || normalizeText(`${r.supplier?.name} ${r.supplier?.code}`).includes(q),
      )
    }
    return list
  }, [rows, supplierId, query])

  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = { all: searched.length, draft: 0, ordered: 0, received: 0, cancelled: 0 }
    for (const r of searched) result[r.po.status]++
    return result
  }, [searched])

  const filtered = useMemo(
    () => (status === "all" ? searched : searched.filter((r) => r.po.status === status)),
    [searched, status],
  )

  const columns = useMemo(() => buildColumns(!storeId), [storeId])

  // Detail sheet: ?ma=<code>. Managers only see their store's orders.
  const code = params.get("ma")
  const selected = code
    ? (purchaseOrders.find(
        (po) => po.code === code && (!storeId || staff?.role === "admin" || po.storeId === storeId),
      ) ?? null)
    : null
  const [shown, setShown] = useState<PurchaseOrder | null>(selected)
  if (selected && selected !== shown) setShown(selected)

  // Create sheet: button, or ?goi-y=1 from the inventory page (prefilled with low-stock items).
  const suggestParam = canEdit && params.get("goi-y") === "1"
  const activeMode = formMode ?? (suggestParam ? SUGGEST_MODE : null)

  const closeForm = () => {
    setFormMode(null)
    if (suggestParam) replaceQuery({ "goi-y": null })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhập hàng"
        description={
          store
            ? `Phiếu nhập của cửa hàng ${store.code} – ${store.name}`
            : `Phiếu nhập của ${stores.length} cửa hàng trong chuỗi`
        }
        actions={
          canEdit ? (
            <>
              <Button variant="outline" onClick={() => setFormMode(SUGGEST_MODE)}>
                <PackageSearchIcon /> Gợi ý hàng sắp hết
              </Button>
              <Button onClick={() => setFormMode(CREATE_MODE)}>
                <PlusIcon /> Tạo phiếu nhập
              </Button>
            </>
          ) : null
        }
      />

      <div className="space-y-3">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusTab)}>
            <TabsList className="h-9 group-data-horizontal/tabs:h-9">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 px-3">
                  {tab.label}
                  <span className="tabular rounded-full bg-foreground/5 px-1.5 text-xs leading-5 text-muted-foreground">
                    {formatNumber(counts[tab.value])}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="Tìm mã phiếu hoặc nhà cung cấp" />
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="w-full bg-card sm:w-[260px]" aria-label="Lọc theo nhà cung cấp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">Tất cả nhà cung cấp</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ResultCount>{formatNumber(filtered.length)} phiếu nhập</ResultCount>
        </Toolbar>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        getRowId={rowKey}
        onRowClick={(row) => replaceQuery({ ma: row.po.code })}
        emptyTitle="Chưa có phiếu nhập phù hợp"
        emptyDescription={
          canEdit ? "Tạo phiếu nhập mới hoặc đổi bộ lọc trạng thái, nhà cung cấp." : "Thử đổi bộ lọc hoặc từ khoá."
        }
      />

      <PurchaseOrderSheet
        purchaseOrder={selected ?? shown}
        open={!!selected}
        canEdit={canEdit}
        onOpenChange={(open) => {
          if (!open) replaceQuery({ ma: null })
        }}
        onEditDraft={(po) => {
          replaceQuery({ ma: null })
          setFormMode({ kind: "edit", purchaseOrder: po })
        }}
      />

      {canEdit ? (
        <PurchaseOrderFormSheet
          open={!!activeMode}
          mode={activeMode}
          scopeStoreId={storeId}
          onOpenChange={(open) => {
            if (!open) closeForm()
          }}
          onSaved={(saved) => {
            setFormMode(null)
            replaceQuery({ "goi-y": null, ma: saved.code })
          }}
        />
      ) : null}
    </div>
  )
}

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={null}>
      <PurchaseOrdersView />
    </Suspense>
  )
}
