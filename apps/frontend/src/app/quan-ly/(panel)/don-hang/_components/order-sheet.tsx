"use client"

import {
  BikeIcon,
  BanIcon,
  ClockIcon,
  MapPinIcon,
  PrinterIcon,
  StickyNoteIcon,
  TicketPercentIcon,
  TruckIcon,
  UserRoundIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useProductMap } from "@/hooks/use-catalog"
import { formatDistance } from "@/lib/geo"
import { formatDateTime, formatNumber, formatPhone, formatTime, formatVND } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import {
  canCancelOrder,
  nextOrderStatus,
  ORDER_ACTION_LABEL,
  ORDER_FLOW,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  type Tone,
} from "@/lib/order-status"
import { canManage } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"
import type { Order, OrderEvent, OrderStatus } from "@/types"

import { ReceiptDialog } from "@/components/admin/receipt"

import { CancelOrderDialog } from "./cancel-order-dialog"
import { ChannelChip } from "./order-columns"

const DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  brand: "bg-brand",
  fresh: "bg-fresh",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-red",
  orange: "bg-orange",
}

export function OrderSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  // Keep showing the last order while the sheet slides out.
  const [shown, setShown] = useState(order)
  if (order && order !== shown) setShown(order)
  const current = order ?? shown

  return (
    <Sheet open={!!order} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        // Don't land on "Huỷ đơn" (first button): focus the panel, Tab reaches the actions.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.target as HTMLElement | null)?.focus({ preventScroll: true })
        }}
      >
        {current ? <OrderDetail key={current.id} order={current} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("px-5 py-4", className)}>
      <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon className="size-3.5" /> : null}
        {title}
      </h3>
      {children}
    </section>
  )
}

function OrderDetail({ order }: { order: Order }) {
  const staff = useCurrentStaff()
  const productMap = useProductMap()
  const store = useDb((s) => s.stores.find((st) => st.id === order.storeId))
  const customer = useDb((s) => (order.customerId ? s.customers.find((c) => c.id === order.customerId) : undefined))
  const employee = useDb((s) => (order.employeeId ? s.employees.find((e) => e.id === order.employeeId) : undefined))
  const now = useNow(30_000)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)

  const status = ORDER_STATUS[order.status]
  const payment = PAYMENT_STATUS[order.paymentStatus]
  const next = order.channel === "online" ? nextOrderStatus(order.status) : null
  const canEdit = !!staff && canManage(staff.role, "orders")
  const itemCount = order.items.reduce((s, it) => s + it.quantity, 0)
  const lineDiscount = order.items.reduce((s, it) => s + it.discount, 0)
  const open = order.status !== "completed" && order.status !== "cancelled"
  const late = open && order.delivery && now ? now.getTime() > new Date(order.delivery.eta).getTime() : false
  const lateMinutes =
    late && order.delivery && now ? Math.floor((now.getTime() - new Date(order.delivery.eta).getTime()) / 60_000) : 0
  const upcoming = order.channel === "online" && open ? ORDER_FLOW.slice(ORDER_FLOW.indexOf(order.status) + 1) : []
  const handler = [...order.timeline].reverse().find((e) => e.by)?.by

  const advance = () => {
    if (!next || !staff) return
    useDb.getState().updateOrderStatus(order.id, next, staff.fullName)
    toast.success(`${order.code} · ${ORDER_STATUS[next].label}`)
  }

  return (
    <>
      <SheetHeader className="gap-1.5 border-b px-5 py-4 pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="font-mono text-lg font-semibold tracking-tight">{order.code}</SheetTitle>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ChannelChip channel={order.channel} />
          <span aria-hidden>·</span>
          <span>{store ? `Cửa hàng ${store.code} – ${store.name}` : "—"}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{formatDateTime(order.createdAt)}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 divide-y overflow-y-auto">
        <Section title={order.delivery ? "Khách hàng & giao hàng" : "Khách hàng"} icon={UserRoundIcon}>
          {customer ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{customer.fullName}</span>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold",
                  TIERS[customer.tier].className,
                )}
              >
                {TIERS[customer.tier].label}
              </span>
              <span className="tabular text-sm text-muted-foreground">{formatPhone(customer.phone)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Khách lẻ (không dùng thẻ thành viên)</p>
          )}
          {order.delivery ? (
            <div className="mt-3 grid gap-2 rounded-xl bg-muted/50 p-3 text-sm ring-1 ring-border">
              <p className="flex items-start gap-2">
                <UserRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{order.delivery.recipient}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="tabular">{formatPhone(order.delivery.phone)}</span>
                </span>
              </p>
              <p className="flex items-start gap-2">
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>{order.delivery.address}</span>
              </p>
              {order.delivery.note ? (
                <p className="flex items-start gap-2">
                  <StickyNoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="italic">“{order.delivery.note}”</span>
                </p>
              ) : null}
              {order.delivery.shipperName ? (
                <p className="flex items-start gap-2">
                  <BikeIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>
                    Nhân viên giao: <span className="font-medium">{order.delivery.shipperName}</span>
                    {order.delivery.shipperPhone ? (
                      <span className="text-muted-foreground"> · {formatPhone(order.delivery.shipperPhone)}</span>
                    ) : null}
                    {order.delivery.distanceKm ? (
                      <span className="text-muted-foreground"> · {formatDistance(order.delivery.distanceKm)}</span>
                    ) : null}
                  </span>
                </p>
              ) : null}
              <p className="flex items-center gap-2">
                <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  {order.status === "completed" ? "Hẹn giao" : "Dự kiến giao"} trước{" "}
                  <span className="tabular font-medium">{formatTime(order.delivery.eta)}</span>
                </span>
                {late ? (
                  <StatusBadge tone="danger" className="h-5 px-2 text-[11px]">
                    Trễ {lateMinutes} phút
                  </StatusBadge>
                ) : null}
              </p>
            </div>
          ) : null}
        </Section>

        <Section title={`Sản phẩm (${formatNumber(itemCount)})`}>
          <ul className="space-y-3">
            {order.items.map((it) => (
              <li key={it.productId} className="flex items-center gap-3">
                <ProductImage
                  src={it.image ?? productMap.get(it.productId)?.image}
                  alt={it.name}
                  size={48}
                  className="size-12 shrink-0 rounded-lg bg-white ring-1 ring-border"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-5 font-medium">{it.name}</p>
                  <p className="tabular text-xs text-muted-foreground">
                    {formatNumber(it.quantity)} × {formatVND(it.unitPrice)}
                    {it.discount > 0 ? <span className="ml-1.5 text-sale">-{formatVND(it.discount)}</span> : null}
                  </p>
                </div>
                <span className="tabular text-sm font-semibold">{formatVND(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-dashed pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tạm tính</dt>
              <dd className="tabular">{formatVND(order.subtotal)}</dd>
            </div>
            {order.discount > 0 ? (
              <div className="flex justify-between">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  Giảm giá
                  {order.promotionCode ? (
                    <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 font-mono text-[11px] font-semibold text-brand-dark">
                      <TicketPercentIcon className="size-3" />
                      {order.promotionCode}
                    </span>
                  ) : null}
                  {lineDiscount > 0 && lineDiscount < order.discount ? (
                    <span className="text-xs">(sản phẩm {formatVND(lineDiscount)})</span>
                  ) : null}
                </dt>
                <dd className="tabular text-sale">-{formatVND(order.discount)}</dd>
              </div>
            ) : null}
            {order.channel === "online" ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Phí giao hàng</dt>
                <dd className="tabular">{order.shippingFee ? formatVND(order.shippingFee) : "Miễn phí"}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between pt-1">
              <dt className="font-semibold">Tổng cộng</dt>
              <dd className="tabular text-xl font-bold text-brand">{formatVND(order.total)}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Thanh toán & nhân viên">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Hình thức</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {PAYMENT_METHOD[order.paymentMethod]}
              <StatusBadge tone={payment.tone} className="h-5 px-2 text-[11px]">
                {payment.label}
              </StatusBadge>
            </dd>
            {order.cashReceived !== undefined ? (
              <>
                <dt className="text-muted-foreground">Khách đưa</dt>
                <dd className="tabular">
                  {formatVND(order.cashReceived)}
                  {order.changeGiven ? (
                    <span className="text-muted-foreground"> · trả lại {formatVND(order.changeGiven)}</span>
                  ) : null}
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{order.channel === "in-store" ? "Thu ngân" : "Nhân viên xử lý"}</dt>
            <dd>
              {employee ? (
                <>
                  {employee.fullName} <span className="text-muted-foreground">· {employee.code}</span>
                </>
              ) : (
                (handler ?? <span className="text-muted-foreground">Chưa có</span>)
              )}
            </dd>
            <dt className="text-muted-foreground">Cập nhật</dt>
            <dd className="tabular">{formatDateTime(order.updatedAt)}</dd>
          </dl>
        </Section>

        <Section title="Lịch sử xử lý" icon={TruckIcon}>
          <Timeline events={order.timeline} upcoming={upcoming} />
        </Section>
      </div>

      {canEdit && (next || canCancelOrder(order.status) || order.channel === "in-store") ? (
        <SheetFooter className="mt-0 flex-row items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3 *:max-sm:flex-1">
          {order.channel === "in-store" && order.status === "completed" ? (
            <Button variant="outline" size="lg" onClick={() => setReceiptOpen(true)}>
              <PrinterIcon /> In lại hoá đơn
            </Button>
          ) : null}
          {canCancelOrder(order.status) ? (
            <Button variant="destructive" size="lg" onClick={() => setCancelOpen(true)}>
              <BanIcon /> Huỷ đơn
            </Button>
          ) : null}
          {next ? (
            <Button size="lg" className="sm:min-w-40" onClick={advance}>
              {ORDER_ACTION_LABEL[next]}
            </Button>
          ) : null}
        </SheetFooter>
      ) : null}

      <CancelOrderDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} />
      <ReceiptDialog
        order={order}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        title="In lại hoá đơn"
        description={`${order.code} · ${formatVND(order.total)}`}
        icon={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <PrinterIcon className="size-5" />
          </span>
        }
      />
    </>
  )
}

type TimelineStep = { kind: "done"; event: OrderEvent } | { kind: "next"; status: OrderStatus }

/** Vertical timeline: what happened (who / when / note), then the steps still ahead in grey. */
function Timeline({ events, upcoming }: { events: OrderEvent[]; upcoming: OrderStatus[] }) {
  const steps: TimelineStep[] = [
    ...events.map((event): TimelineStep => ({ kind: "done", event })),
    ...upcoming.map((status): TimelineStep => ({ kind: "next", status })),
  ]
  return (
    <ol>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const status = step.kind === "done" ? step.event.status : step.status
        const info = ORDER_STATUS[status]
        const current = step.kind === "done" && steps[i + 1]?.kind !== "done"
        return (
          <li key={`${status}-${i}`} className="flex gap-3">
            <div className="flex w-3 flex-col items-center">
              <span
                className={cn(
                  "mt-1 size-3 shrink-0 rounded-full",
                  step.kind === "done" ? DOT[info.tone] : "border-2 border-dashed border-muted-foreground/40 bg-white",
                  current && "ring-4 ring-muted",
                )}
              />
              {!isLast ? (
                <span
                  className={cn(
                    "my-1 w-px flex-1",
                    steps[i + 1]?.kind === "done" ? "bg-border" : "border-l border-dashed border-muted-foreground/30",
                  )}
                />
              ) : null}
            </div>
            <div className={cn("min-w-0 flex-1", !isLast && "pb-4")}>
              {step.kind === "done" ? (
                <>
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-5">
                    <span className="font-medium">{info.label}</span>
                    <span className="tabular text-xs text-muted-foreground">{formatDateTime(step.event.at)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {step.event.by ?? (step.event.status === "pending" ? "Khách đặt hàng online" : "Hệ thống")}
                  </p>
                  {step.event.note ? (
                    <p className="mt-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-foreground">
                      {step.event.note}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm leading-5 text-muted-foreground">{info.label}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
