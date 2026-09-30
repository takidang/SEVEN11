"use client"

import {
  BanknoteIcon,
  CircleCheckIcon,
  CreditCardIcon,
  type LucideIcon,
  NfcIcon,
  QrCodeIcon,
  ShieldAlertIcon,
  WalletIcon,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useCategories } from "@/hooks/use-catalog"
import { formatNumber, formatVND } from "@/lib/format"
import { PAYMENT_METHOD } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Employee, Order, PaymentMethod } from "@/types"

import { FakeQr } from "@/components/admin/fake-codes"
import { MoneyInput } from "./money-input"
import { usePosStore } from "./pos-store"
import { isAgeRestricted, useBillActions, useBillPricing } from "./use-pos"

type CounterMethod = Exclude<PaymentMethod, "cod">

const METHODS: { id: CounterMethod; icon: LucideIcon }[] = [
  { id: "cash", icon: BanknoteIcon },
  { id: "card", icon: CreditCardIcon },
  { id: "ewallet", icon: WalletIcon },
  { id: "bank-transfer", icon: QrCodeIcon },
]

/** "Đủ tiền" + the next round banknote amounts above the total. */
function quickAmounts(total: number) {
  const steps = [10_000, 50_000, 100_000, 200_000, 500_000]
  const rounded = steps.map((s) => Math.ceil(total / s) * s).filter((v) => v > total)
  return [...new Set(rounded)]
}

export function PaymentDialog({
  open,
  onOpenChange,
  storeId,
  staff,
  onPaid,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: string
  staff: Employee
  onPaid: (order: Order) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[560px]" onCloseAutoFocus={onCloseAutoFocus}>
        {/* Mounted only while open, so every payment starts from a clean form. */}
        {open ? (
          <PaymentForm storeId={storeId} staff={staff} onCancel={() => onOpenChange(false)} onPaid={onPaid} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PaymentForm({
  storeId,
  staff,
  onCancel,
  onPaid,
}: {
  storeId: string
  staff: Employee
  onCancel: () => void
  onPaid: (order: Order) => void
}) {
  const { lines, customer, promoCode, pricing } = useBillPricing()
  const { available } = useBillActions(storeId)
  const categories = useCategories()
  const [method, setMethod] = useState<CounterMethod>("cash")
  const [cash, setCash] = useState<number | null>(null)
  const [ageChecked, setAgeChecked] = useState(false)
  const cashRef = useRef<HTMLInputElement>(null)

  /** Quick amount: fill the input and keep typing focus there (Enter confirms). */
  const pickCash = (amount: number) => {
    setCash(amount)
    cashRef.current?.focus()
  }

  const total = pricing.total
  const restricted = useMemo(
    () => pricing.lines.filter((l) => isAgeRestricted(l.product, categories)),
    [pricing.lines, categories],
  )
  const change = cash !== null ? cash - total : null
  const cashShort = method === "cash" && (cash === null || cash < total)
  const needsAge = restricted.length > 0 && !ageChecked
  const canConfirm = pricing.lines.length > 0 && !cashShort && !needsAge

  // A reference the customer would see in their banking / wallet app.
  const transferRef = useMemo(
    () => `7E${storeId.replace(/\D/g, "")}${String(total).slice(-4)}${pricing.itemCount}`,
    [storeId, total, pricing.itemCount],
  )

  const confirm = () => {
    if (!canConfirm) {
      if (cashShort) toast.error("Tiền khách đưa chưa đủ", { id: "pos-pay" })
      else if (needsAge) toast.error("Cần xác nhận đã kiểm tra tuổi của khách", { id: "pos-pay" })
      return
    }
    const short = pricing.lines.find((l) => l.quantity > available(l.productId))
    if (short) {
      toast.error(`Cửa hàng không đủ tồn kho: ${short.product.name} (còn ${available(short.productId)})`)
      return
    }
    const result = useDb.getState().placeOrder({
      channel: "in-store",
      storeId,
      lines,
      paymentMethod: method,
      customerId: customer?.id,
      employeeId: staff.id,
      promotionCode: promoCode || undefined,
      cashReceived: method === "cash" ? (cash ?? undefined) : undefined,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    usePosStore.getState().clearBill()
    onPaid(result.order)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        confirm()
      }}
      // Enter confirms from anywhere in the dialog (quick-amount / method buttons, age checkbox), not just the input.
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.repeat) return
        const target = e.target as HTMLElement
        if (target.closest("[data-enter-ignore]") || (target as HTMLButtonElement).type === "submit") return
        e.preventDefault()
        confirm()
      }}
      className="grid"
    >
      <DialogHeader className="border-b px-5 py-4 pr-12">
        <DialogTitle className="text-lg font-semibold">Thanh toán</DialogTitle>
        <DialogDescription>
          {pricing.itemCount} sản phẩm · {customer ? `Thành viên ${customer.fullName}` : "Khách lẻ"}
          {promoCode && !pricing.codeError ? ` · Mã ${promoCode}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 px-5 py-4">
        <div className="flex items-end justify-between gap-4 rounded-xl bg-brand-soft px-4 py-3">
          <div>
            <p className="text-xs font-medium text-brand-dark">Khách cần thanh toán</p>
            {pricing.discountTotal > 0 ? (
              <p className="mt-0.5 text-xs text-brand-dark/80">
                Đã giảm {formatVND(pricing.discountTotal)} trên {formatVND(pricing.subtotal)}
              </p>
            ) : null}
          </div>
          <p className="tabular text-[32px] leading-none font-bold text-brand">{formatVND(total)}</p>
        </div>

        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Hình thức thanh toán">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              onClick={() => setMethod(m.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-[13px] font-medium ring-1 transition-colors",
                method === m.id
                  ? "bg-brand text-white ring-brand"
                  : "bg-white text-foreground ring-border hover:bg-muted/60",
              )}
            >
              <m.icon className="size-5" />
              <span className="text-center leading-tight">{PAYMENT_METHOD[m.id]}</span>
            </button>
          ))}
        </div>

        {method === "cash" ? (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pos-cash">Tiền khách đưa</Label>
              <MoneyInput
                ref={cashRef}
                id="pos-cash"
                autoFocus
                value={cash}
                onChange={setCash}
                placeholder={formatNumber(total)}
                className="h-12 rounded-xl"
                inputClassName="text-2xl font-semibold md:text-2xl"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => pickCash(total)}>
                Đủ tiền
              </Button>
              {quickAmounts(total).map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  className="tabular"
                  onClick={() => pickCash(amount)}
                >
                  {formatNumber(amount)}
                </Button>
              ))}
            </div>
            <div
              className={cn(
                "flex items-center justify-between rounded-xl px-4 py-3 ring-1",
                change !== null && change < 0 ? "bg-red-soft ring-red/20" : "bg-muted/50 ring-border",
              )}
            >
              <span className="text-sm font-medium">
                {change !== null && change < 0 ? "Khách còn thiếu" : "Tiền thừa trả khách"}
              </span>
              <span
                className={cn(
                  "tabular text-2xl font-bold",
                  change !== null && change < 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {change === null ? "—" : formatVND(Math.abs(change))}
              </span>
            </div>
          </div>
        ) : method === "card" ? (
          <div className="flex items-center gap-4 rounded-xl bg-muted/50 px-4 py-4 ring-1 ring-border">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white text-brand ring-1 ring-border">
              <NfcIcon className="size-7" />
            </span>
            <div className="space-y-1 text-sm">
              <p className="font-medium">Mời khách chạm hoặc cắm thẻ vào máy POS</p>
              <p className="text-muted-foreground">
                Nhập số tiền <span className="tabular font-semibold text-foreground">{formatVND(total)}</span> trên máy.
                Khi máy báo giao dịch thành công, bấm xác nhận bên dưới.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5 rounded-xl bg-muted/50 p-4 ring-1 ring-border">
            <FakeQr
              value={`${method}:${transferRef}:${total}`}
              size={148}
              className="shrink-0 p-1.5 ring-1 ring-border"
            />
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-medium">
                {method === "ewallet"
                  ? "Khách mở ví điện tử và quét mã để thanh toán"
                  : "Khách mở ứng dụng ngân hàng và quét mã VietQR"}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-muted-foreground">Số tiền</dt>
                <dd className="tabular font-semibold">{formatVND(total)}</dd>
                <dt className="text-muted-foreground">Nội dung</dt>
                <dd className="font-mono">{transferRef}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                Bấm “Đã nhận tiền” khi thấy thông báo nhận tiền thành công.
              </p>
            </div>
          </div>
        )}

        {restricted.length ? (
          <div className="rounded-xl bg-warning-soft px-4 py-3 ring-1 ring-warning/25">
            <div className="flex items-start gap-2.5">
              <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0 space-y-2">
                <p className="text-[13px] text-warning">
                  <span className="font-semibold">Sản phẩm giới hạn độ tuổi:</span>{" "}
                  {restricted.map((l) => l.product.name).join(", ")}
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pos-age-check"
                    checked={ageChecked}
                    onCheckedChange={(v) => setAgeChecked(v === true)}
                    className="bg-white"
                  />
                  <Label htmlFor="pos-age-check" className="text-sm font-medium text-foreground">
                    Đã kiểm tra giấy tờ, khách từ đủ 18 tuổi
                  </Label>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <DialogFooter className="mx-0 mb-0 rounded-none px-5">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} data-enter-ignore>
          Quay lại
        </Button>
        <Button type="submit" size="lg" disabled={!canConfirm} className="min-w-44">
          <CircleCheckIcon />
          {method === "cash" ? "Xác nhận thanh toán" : method === "card" ? "Đã quẹt thẻ thành công" : "Đã nhận tiền"}
          <span className="text-xs font-normal opacity-80">(Enter)</span>
        </Button>
      </DialogFooter>
    </form>
  )
}
