"use client"

import { PlusIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

import { type ColumnDef, DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCategories } from "@/hooks/use-catalog"
import { formatNumber, formatPhone, normalizeText } from "@/lib/format"
import { canManage } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useCurrentStaff } from "@/stores/session"
import type { Category, Supplier, SupplierStatus } from "@/types"

import { replaceQuery } from "@/lib/query"
import { ResultCount, SearchInput, Toolbar } from "@/components/admin/toolbar"
import { SUPPLIER_STATUS } from "./_components/supplier-form"
import { SupplierSheet } from "./_components/supplier-sheet"

interface SupplierRow {
  supplier: Supplier
  categories: Category[]
  orderCount: number
}

const rowKey = (row: SupplierRow) => row.supplier.id

const columns: ColumnDef<SupplierRow, unknown>[] = [
  {
    id: "code",
    header: "Mã",
    accessorFn: (row) => row.supplier.code,
    cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.supplier.code}</span>,
    meta: { className: "pl-4" },
  },
  {
    id: "name",
    header: "Nhà cung cấp",
    accessorFn: (row) => row.supplier.name,
    cell: ({ row }) => (
      <div className="max-w-[210px] leading-tight">
        <div className="truncate font-medium" title={row.original.supplier.name}>
          {row.original.supplier.name}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={row.original.supplier.address}>
          {row.original.supplier.address}
        </div>
      </div>
    ),
  },
  {
    id: "contact",
    header: "Người liên hệ",
    accessorFn: (row) => row.supplier.contactName,
    cell: ({ row }) => (
      <div className="leading-tight">
        <div>{row.original.supplier.contactName}</div>
        <div className="tabular text-xs text-muted-foreground">{formatPhone(row.original.supplier.phone)}</div>
      </div>
    ),
  },
  {
    id: "email",
    header: "Email",
    accessorFn: (row) => row.supplier.email,
    cell: ({ row }) => (
      <span className="block max-w-[170px] truncate text-muted-foreground" title={row.original.supplier.email}>
        {row.original.supplier.email}
      </span>
    ),
  },
  {
    id: "categories",
    header: "Danh mục cung cấp",
    enableSorting: false,
    cell: ({ row }) => {
      const list = row.original.categories
      return (
        <div className="flex items-center gap-1">
          {list.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className="max-w-[118px] truncate rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-dark"
              title={c.name}
            >
              {c.name}
            </span>
          ))}
          {list.length > 2 ? (
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              title={list
                .slice(2)
                .map((c) => c.name)
                .join(", ")}
            >
              +{list.length - 2}
            </span>
          ) : null}
        </div>
      )
    },
  },
  {
    id: "orders",
    header: "Phiếu nhập",
    accessorFn: (row) => row.orderCount,
    cell: ({ row }) => formatNumber(row.original.orderCount),
    meta: { align: "right" },
  },
  {
    id: "status",
    header: "Trạng thái",
    accessorFn: (row) => row.supplier.status,
    cell: ({ row }) => {
      const status = SUPPLIER_STATUS[row.original.supplier.status]
      return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    },
    meta: { className: "pr-4" },
  },
]

function SuppliersView() {
  const staff = useCurrentStaff()
  const canEdit = !!staff && canManage(staff.role, "suppliers")
  const { storeId } = useStoreScope()
  const suppliers = useDb((s) => s.suppliers)
  const purchaseOrders = useDb((s) => s.purchaseOrders)
  const stores = useDb((s) => s.stores)
  const categories = useCategories()
  const params = useSearchParams()

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | SupplierStatus>("all")
  const [creating, setCreating] = useState(false)

  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.sortOrder - b.sortOrder), [categories])
  const store = stores.find((s) => s.id === storeId)

  const rows = useMemo<SupplierRow[]>(() => {
    const counts = new Map<string, number>()
    for (const po of purchaseOrders) {
      if (storeId && po.storeId !== storeId) continue
      counts.set(po.supplierId, (counts.get(po.supplierId) ?? 0) + 1)
    }
    return suppliers.map((supplier) => ({
      supplier,
      categories: sortedCategories.filter((c) => supplier.categoryIds.includes(c.id)),
      orderCount: counts.get(supplier.id) ?? 0,
    }))
  }, [suppliers, purchaseOrders, sortedCategories, storeId])

  const filtered = useMemo(() => {
    let list = rows
    if (status !== "all") list = list.filter((r) => r.supplier.status === status)
    const q = normalizeText(query)
    if (q) {
      const digits = query.replace(/\D/g, "")
      list = list.filter((r) => {
        const s = r.supplier
        return (
          normalizeText(`${s.code} ${s.name} ${s.contactName} ${s.email}`).includes(q) ||
          (digits.length >= 3 && (s.phone.includes(digits) || s.taxCode.includes(digits)))
        )
      })
    }
    return list
  }, [rows, status, query])

  const active = rows.filter((r) => r.supplier.status === "active").length

  const code = params.get("ma")
  const selected = code ? (suppliers.find((s) => s.code === code || s.id === code) ?? null) : null
  const [shown, setShown] = useState<Supplier | null>(selected)
  if (selected && selected !== shown) setShown(selected)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhà cung cấp"
        description={`${rows.length} nhà cung cấp · ${active} đang hợp tác${store ? ` · số phiếu nhập tính tại cửa hàng ${store.code}` : ""}`}
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> Thêm nhà cung cấp
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm tên, mã, người liên hệ, MST" />
        <Select value={status} onValueChange={(v) => setStatus(v as "all" | SupplierStatus)}>
          <SelectTrigger className="w-full bg-card sm:w-[180px]" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="active">{SUPPLIER_STATUS.active.label}</SelectItem>
            <SelectItem value="inactive">{SUPPLIER_STATUS.inactive.label}</SelectItem>
          </SelectContent>
        </Select>
        <ResultCount>{formatNumber(filtered.length)} nhà cung cấp</ResultCount>
      </Toolbar>

      <DataTable
        data={filtered}
        columns={columns}
        getRowId={rowKey}
        onRowClick={(row) => replaceQuery({ ma: row.supplier.code })}
        rowClassName={(row) => (row.supplier.status === "inactive" ? "text-muted-foreground" : undefined)}
        emptyTitle="Không tìm thấy nhà cung cấp"
        emptyDescription="Thử từ khoá khác hoặc đổi bộ lọc trạng thái."
      />

      <SupplierSheet
        supplier={selected ?? shown}
        open={!!selected}
        canEdit={canEdit}
        categories={sortedCategories}
        storeId={storeId}
        onOpenChange={(open) => {
          if (!open) replaceQuery({ ma: null })
        }}
      />

      {canEdit ? (
        <SupplierSheet
          supplier={null}
          open={creating}
          canEdit
          categories={sortedCategories}
          storeId={storeId}
          onOpenChange={setCreating}
          onCreated={(saved) => {
            setCreating(false)
            replaceQuery({ ma: saved.code })
          }}
        />
      ) : null}
    </div>
  )
}

export default function SuppliersPage() {
  return (
    <Suspense fallback={null}>
      <SuppliersView />
    </Suspense>
  )
}
