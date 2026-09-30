"use client"

import { PrinterIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDateTime, formatNumber, formatPhone } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { PAYMENT_METHOD } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Order } from "@/types"

import { FakeBarcode } from "@/components/admin/fake-codes"

function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <span className="min-w-0">{label}</span>
      <span className="tabular shrink-0 text-right">{value}</span>
    </div>
  )
}

function Rule() {
  return <div className="my-2 border-t border-dashed border-foreground/40" aria-hidden />
}

/** 80 mm thermal-printer style receipt, rendered from the stored order. */
export function Receipt({ order, className }: { order: Order; className?: string }) {
  const store = useDb((s) => s.stores.find((st) => st.id === order.storeId))
  const cashier = useDb((s) => (order.employeeId ? s.employees.find((e) => e.id === order.employeeId) : undefined))
  const customer = useDb((s) => (order.customerId ? s.customers.find((c) => c.id === order.customerId) : undefined))

  const lineDiscount = order.items.reduce((sum, it) => sum + it.discount, 0)
  const billDiscount = order.discount - lineDiscount
  const billDiscountLabel =
    customer && order.promotionCode
      ? `Ưu đãi TV + mã ${order.promotionCode}`
      : order.promotionCode
        ? `Mã ${order.promotionCode}`
        : "Ưu đãi thành viên"

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[330px] bg-white px-5 py-6 font-mono text-[12px] leading-[18px] text-foreground",
        className,
      )}
    >
      <div className="text-center">
        <div className="text-base font-bold tracking-[0.3em]">7-ELEVEN</div>
        {store ? (
          <>
            <div className="mt-1 font-semibold">
              CH {store.code} · {store.name}
            </div>
            <div>
              {store.address}, {store.ward}, {store.province}
            </div>
            <div>ĐT: {formatPhone(store.phone)}</div>
          </>
        ) : null}
      </div>
      <Rule />
      <div className="mb-1 text-center text-[13px] font-bold">HOÁ ĐƠN BÁN HÀNG</div>
      <Row label="Số HĐ" value={order.code} />
      <Row label="Ngày" value={formatDateTime(order.createdAt)} />
      <Row label="Thu ngân" value={cashier?.fullName ?? "—"} />
      {customer ? <Row label="Thành viên" value={`${customer.fullName} · ${TIERS[customer.tier].label}`} /> : null}
      <Rule />
      <ul className="space-y-1.5">
        {order.items.map((it) => (
          <li key={it.productId}>
            <div>{it.name}</div>
            <Row
              className="pl-3"
              label={`${formatNumber(it.quantity)} × ${formatNumber(it.unitPrice)}`}
              value={formatNumber(it.unitPrice * it.quantity)}
            />
            {it.discount > 0 ? <Row className="pl-3" label="Giảm giá" value={`-${formatNumber(it.discount)}`} /> : null}
          </li>
        ))}
      </ul>
      <Rule />
      <Row
        label={`Tạm tính (${order.items.reduce((s, it) => s + it.quantity, 0)} sp)`}
        value={formatNumber(order.subtotal)}
      />
      {lineDiscount > 0 ? <Row label="Giảm giá sản phẩm" value={`-${formatNumber(lineDiscount)}`} /> : null}
      {billDiscount > 0 ? <Row label={billDiscountLabel} value={`-${formatNumber(billDiscount)}`} /> : null}
      {order.shippingFee > 0 ? <Row label="Phí giao hàng" value={formatNumber(order.shippingFee)} /> : null}
      <Row className="mt-1 text-[14px] font-bold" label="TỔNG CỘNG" value={`${formatNumber(order.total)} ₫`} />
      <Row
        label={`Khách trả · ${PAYMENT_METHOD[order.paymentMethod]}`}
        value={formatNumber(order.cashReceived ?? order.total)}
      />
      {order.changeGiven !== undefined ? <Row label="Tiền thừa" value={formatNumber(order.changeGiven)} /> : null}
      <Rule />
      <div className="text-center font-semibold">Cảm ơn quý khách – Hẹn gặp lại</div>
      <div className="text-center text-[11px]">Giá đã bao gồm thuế GTGT</div>
      <FakeBarcode value={order.code} height={34} className="mt-3" />
      <div className="text-center text-[11px] tracking-widest">{order.code}</div>
    </div>
  )
}

/** Print only the receipt: everything else in <body> is hidden on paper. */
const PRINT_CSS = `
.receipt-print-root { display: none; }
@media print {
  @page { margin: 4mm; }
  body > *:not(.receipt-print-root) { display: none !important; }
  .receipt-print-root { display: block !important; }
  .receipt-print-root > div { max-width: 76mm; margin: 0; padding: 0; }
}
`

function PrintCopy({ order }: { order: Order }) {
  if (typeof document === "undefined") return null
  return createPortal(
    <div className="receipt-print-root">
      <style>{PRINT_CSS}</style>
      <Receipt order={order} />
    </div>,
    document.body,
  )
}

/**
 * Receipt preview with "In hoá đơn". The POS passes a primary "Đơn mới" action
 * (also bound to Enter via `onEnter`); the orders board uses it to reprint.
 */
export function ReceiptDialog({
  order,
  open,
  onOpenChange,
  title,
  description,
  icon,
  primaryAction,
  onEnter,
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  icon?: React.ReactNode
  primaryAction?: React.ReactNode
  /** Enter anywhere in the dialog (even with "In hoá đơn" focused) runs this. */
  onEnter?: () => void
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const visible = open && !!order

  // Enter = primary action, wherever focus is (it can fall back to <body> after the print preview).
  useEffect(() => {
    if (!visible || !onEnter) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.defaultPrevented) return
      const target = e.target as Node | null
      if (target !== document.body && !contentRef.current?.contains(target)) return
      e.preventDefault()
      onEnter()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [visible, onEnter])

  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b px-4 py-3.5 pr-12">
          {icon}
          <div className="grid gap-1">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
        </DialogHeader>
        <div className="max-h-[min(62dvh,560px)] overflow-y-auto bg-surface px-4 py-5">
          {order ? <Receipt order={order} className="rounded-md shadow-sm ring-1 ring-border" /> : null}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-none">
          <Button type="button" variant="outline" size="lg" onClick={() => window.print()}>
            <PrinterIcon /> In hoá đơn
          </Button>
          {primaryAction}
        </DialogFooter>
      </DialogContent>
      {visible && order ? <PrintCopy order={order} /> : null}
    </Dialog>
  )
}
