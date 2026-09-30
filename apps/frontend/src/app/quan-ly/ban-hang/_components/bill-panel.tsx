"use client"

import {
  CirclePauseIcon,
  MinusIcon,
  PlusIcon,
  ReceiptTextIcon,
  ShoppingBasketIcon,
  TicketPercentIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { ProductImage } from "@/components/shop/product-image"
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
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { formatNumber, formatVND } from "@/lib/format"
import type { AppliedDiscount, PricedLine, PricingResult } from "@/lib/pricing"
import { cn } from "@/lib/utils"

import { CustomerLookup } from "./customer-lookup"
import { HeldBillsPopover } from "./held-bills"
import { usePosStore } from "./pos-store"
import { useBillActions, useBillPricing } from "./use-pos"

export function BillPanel({
  storeId,
  phoneRef,
  onPay,
  onFocusSearch,
}: {
  storeId: string
  phoneRef: React.RefObject<HTMLInputElement | null>
  onPay: () => void
  onFocusSearch: () => void
}) {
  const { lines, customer, pricing } = useBillPricing()
  const { setLineQuantity } = useBillActions(storeId)
  const lastAddedId = usePosStore((s) => s.lastAddedId)
  const listRef = useRef<HTMLUListElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  // Keep the last scanned line in view.
  useEffect(() => {
    if (!lastAddedId) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-product-id="${lastAddedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [lastAddedId, lines])

  const empty = pricing.lines.length === 0

  const hold = () => {
    if (empty) {
      toast.error("Hoá đơn đang trống, chưa có gì để tạm giữ")
      return
    }
    const bill = usePosStore.getState().holdBill()
    if (!bill) toast.error("Đã giữ tối đa 10 bill, hãy thanh toán hoặc xoá bớt bill đang giữ")
    else toast.success(`Đã tạm giữ bill ${formatVND(pricing.total)}`)
    onFocusSearch()
  }

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l bg-white xl:w-[420px]" aria-label="Hoá đơn">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <ReceiptTextIcon className="size-4 text-brand" />
          <h2 className="text-[15px] font-semibold">Hoá đơn</h2>
          {!empty ? (
            <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {formatNumber(pricing.itemCount)} sản phẩm
            </span>
          ) : null}
        </div>
        <HeldBillsPopover />
      </div>

      <CustomerLookup customer={customer} phoneRef={phoneRef} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShoppingBasketIcon className="size-6" />
            </span>
            <p className="text-sm font-medium">Chưa có sản phẩm</p>
            <p className="text-xs text-muted-foreground">
              Quét mã vạch hoặc bấm vào sản phẩm bên trái để thêm vào hoá đơn.
            </p>
          </div>
        ) : (
          <ul ref={listRef} className="divide-y">
            {pricing.lines.map((line, i) => (
              <BillLine
                key={line.productId}
                index={i + 1}
                line={line}
                highlighted={line.productId === lastAddedId}
                onQuantity={(q) => setLineQuantity(line.product, q)}
                onRemove={() => {
                  usePosStore.getState().remove(line.productId)
                  onFocusSearch()
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t bg-white px-4 pt-3 pb-4">
        <PromoCodeRow pricing={pricing} disabled={empty} />
        <Totals pricing={pricing} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" disabled={!lines.length} onClick={() => setConfirmClear(true)}>
            <Trash2Icon /> Huỷ bill
          </Button>
          <Button variant="outline" size="lg" disabled={empty} onClick={hold}>
            <CirclePauseIcon /> Tạm giữ
          </Button>
        </div>
        <Button
          size="lg"
          className="h-12 w-full justify-between rounded-xl px-4 text-base"
          disabled={empty}
          onClick={onPay}
        >
          <span className="flex items-center gap-2">
            Thanh toán
            <Kbd className="bg-white/20 text-white">F9</Kbd>
          </span>
          <span className="tabular font-bold">{formatVND(pricing.total)}</span>
        </Button>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Huỷ hoá đơn đang bán?</AlertDialogTitle>
            <AlertDialogDescription>
              {pricing.itemCount} sản phẩm
              {customer ? `, khách hàng ${customer.fullName}` : ""} và mã khuyến mãi sẽ bị xoá khỏi hoá đơn. Tồn kho
              không thay đổi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                usePosStore.getState().clearBill()
                toast("Đã huỷ hoá đơn")
                onFocusSearch()
              }}
            >
              Huỷ bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}

function BillLine({
  index,
  line,
  highlighted,
  onQuantity,
  onRemove,
}: {
  index: number
  line: PricedLine
  highlighted: boolean
  onQuantity: (quantity: number) => void
  onRemove: () => void
}) {
  const discounted = line.lineDiscount > 0
  return (
    <li
      data-product-id={line.productId}
      className={cn("flex gap-3 px-4 py-2.5 transition-colors", highlighted && "bg-brand-soft/70")}
    >
      <div className="relative shrink-0">
        <ProductImage
          src={line.product.image}
          alt={line.product.name}
          size={44}
          className="size-11 rounded-lg bg-white ring-1 ring-border"
        />
        <span className="tabular absolute -top-1.5 -left-1.5 flex size-4.5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-white">
          {index}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px] font-medium">{line.product.name}</p>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Xoá ${line.product.name}`}
            className="-mt-0.5 -mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <QuantityStepper quantity={line.quantity} onChange={onQuantity} label={line.product.name} />
          <div className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">
            <span className={cn("tabular", line.salePrice < line.unitPrice && "font-medium text-red")}>
              {formatNumber(line.salePrice)}
            </span>
            {line.salePrice < line.unitPrice ? (
              <span className="tabular ml-1 line-through">{formatNumber(line.unitPrice)}</span>
            ) : null}
            <span> / {line.product.unit}</span>
          </div>
          <div className="text-right">
            <div className="tabular text-sm font-semibold">{formatVND(line.lineTotal)}</div>
            {discounted ? (
              <div className="tabular text-[11px] leading-3 text-muted-foreground line-through">
                {formatNumber(line.lineSubtotal)}
              </div>
            ) : null}
          </div>
        </div>
        {line.promoLabel ? (
          <span className="mt-1.5 inline-flex rounded bg-sale-soft px-1.5 py-0.5 text-[11px] leading-none font-medium text-sale">
            {line.promoLabel} · -{formatNumber(line.lineDiscount)}
          </span>
        ) : null}
      </div>
    </li>
  )
}

function QuantityStepper({
  quantity,
  onChange,
  label,
}: {
  quantity: number
  onChange: (quantity: number) => void
  label: string
}) {
  const commit = (input: HTMLInputElement) => {
    const next = Number(input.value.replace(/\D/g, ""))
    if (!next || next === quantity) input.value = String(quantity)
    else onChange(next)
  }
  return (
    <div className="flex h-7 shrink-0 items-center rounded-lg bg-white ring-1 ring-border">
      <button
        type="button"
        aria-label={`Giảm số lượng ${label}`}
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
        className="flex h-full w-7 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <MinusIcon className="size-3.5" />
      </button>
      <input
        // Remount when the quantity changes elsewhere (scan, +/−) so the draft resets.
        key={quantity}
        defaultValue={quantity}
        inputMode="numeric"
        aria-label={`Số lượng ${label}`}
        onBlur={(e) => commit(e.currentTarget)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit(e.currentTarget)
          }
        }}
        className="tabular h-full w-8 border-x bg-transparent text-center text-sm font-semibold outline-none focus:bg-brand-soft/60"
      />
      <button
        type="button"
        aria-label={`Tăng số lượng ${label}`}
        onClick={() => onChange(quantity + 1)}
        className="flex h-full w-7 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  )
}

function PromoCodeRow({ pricing, disabled }: { pricing: PricingResult; disabled: boolean }) {
  const promoCode = usePosStore((s) => s.promoCode)
  const [draft, setDraft] = useState("")

  if (promoCode) {
    // An empty bill can't qualify for anything yet — don't shout an error at the cashier.
    const error = disabled ? undefined : pricing.codeError
    const applied = pricing.discounts.find((d) => d.kind === "code")
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1",
          error ? "bg-red-soft ring-red/20" : "bg-brand-soft ring-brand/20",
        )}
      >
        <TicketPercentIcon className={cn("size-4 shrink-0", error ? "text-destructive" : "text-brand")} />
        <div className="min-w-0 flex-1 leading-tight">
          <span className="font-mono text-[13px] font-semibold">{promoCode}</span>
          <p className={cn("truncate text-xs", error ? "text-destructive" : "text-brand-dark")}>
            {error ??
              (applied
                ? `Đã áp dụng · -${formatVND(applied.amount)}`
                : disabled
                  ? "Sẽ áp dụng khi thêm sản phẩm"
                  : "Đã áp dụng")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Bỏ mã khuyến mãi"
          onClick={() => usePosStore.getState().setPromoCode("")}
        >
          <XIcon />
        </Button>
      </div>
    )
  }

  const apply = () => {
    if (!draft.trim()) return
    usePosStore.getState().setPromoCode(draft)
    setDraft("")
  }

  return (
    <InputGroup className="h-9 bg-white">
      <InputGroupAddon>
        <TicketPercentIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            apply()
          }
        }}
        placeholder="Mã khuyến mãi"
        aria-label="Mã khuyến mãi"
        autoComplete="off"
        spellCheck={false}
        className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton variant="secondary" disabled={disabled || !draft.trim()} onClick={apply}>
          Áp dụng
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

function discountLabel(d: AppliedDiscount) {
  if (d.kind === "flash-sale") return `Flash sale · ${d.label}`
  return d.label
}

function Totals({ pricing }: { pricing: PricingResult }) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Tạm tính</dt>
        <dd className="tabular">{formatVND(pricing.subtotal)}</dd>
      </div>
      {pricing.discounts.map((d) => (
        <div key={`${d.kind}:${d.promotionId}`} className="flex justify-between gap-3">
          <dt className="min-w-0 truncate text-muted-foreground">{discountLabel(d)}</dt>
          <dd className="tabular shrink-0 text-sale">-{formatVND(d.amount)}</dd>
        </div>
      ))}
      <div className="flex items-end justify-between gap-3 border-t border-dashed pt-2">
        <dt className="pb-1 font-semibold">Tổng cộng</dt>
        <dd className="tabular text-[28px] leading-none font-bold text-brand">{formatVND(pricing.total)}</dd>
      </div>
    </dl>
  )
}
