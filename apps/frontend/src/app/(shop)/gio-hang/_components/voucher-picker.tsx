"use client"

import { CalendarClockIcon, CheckCircle2Icon, CircleAlertIcon, TicketPercentIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useCategories } from "@/hooks/use-catalog"
import { formatDate, formatVND } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { effectiveStatus, type PricingResult } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { listVouchers, voucherConditions, voucherExpiry, voucherStub, voucherValueText } from "@/lib/vouchers"
import { useCart } from "@/stores/cart"
import type { Category, Customer, Promotion } from "@/types"

import { Headline } from "../../_components/headline"

export interface VoucherOption {
  promo: Promotion
  /** What this cart saves with the voucher (0 when it can't be used). */
  saving: number
  /** Why it can't be used on this cart; null when it can. */
  reason: string | null
  /** 0–1 toward the minimum order, when that is what's missing. */
  progress?: number
}

/** Online vouchers checked against the cart: usable first (biggest saving first), then the rest. */
export function voucherOptions({
  promotions,
  now,
  customer,
  pricing,
  priceWithCode,
}: {
  promotions: Promotion[]
  now: Date
  customer: Customer | null
  pricing: PricingResult
  priceWithCode: (code: string) => PricingResult
}): VoucherOption[] {
  // The minimum order is checked against the cart after line and member discounts (as in priceCart).
  const base = pricing.subtotal - pricing.discounts.filter((d) => d.kind !== "code").reduce((s, d) => s + d.amount, 0)

  const options = listVouchers(promotions, now, "online", customer?.id).map((promo): VoucherOption => {
    if (effectiveStatus(promo, now) === "scheduled") {
      return { promo, saving: 0, reason: `Chưa đến ngày dùng, bắt đầu từ ${formatDate(promo.startsAt)}` }
    }
    if (promo.tiers.length && !customer) {
      return { promo, saving: 0, reason: "Đăng nhập để dùng voucher dành cho thành viên" }
    }
    if (promo.tiers.length && customer && !promo.tiers.includes(customer.tier)) {
      return { promo, saving: 0, reason: `Hạng ${TIERS[customer.tier].label} của bạn chưa dùng được voucher này` }
    }
    if (promo.minOrderValue && base < promo.minOrderValue) {
      return {
        promo,
        saving: 0,
        reason: `Mua thêm ${formatVND(promo.minOrderValue - base)} để dùng voucher này`,
        progress: Math.max(0, base) / promo.minOrderValue,
      }
    }
    const result = priceWithCode(promo.code!)
    if (result.codeError) return { promo, saving: 0, reason: result.codeError }
    return { promo, saving: result.discounts.find((d) => d.kind === "code")?.amount ?? 0, reason: null }
  })

  const rank = (o: VoucherOption) =>
    o.reason === null ? 0 : o.progress !== undefined ? 1 : effectiveStatus(o.promo, now) === "scheduled" ? 3 : 2
  return options.sort((a, b) => rank(a) - rank(b) || b.saving - a.saving || (b.progress ?? 0) - (a.progress ?? 0))
}

/** "Chọn voucher" dialog: every voucher with its value, conditions and expiry; pick one or type a code. */
export function VoucherPicker({
  open,
  onOpenChange,
  options,
  now,
  priceWithCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: VoucherOption[]
  now: Date
  priceWithCode: (code: string) => PricingResult
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        // Focus the dialog, not the code box: on phones that would pop the keyboard over the list.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
      >
        {/* Mounted only while open, so the selection restarts from the applied voucher each time. */}
        <PickerBody options={options} now={now} priceWithCode={priceWithCode} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  options,
  now,
  priceWithCode,
  onDone,
}: {
  options: VoucherOption[]
  now: Date
  priceWithCode: (code: string) => PricingResult
  onDone: () => void
}) {
  const categories = useCategories()
  const promoCode = useCart((s) => s.promoCode)
  const usable = options.filter((o) => o.reason === null)
  const unusable = options.filter((o) => o.reason !== null)
  const [selected, setSelected] = useState(() => (usable.some((o) => o.promo.code === promoCode) ? promoCode : ""))
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const chosen = usable.find((o) => o.promo.code === selected)
  const bestId = usable.length > 1 && usable[0].saving > 0 ? usable[0].promo.id : null

  const apply = (code: string, saving: number) => {
    useCart.getState().setPromoCode(code)
    toast.success(`Đã áp dụng voucher ${code}`, { description: `Giảm ${formatVND(saving)} cho đơn hàng này` })
    onDone()
  }

  const applyTyped = (e: React.FormEvent) => {
    e.preventDefault()
    const code = draft.trim().toUpperCase()
    if (!code) {
      setError("Nhập mã voucher")
      return
    }
    const result = priceWithCode(code)
    if (result.codeError) {
      setError(result.codeError)
      return
    }
    apply(code, result.discounts.find((d) => d.kind === "code")?.amount ?? 0)
  }

  const remove = () => {
    useCart.getState().setPromoCode("")
    toast.success(`Đã bỏ voucher ${promoCode}`)
    onDone()
  }

  return (
    <>
      <DialogHeader className="gap-1 border-b px-5 pt-5 pb-4 text-left">
        <DialogTitle className="text-lg">Chọn voucher giảm giá</DialogTitle>
        <DialogDescription>
          Mỗi đơn dùng 1 voucher. Flash sale và ưu đãi thành viên được áp dụng tự động, không cần chọn.
        </DialogDescription>
        <form onSubmit={applyTyped} className="mt-2 flex gap-2" noValidate>
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.toUpperCase())
              setError(null)
            }}
            placeholder="Nhập mã voucher"
            aria-label="Mã voucher"
            aria-invalid={!!error}
            autoCapitalize="characters"
            className="h-10 font-medium tracking-wide placeholder:font-normal placeholder:tracking-normal"
          />
          <Button type="submit" variant="outline" className="h-10 shrink-0 px-4">
            Áp dụng
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-4 sm:px-5">
        {options.length ? (
          <RadioGroup value={selected} onValueChange={setSelected} className="gap-5" aria-label="Voucher giảm giá">
            {usable.length ? (
              <VoucherSection title={`Dùng được cho đơn này (${usable.length})`}>
                {usable.map((o) => (
                  <VoucherCard
                    key={o.promo.id}
                    option={o}
                    now={now}
                    categories={categories}
                    best={o.promo.id === bestId}
                  />
                ))}
              </VoucherSection>
            ) : null}
            {unusable.length ? (
              <VoucherSection title={`Chưa dùng được (${unusable.length})`}>
                {unusable.map((o) => (
                  <VoucherCard key={o.promo.id} option={o} now={now} categories={categories} />
                ))}
              </VoucherSection>
            ) : null}
          </RadioGroup>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <TicketPercentIcon className="size-8 text-muted-foreground/60" />
            Hiện chưa có voucher cho đơn online.
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t bg-white px-5 py-3.5">
        <div className="min-w-0 flex-1 text-sm">
          {chosen ? (
            <>
              <p className="truncate">
                Đã chọn <span className="font-semibold">{chosen.promo.code}</span>
              </p>
              <p className="text-xs font-medium text-fresh">Giảm {formatVND(chosen.saving)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">Chưa chọn voucher</p>
          )}
        </div>
        {promoCode ? (
          <Button variant="ghost" onClick={remove} className="shrink-0">
            Bỏ voucher
          </Button>
        ) : null}
        <Button
          disabled={!chosen}
          onClick={() => chosen && apply(chosen.promo.code!, chosen.saving)}
          className="shrink-0 px-5"
        >
          Dùng voucher
        </Button>
      </div>
    </>
  )
}

function VoucherSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function VoucherCard({
  option,
  now,
  categories,
  best = false,
}: {
  option: VoucherOption
  now: Date
  categories: Category[]
  best?: boolean
}) {
  const { promo, reason, saving, progress } = option
  const usable = reason === null
  const stub = voucherStub(promo)
  const expiry = voucherExpiry(promo, now)
  const id = `voucher-${promo.id}`

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex overflow-hidden rounded-xl bg-white ring-1 ring-border transition",
        usable
          ? "cursor-pointer hover:ring-brand/50 has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-brand"
          : "cursor-default",
      )}
    >
      <div
        className={cn(
          "flex w-[84px] shrink-0 flex-col items-center justify-center px-1.5 py-3 text-center sm:w-24",
          usable ? "bg-brand text-white" : "bg-muted text-muted-foreground",
        )}
      >
        <span className="text-[10px] font-semibold tracking-wide uppercase opacity-90">Giảm</span>
        <Headline as="span" className="text-[26px] leading-none sm:text-[28px]">
          {stub.value}
        </Headline>
        {stub.cap ? <span className="mt-1 text-[10px] leading-tight font-medium opacity-90">{stub.cap}</span> : null}
      </div>

      <div className="min-w-0 flex-1 border-l border-dashed border-border p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {best ? (
              <StatusBadge tone="orange" className="mb-1">
                Tiết kiệm nhất
              </StatusBadge>
            ) : null}
            <p className="text-sm font-semibold text-foreground">{voucherValueText(promo)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {promo.name} · Mã <span className="font-mono font-semibold text-foreground">{promo.code}</span>
            </p>
          </div>
          <RadioGroupItem
            id={id}
            value={promo.code!}
            disabled={!usable}
            aria-label={`Chọn voucher ${promo.code}`}
            className="mt-0.5 data-[state=checked]:border-brand data-[state=checked]:bg-brand"
          />
        </div>

        <ul className="mt-2 space-y-0.5 text-xs leading-5 text-foreground/80">
          {voucherConditions(promo, categories).map((condition) => (
            <li key={condition} className="flex gap-1.5">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              {condition}
            </li>
          ))}
          <li className={cn("flex items-center gap-1.5", expiry.urgent && "font-medium text-orange")}>
            <CalendarClockIcon className="size-3.5 shrink-0" />
            {expiry.text}
          </li>
        </ul>

        <div className="mt-2.5 border-t pt-2 text-xs font-medium">
          {usable ? (
            <p className="flex items-center gap-1.5 text-fresh">
              <CheckCircle2Icon className="size-3.5 shrink-0" /> Đơn này được giảm {formatVND(saving)}
            </p>
          ) : (
            <>
              <p className="flex items-start gap-1.5 text-orange">
                <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" /> {reason}
              </p>
              {progress !== undefined ? (
                <Progress
                  value={progress * 100}
                  className="mt-1.5 h-1 bg-muted [&_[data-slot=progress-indicator]]:bg-orange"
                  aria-label="Tiến độ đạt đơn tối thiểu"
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </label>
  )
}
