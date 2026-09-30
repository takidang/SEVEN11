"use client"

import { BadgeCheckIcon, BadgePercentIcon, ChevronRightIcon, TicketPercentIcon, TruckIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { Panel } from "@/components/admin/page-header"
import { StarCount } from "@/components/shop/star-rewards"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { formatVND } from "@/lib/format"
import { MAX_DRINK_VOUCHERS_PER_ORDER, TIERS } from "@/lib/membership"
import {
  type AppliedDiscount,
  FREE_SHIPPING_FROM,
  isPromotionLive,
  type PricingResult,
  SHIPPING_FEE,
} from "@/lib/pricing"
import { earnStars, spendToNextStar } from "@/lib/stars"
import { cn } from "@/lib/utils"
import { useCart } from "@/stores/cart"
import type { Customer, Promotion } from "@/types"

import { SIGN_IN_TO_CHECKOUT } from "./checkout-form"
import { VoucherPicker, voucherOptions } from "./voucher-picker"

function discountLabel(discount: AppliedDiscount) {
  return discount.kind === "flash-sale" ? `Flash sale ${discount.label}` : discount.label
}

export function OrderSummary({
  pricing,
  priceWithCode,
  promotions,
  customer,
  now,
  onPlaceOrder,
}: {
  pricing: PricingResult
  /** Prices the current cart with another promotion code (to validate before applying). */
  priceWithCode: (code: string) => PricingResult
  promotions: Promotion[]
  customer: Customer | null
  now: Date
  onPlaceOrder: () => void
}) {
  return (
    <Panel title="Tóm tắt đơn hàng" bodyClassName="space-y-4 p-4">
      <VoucherField
        pricing={pricing}
        priceWithCode={priceWithCode}
        promotions={promotions}
        customer={customer}
        now={now}
      />

      <Separator />

      <dl className="space-y-2.5 text-sm">
        <SummaryRow label={`Tạm tính (${pricing.itemCount} sản phẩm)`} value={formatVND(pricing.subtotal)} />
        {pricing.discounts.map((d) => (
          <SummaryRow
            key={`${d.kind}:${d.promotionId}`}
            label={discountLabel(d)}
            value={`-${formatVND(d.amount)}`}
            valueClassName="text-sale"
          />
        ))}
        <SummaryRow
          label="Phí giao hàng"
          value={
            pricing.shippingFee > 0 ? (
              formatVND(pricing.shippingFee)
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-xs font-normal text-muted-foreground line-through">
                  {formatVND(SHIPPING_FEE)}
                </span>
                <span className="font-semibold text-fresh">Miễn phí</span>
              </span>
            )
          }
        />
      </dl>

      <FreeShippingProgress pricing={pricing} />

      <Separator />

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">Tổng cộng</span>
          <span className="tabular text-2xl font-bold text-brand">{formatVND(pricing.total)}</span>
        </div>
        {pricing.discountTotal > 0 ? (
          <p className="mt-0.5 text-right text-xs font-medium text-sale">
            Bạn tiết kiệm {formatVND(pricing.discountTotal)}
          </p>
        ) : null}
        {customer ? <StarsPreview customer={customer} spend={pricing.eligibleSpend} /> : null}
      </div>

      <PlaceOrderButton customer={customer} onPlaceOrder={onPlaceOrder} className="hidden xl:inline-flex" />
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Giá đã gồm VAT. Hạng thành viên tính trên giá trị đơn sau giảm giá, không gồm đồ uống có cồn.
      </p>
    </Panel>
  )
}

/** Gold stars this order will add (1 per STAR_SPEND, carrying the member's remainder). */
function StarsPreview({ customer, spend }: { customer: Customer; spend: number }) {
  const { stars } = earnStars(customer.starCarry, spend)
  return (
    <p className="mt-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
      {stars > 0 ? (
        <>
          Đơn này tích thêm <StarCount value={stars} className="text-amber-700" /> sao vàng
        </>
      ) : (
        <>Chi tiêu thêm {formatVND(spendToNextStar(customer.starCarry) - spend)} để nhận thêm 1 sao vàng</>
      )}
    </p>
  )
}

function SummaryRow({
  label,
  value,
  valueClassName,
}: {
  label: React.ReactNode
  value: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular shrink-0 text-right font-medium text-foreground", valueClassName)}>{value}</dd>
    </div>
  )
}

function FreeShippingProgress({ pricing }: { pricing: PricingResult }) {
  if (pricing.freeShipping) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-fresh-soft px-3 py-2 text-xs font-medium">
        <BadgeCheckIcon className="size-4 shrink-0 text-fresh" /> Đơn hàng được miễn phí giao hàng
      </p>
    )
  }
  const payable = pricing.total - pricing.shippingFee
  const missing = Math.max(0, FREE_SHIPPING_FROM - payable)
  return (
    <div className="rounded-lg bg-muted/70 px-3 py-2.5">
      <p className="flex items-center gap-2 text-xs">
        <TruckIcon className="size-4 shrink-0 text-fresh" />
        <span>
          Mua thêm <span className="font-semibold">{formatVND(missing)}</span> để được miễn phí giao hàng
        </span>
      </p>
      <Progress
        value={Math.min(100, (payable / FREE_SHIPPING_FROM) * 100)}
        className="mt-2 h-1.5 bg-white [&_[data-slot=progress-indicator]]:bg-fresh"
        aria-label="Tiến độ miễn phí giao hàng"
      />
    </div>
  )
}

function PlaceOrderButton({
  customer,
  onPlaceOrder,
  className,
}: {
  customer: Customer | null
  onPlaceOrder: () => void
  className?: string
}) {
  if (!customer) {
    return (
      <Button asChild className={cn("h-11 w-full text-[15px]", className)}>
        <Link href={SIGN_IN_TO_CHECKOUT}>Đăng nhập để đặt hàng</Link>
      </Button>
    )
  }
  return (
    <Button className={cn("h-11 w-full text-[15px]", className)} onClick={onPlaceOrder}>
      Đặt hàng
    </Button>
  )
}

/** Sticky bottom bar below xl, where the summary is not beside the form. */
export function MobileCheckoutBar({
  pricing,
  customer,
  onPlaceOrder,
}: {
  pricing: PricingResult
  customer: Customer | null
  onPlaceOrder: () => void
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 border-t bg-white px-4 py-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] lg:-mx-5 lg:px-5 xl:hidden">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Tổng cộng · {pricing.itemCount} sản phẩm</p>
          <p className="tabular text-lg leading-6 font-bold text-brand">{formatVND(pricing.total)}</p>
        </div>
        <PlaceOrderButton customer={customer} onPlaceOrder={onPlaceOrder} className="w-auto px-6" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Voucher
// ---------------------------------------------------------------------------

function VoucherField({
  pricing,
  priceWithCode,
  promotions,
  customer,
  now,
}: {
  pricing: PricingResult
  priceWithCode: (code: string) => PricingResult
  promotions: Promotion[]
  customer: Customer | null
  now: Date
}) {
  const promoCode = useCart((s) => s.promoCode)
  const [open, setOpen] = useState(false)

  const codeDiscount = pricing.discounts.find((d) => d.kind === "code")
  const memberDiscount = pricing.discounts.find((d) => d.kind === "member")
  const options = voucherOptions({ promotions, now, customer, pricing, priceWithCode })
  const usableCount = options.filter((o) => o.reason === null).length

  const memberVoucherLive = useMemo(
    () =>
      !!customer &&
      promotions.some(
        (p) => p.type === "member-voucher" && p.tiers.includes(customer.tier) && isPromotionLive(p, now, "online"),
      ),
    [promotions, now, customer],
  )

  return (
    <div className="space-y-2.5">
      {promoCode ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg py-2 pr-1.5 pl-3 ring-1",
            pricing.codeError ? "bg-red-soft/70 ring-red/25" : "bg-brand-soft ring-brand/20",
          )}
        >
          <TicketPercentIcon className={cn("size-5 shrink-0", pricing.codeError ? "text-red" : "text-brand")} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-wide">Voucher {promoCode}</p>
            <p className={cn("text-xs", pricing.codeError ? "text-foreground" : "text-muted-foreground")}>
              {pricing.codeError
                ? `Chưa áp dụng được: ${pricing.codeError}`
                : `Đã giảm ${formatVND(codeDiscount?.amount ?? 0)}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            aria-label="Đổi voucher"
            className="shrink-0 text-brand"
          >
            Đổi
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useCart.getState().setPromoCode("")}
            aria-label="Gỡ voucher"
            className="shrink-0"
          >
            Gỡ
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-brand/40 bg-brand-soft/40 px-3 py-2.5 text-left transition hover:border-brand hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand ring-1 ring-brand/20">
            <TicketPercentIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-brand">Thêm voucher giảm giá</span>
            <span className="block text-xs text-muted-foreground">
              {usableCount
                ? `${usableCount} voucher dùng được cho đơn này`
                : options.length
                  ? `${options.length} voucher · xem điều kiện áp dụng`
                  : "Hiện chưa có voucher"}
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {memberDiscount ? (
        <p className="flex items-start gap-2 text-xs leading-5">
          <BadgePercentIcon className="mt-0.5 size-4 shrink-0 text-brand" />
          Đã tự động áp dụng {memberDiscount.label.charAt(0).toLowerCase() + memberDiscount.label.slice(1)}.
        </p>
      ) : customer && memberVoucherLive ? (
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <BadgePercentIcon className="mt-0.5 size-4 shrink-0 text-brand" />
          Hạng {TIERS[customer.tier].label}: giảm {formatVND(TIERS[customer.tier].drinkVoucher)} mỗi ly trà sữa, trà
          trái cây, cà phê (tối đa {MAX_DRINK_VOUCHERS_PER_ORDER} ly/đơn), tự áp dụng khi có trong giỏ.
        </p>
      ) : !customer ? (
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <BadgePercentIcon className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            <Link href={SIGN_IN_TO_CHECKOUT} className="font-medium text-brand hover:underline">
              Đăng nhập
            </Link>{" "}
            để dùng voucher thành viên, giảm đến {formatVND(TIERS.diamond.drinkVoucher)} mỗi ly đồ uống.
          </span>
        </p>
      ) : null}

      <VoucherPicker open={open} onOpenChange={setOpen} options={options} now={now} priceWithCode={priceWithCode} />
    </div>
  )
}
