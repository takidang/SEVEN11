"use client"

import { CircleCheckIcon, MapPinIcon, StoreIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { formatVND } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { useCurrentStaff } from "@/stores/session"
import type { Order } from "@/types"

import { BillPanel } from "./bill-panel"
import { PaymentDialog } from "./payment-dialog"
import { PosTopBar } from "./pos-top-bar"
import { ProductBrowser } from "./product-browser"
import { ReceiptDialog } from "@/components/admin/receipt"
import { useBillPricing, usePosStoreInfo } from "./use-pos"

/** True while a dialog / popover is open — global shortcuts stay out of its way. */
function overlayOpen() {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
}

/** The cash register: product grid + bill, payment and receipt dialogs, keyboard shortcuts. */
export function PosScreen() {
  const staff = useCurrentStaff()
  const { storeId, store, canSwitch, setStoreScope } = usePosStoreInfo()
  const { pricing } = useBillPricing()

  const searchRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const newOrderRef = useRef<HTMLButtonElement>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [receipt, setReceipt] = useState<Order | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

  const canSell = store?.status === "active"

  const focusSearch = useCallback(() => searchRef.current?.focus({ preventScroll: true }), [])

  const openPayment = useCallback(() => {
    if (!store) {
      toast.error("Chọn cửa hàng trước khi bán hàng")
      return
    }
    if (store.status !== "active") {
      toast.error(`Cửa hàng ${store.code} đang ${STORE_STATUS[store.status].label.toLowerCase()}, không thể bán hàng`)
      return
    }
    if (!pricing.lines.length) {
      toast.error("Hoá đơn đang trống", { id: "pos-empty" })
      return
    }
    if (pricing.codeError) {
      toast.error(pricing.codeError, { id: "pos-code" })
      return
    }
    setPayOpen(true)
  }, [store, pricing])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "F2" && e.key !== "F4" && e.key !== "F9") return
      e.preventDefault()
      if (overlayOpen()) return
      if (e.key === "F2") focusSearch()
      else if (e.key === "F4") phoneRef.current?.focus()
      else openPayment()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [focusSearch, openPayment])

  if (!staff) return null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface">
      <PosTopBar staff={staff} store={store} canSwitch={canSwitch} onStoreChange={setStoreScope} />

      {store && !canSell ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2 text-sm text-warning">
          <TriangleAlertIcon className="size-4" />
          Cửa hàng {store.code} – {store.name} đang {STORE_STATUS[store.status].label.toLowerCase()}. Không thể thanh
          toán tại cửa hàng này.
        </div>
      ) : null}

      {storeId ? (
        <div className="flex min-h-0 flex-1">
          <ProductBrowser storeId={storeId} searchRef={searchRef} />
          <BillPanel storeId={storeId} phoneRef={phoneRef} onPay={openPayment} onFocusSearch={focusSearch} />
        </div>
      ) : (
        <ChooseStore onPick={setStoreScope} />
      )}

      {storeId ? (
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          storeId={storeId}
          staff={staff}
          onPaid={(order) => {
            setPayOpen(false)
            setReceipt(order)
            setReceiptOpen(true)
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            if (!overlayOpen()) focusSearch()
          }}
        />
      ) : null}

      <ReceiptDialog
        order={receipt}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        title="Thanh toán thành công"
        description={receipt ? `${receipt.code} · ${formatVND(receipt.total)}` : undefined}
        icon={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fresh-soft text-fresh">
            <CircleCheckIcon className="size-5" />
          </span>
        }
        onEnter={() => setReceiptOpen(false)}
        primaryAction={
          <Button ref={newOrderRef} size="lg" onClick={() => setReceiptOpen(false)}>
            Đơn mới
            <Kbd className="bg-white/20 text-white">Enter</Kbd>
          </Button>
        }
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          newOrderRef.current?.focus()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          focusSearch()
        }}
      />
    </div>
  )
}

/** Admin opened the POS with "Toàn chuỗi" selected: pick the store the register sells for. */
function ChooseStore({ onPick }: { onPick: (storeId: string) => void }) {
  const stores = useDb((s) => s.stores)
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6 lg:items-center">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 ring-1 ring-border">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <StoreIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold">Chọn cửa hàng để bắt đầu bán</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Quản trị chuỗi có thể đứng quầy ở bất kỳ cửa hàng nào. Tồn kho và doanh thu được ghi nhận cho cửa hàng đã
              chọn.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {stores.map((s) => {
            const active = s.status === "active"
            return (
              <button
                key={s.id}
                type="button"
                disabled={!active}
                onClick={() => onPick(s.id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl p-3 text-left ring-1 ring-border transition-colors",
                  active ? "hover:bg-brand-soft/50 hover:ring-brand/40" : "cursor-not-allowed opacity-60",
                )}
              >
                <span className="tabular flex h-9 min-w-14 items-center justify-center rounded-lg bg-muted px-2 text-sm font-bold">
                  {s.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{s.name}</span>
                    {!active ? (
                      <StatusBadge tone={STORE_STATUS[s.status].tone}>{STORE_STATUS[s.status].label}</StatusBadge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPinIcon className="size-3 shrink-0" />
                    <span className="truncate">
                      {s.ward}, {s.province}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
