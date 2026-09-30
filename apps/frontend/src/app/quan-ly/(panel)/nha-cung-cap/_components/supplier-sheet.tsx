"use client"

import { ArrowRightIcon, MailIcon, MapPinIcon, PencilIcon, PhoneIcon, UserRoundIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDate, formatNumber, formatPhone, formatVND } from "@/lib/format"
import { PURCHASE_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Category, Supplier } from "@/types"

import { SUPPLIER_STATUS, SupplierForm } from "./supplier-form"

const RECENT_LIMIT = 6

function ContactRow({
  icon: Icon,
  children,
  className,
}: {
  icon: typeof PhoneIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start gap-2.5 text-sm", className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SupplierDetails({
  supplier,
  categories,
  storeId,
}: {
  supplier: Supplier
  categories: Category[]
  storeId: string | null
}) {
  const purchaseOrders = useDb((s) => s.purchaseOrders)
  const stores = useDb((s) => s.stores)

  const orders = useMemo(
    () => purchaseOrders.filter((po) => po.supplierId === supplier.id && (!storeId || po.storeId === storeId)),
    [purchaseOrders, supplier.id, storeId],
  )
  const received = orders.filter((po) => po.status === "received")
  const receivedValue = received.reduce((sum, po) => sum + po.total, 0)
  const open = orders.filter((po) => po.status === "ordered" || po.status === "draft").length
  const supplied = categories.filter((c) => supplier.categoryIds.includes(c.id))

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <section className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
        <ContactRow icon={UserRoundIcon}>
          <div className="font-medium">{supplier.contactName}</div>
          <div className="text-xs text-muted-foreground">Người liên hệ</div>
        </ContactRow>
        <ContactRow icon={PhoneIcon}>
          <a href={`tel:${supplier.phone}`} className="font-medium hover:text-brand hover:underline">
            {formatPhone(supplier.phone)}
          </a>
        </ContactRow>
        <ContactRow icon={MailIcon}>
          <a href={`mailto:${supplier.email}`} className="break-all hover:text-brand hover:underline">
            {supplier.email}
          </a>
        </ContactRow>
        <ContactRow icon={MapPinIcon}>{supplier.address}</ContactRow>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Danh mục cung cấp ({supplied.length})</h3>
        <div className="flex flex-wrap gap-1.5">
          {supplied.map((c) => (
            <span key={c.id} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark">
              {c.name}
            </span>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-lg p-3 ring-1 ring-border">
          <div className="text-xs text-muted-foreground">Phiếu nhập</div>
          <div className="tabular mt-1 text-lg font-semibold">{formatNumber(orders.length)}</div>
        </div>
        <div className="rounded-lg p-3 ring-1 ring-border">
          <div className="text-xs text-muted-foreground">Đang xử lý</div>
          <div className="tabular mt-1 text-lg font-semibold">{formatNumber(open)}</div>
        </div>
        <div className="rounded-lg p-3 ring-1 ring-border">
          <div className="text-xs text-muted-foreground">Đã nhập kho</div>
          <div className="tabular mt-1 truncate text-lg font-semibold" title={formatVND(receivedValue)}>
            {formatVND(receivedValue)}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Phiếu nhập gần đây</h3>
          {orders.length > RECENT_LIMIT ? (
            <span className="text-xs text-muted-foreground">
              {RECENT_LIMIT}/{orders.length} phiếu
            </span>
          ) : null}
        </div>
        {orders.length ? (
          <ul className="divide-y rounded-lg ring-1 ring-border">
            {orders.slice(0, RECENT_LIMIT).map((po) => {
              const status = PURCHASE_STATUS[po.status]
              const store = stores.find((s) => s.id === po.storeId)
              return (
                <li key={po.id}>
                  <Link
                    href={`/quan-ly/nhap-hang?ma=${po.code}`}
                    className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium group-hover:text-brand">{po.code}</span>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatDate(po.createdAt)} · {po.items.length} mặt hàng
                        {!storeId && store ? ` · Cửa hàng ${store.code}` : ""}
                      </div>
                    </div>
                    <span className="tabular text-sm font-medium">{formatVND(po.total)}</span>
                    <ArrowRightIcon className="size-4 text-muted-foreground group-hover:text-brand" />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có phiếu nhập nào với nhà cung cấp này{storeId ? " tại cửa hàng đang xem" : ""}.
          </p>
        )}
      </section>
    </div>
  )
}

/** Supplier detail sheet (admin can switch to edit), or the create form when `supplier` is null. */
export function SupplierSheet({
  supplier,
  open,
  canEdit,
  categories,
  storeId,
  onOpenChange,
  onCreated,
}: {
  supplier: Supplier | null
  open: boolean
  canEdit: boolean
  categories: Category[]
  storeId: string | null
  onOpenChange: (open: boolean) => void
  onCreated?: (supplier: Supplier) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = !!supplier && editingId === supplier.id
  const creating = !supplier
  const status = supplier ? SUPPLIER_STATUS[supplier.status] : null

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditingId(null)
        onOpenChange(next)
      }}
    >
      <SheetContent
        className="gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          if (creating) return
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-base font-semibold">
              {creating ? "Thêm nhà cung cấp" : editing ? `Sửa ${supplier.code}` : supplier.name}
            </SheetTitle>
            {status && !editing ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : null}
          </div>
          <SheetDescription>
            {creating
              ? "Nhà cung cấp mới có thể chọn ngay khi tạo phiếu nhập."
              : editing
                ? supplier.name
                : `${supplier.code} · Mã số thuế ${supplier.taxCode}`}
          </SheetDescription>
        </SheetHeader>

        {creating || editing ? (
          <SupplierForm
            key={supplier?.id ?? "new"}
            supplier={supplier}
            categories={categories}
            onCancel={() => (creating ? onOpenChange(false) : setEditingId(null))}
            onSaved={(saved) => {
              setEditingId(null)
              if (creating) onCreated?.(saved)
            }}
          />
        ) : (
          <>
            <SupplierDetails supplier={supplier} categories={categories} storeId={storeId} />
            {canEdit ? (
              <div className="flex justify-end border-t bg-card px-5 py-3">
                <Button variant="outline" onClick={() => setEditingId(supplier.id)}>
                  <PencilIcon /> Chỉnh sửa
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
