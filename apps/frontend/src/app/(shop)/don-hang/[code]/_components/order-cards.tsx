"use client"

import {
  BikeIcon,
  BanknoteIcon,
  CreditCardIcon,
  LockIcon,
  type LucideIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PhoneIcon,
  QrCodeIcon,
  StoreIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react"
import Link from "next/link"

import { Panel } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useProductMap } from "@/hooks/use-catalog"
import { formatDistance } from "@/lib/geo"
import { formatPhone, formatVND } from "@/lib/format"
import { PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import type { DeliveryInfo, Order, PaymentMethod, Store } from "@/types"

const PAYMENT_ICON: Record<PaymentMethod, LucideIcon> = {
  cash: BanknoteIcon,
  cod: BanknoteIcon,
  card: CreditCardIcon,
  ewallet: WalletIcon,
  "bank-transfer": QrCodeIcon,
}

export function OrderItems({ order }: { order: Order }) {
  const productMap = useProductMap()
  const units = order.items.reduce((sum, it) => sum + it.quantity, 0)

  return (
    <Panel
      title={
        <>
          Sản phẩm <span className="font-normal text-muted-foreground">({units})</span>
        </>
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {order.items.map((item) => {
          const product = productMap.get(item.productId)
          return (
            <li key={item.productId} className="flex items-center gap-3 px-4 py-3">
              <span className="shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border/70">
                <ProductImage
                  src={item.image ?? product?.image}
                  alt={item.name}
                  size={64}
                  className="size-14 sm:size-16"
                />
              </span>
              <div className="min-w-0 flex-1">
                {product ? (
                  <Link
                    href={`/san-pham/${product.slug}`}
                    className="line-clamp-2 text-sm leading-5 font-medium hover:text-brand"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <p className="line-clamp-2 text-sm leading-5 font-medium">{item.name}</p>
                )}
                <p className="tabular mt-0.5 text-xs text-muted-foreground">
                  {formatVND(item.unitPrice)} × {item.quantity}
                </p>
                {item.discount > 0 ? (
                  <p className="tabular text-xs font-medium text-sale">Đã giảm {formatVND(item.discount)}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                {item.discount > 0 ? (
                  <p className="tabular text-xs text-muted-foreground line-through">
                    {formatVND(item.lineTotal + item.discount)}
                  </p>
                ) : null}
                <p className="tabular text-sm font-semibold">{formatVND(item.lineTotal)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function StoreCard({ store }: { store: Store }) {
  return (
    <Panel title="Cửa hàng phục vụ" bodyClassName="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <StoreIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {store.code} – {store.name}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {store.address}, {store.ward}, {store.province}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">Mở cửa {store.openHours}</p>
        </div>
      </div>
      <Button asChild variant="outline" className="h-9 w-full">
        <a href={`tel:${store.phone}`}>
          <PhoneIcon /> Gọi cửa hàng {formatPhone(store.phone)}
        </a>
      </Button>
    </Panel>
  )
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 7 ? `${digits.slice(0, 4)} *** ${digits.slice(-3)}` : "***"
}

/** Shoppers who don't own the order (or are signed out) only see a masked phone and area. */
export function DeliveryCard({ delivery, masked }: { delivery: DeliveryInfo; masked: boolean }) {
  const address = masked ? delivery.address.split(", ").slice(1).join(", ") || "***" : delivery.address
  return (
    <Panel title="Thông tin nhận hàng" bodyClassName="space-y-2.5 p-4 text-sm">
      <p className="flex gap-2.5">
        <UserRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-medium">{delivery.recipient}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular">{masked ? maskPhone(delivery.phone) : formatPhone(delivery.phone)}</span>
        </span>
      </p>
      <p className="flex gap-2.5">
        <MapPinIcon className="mt-0.5 size-4 shrink-0 text-orange" />
        <span>{address}</span>
      </p>
      {delivery.note && !masked ? (
        <p className="flex gap-2.5">
          <MessageSquareTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{delivery.note}</span>
        </p>
      ) : null}
      {delivery.shipperName ? (
        <div className="flex gap-2.5 border-t pt-2.5">
          <BikeIcon className="mt-0.5 size-4 shrink-0 text-brand" />
          <span className="min-w-0">
            <span className="font-medium">Nhân viên giao hàng</span>
            <span className="block text-muted-foreground">
              {delivery.shipperName}
              {delivery.shipperPhone
                ? ` · ${masked ? maskPhone(delivery.shipperPhone) : formatPhone(delivery.shipperPhone)}`
                : ""}
              {delivery.distanceKm ? ` · ${formatDistance(delivery.distanceKm)}` : ""}
            </span>
          </span>
        </div>
      ) : null}
      {masked ? (
        <p className="flex gap-2.5 text-xs text-muted-foreground">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          Đăng nhập bằng tài khoản đã đặt đơn để xem đầy đủ thông tin nhận hàng.
        </p>
      ) : null}
    </Panel>
  )
}

export function PaymentCard({ order }: { order: Order }) {
  const Icon = PAYMENT_ICON[order.paymentMethod]
  const itemDiscount = order.items.reduce((sum, it) => sum + it.discount, 0)
  const orderDiscount = Math.max(0, order.discount - itemDiscount)
  const payment = PAYMENT_STATUS[order.paymentStatus]

  return (
    <Panel title="Thanh toán" bodyClassName="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Icon className="size-4 shrink-0 text-brand" />
          <span className="truncate">{PAYMENT_METHOD[order.paymentMethod]}</span>
        </p>
        <StatusBadge tone={payment.tone}>{payment.label}</StatusBadge>
      </div>
      <Separator />
      <dl className="space-y-2 text-sm">
        <Row label="Tạm tính" value={formatVND(order.subtotal)} />
        {itemDiscount > 0 ? (
          <Row label="Giảm giá sản phẩm" value={`-${formatVND(itemDiscount)}`} valueClassName="text-sale" />
        ) : null}
        {orderDiscount > 0 ? (
          <Row
            label={order.promotionCode ? `Ưu đãi đơn hàng (mã ${order.promotionCode})` : "Ưu đãi thành viên"}
            value={`-${formatVND(orderDiscount)}`}
            valueClassName="text-sale"
          />
        ) : null}
        {order.channel === "online" ? (
          <Row
            label="Phí giao hàng"
            value={order.shippingFee > 0 ? formatVND(order.shippingFee) : "Miễn phí"}
            valueClassName={order.shippingFee > 0 ? undefined : "text-fresh font-semibold"}
          />
        ) : null}
      </dl>
      <Separator />
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">Tổng cộng</span>
        <span className="tabular text-xl font-bold text-brand">{formatVND(order.total)}</span>
      </div>
    </Panel>
  )
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular shrink-0 text-right font-medium", valueClassName)}>{value}</dd>
    </div>
  )
}
