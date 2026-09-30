"use client"

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, SearchXIcon, StarIcon } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/format"
import { CHANNEL, ORDER_STATUS } from "@/lib/order-status"
import { useDb } from "@/stores/db"
import { useDbReady, useHydrated, useNow } from "@/stores/hydration"
import { useCurrentCustomer } from "@/stores/session"
import type { Order, OrderStatus, Store } from "@/types"

import { CancelOrderButton, ReorderButton } from "./order-actions"
import { DeliveryCard, OrderItems, PaymentCard, StoreCard } from "./order-cards"
import { OrderProgress } from "./order-progress"

const STATUS_TOAST: Partial<Record<OrderStatus, string>> = {
  confirmed: "Cửa hàng đã xác nhận đơn hàng của bạn",
  preparing: "Đơn hàng đang được chuẩn bị",
  delivering: "Shipper đang giao hàng tới bạn",
  completed: "Đơn hàng đã được giao thành công",
  cancelled: "Đơn hàng đã được huỷ",
}

export function OrderSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Đang tải đơn hàng">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-60" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function OrderView() {
  const params = useParams<{ code: string }>()
  const searchParams = useSearchParams()
  const code = (params.code ?? "").toUpperCase()
  const justPlaced = searchParams.get("moi") === "1"
  const hydrated = useHydrated()
  const dbReady = useDbReady()
  const orders = useDb((s) => s.orders)
  const order = useMemo(() => orders.find((o) => o.code.toUpperCase() === code), [orders, code])

  if (!hydrated || !dbReady) return <OrderSkeleton />
  if (!order) return <OrderNotFound code={code} />
  return <OrderDetail key={order.id} order={order} justPlaced={justPlaced} />
}

function OrderDetail({ order, justPlaced }: { order: Order; justPlaced: boolean }) {
  const stores = useDb((s) => s.stores)
  const store = stores.find((s) => s.id === order.storeId)
  const customer = useCurrentCustomer()
  const isOwner = !!customer && customer.id === order.customerId
  const now = useNow(15_000)
  const status = ORDER_STATUS[order.status]
  const units = order.items.reduce((sum, it) => sum + it.quantity, 0)

  // Staff move the order along in the back office (other tab / device): tell the shopper.
  const lastStatus = useRef(order.status)
  useEffect(() => {
    if (lastStatus.current === order.status) return
    lastStatus.current = order.status
    const message = STATUS_TOAST[order.status]
    if (!message) return
    if (order.status === "cancelled") toast(message, { description: order.code })
    else toast.success(message, { description: order.code })
  }, [order.status, order.code])

  return (
    <div className="space-y-5">
      {justPlaced && order.channel === "online" && order.status !== "cancelled" && order.status !== "completed" ? (
        <PlacedBanner
          store={store}
          confirmed={order.status !== "pending"}
          firstName={isOwner ? customer.fullName.trim().split(/\s+/).pop() : undefined}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href={customer ? "/tai-khoan?tab=don-hang" : "/"}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-brand"
          >
            <ChevronLeftIcon className="size-4" /> {customer ? "Đơn hàng của tôi" : "Trang chủ"}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xl font-bold md:text-2xl">
            Đơn hàng {order.code}
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đặt lúc {formatDateTime(order.createdAt)} · {CHANNEL[order.channel]} · {units} sản phẩm
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner && order.status === "pending" ? (
            <CancelOrderButton order={order} customerName={customer.fullName} />
          ) : null}
          <ReorderButton order={order} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <OrderProgress order={order} now={now} />
          <OrderItems order={order} />
        </div>
        <div className="space-y-5">
          {store ? <StoreCard store={store} /> : null}
          {order.delivery ? <DeliveryCard delivery={order.delivery} masked={!isOwner} /> : null}
          <PaymentCard order={order} />
          {isOwner && order.starsEarned && order.status !== "cancelled" ? (
            <Link
              href="/tai-khoan?tab=sao-vang"
              className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200/70 transition hover:bg-amber-100/60"
            >
              <StarIcon className="size-5 shrink-0 fill-amber-400 text-amber-500" />
              <span className="min-w-0 flex-1 text-sm">
                Đơn này tích thêm <span className="font-semibold">{order.starsEarned} sao vàng</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PlacedBanner({
  store,
  confirmed,
  firstName,
}: {
  store: Store | undefined
  confirmed: boolean
  firstName?: string
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl bg-fresh-soft p-4 ring-1 ring-fresh/25 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-0.5 sm:p-5">
      <span className="flex size-11 items-center justify-center rounded-full bg-fresh text-white sm:row-span-2 sm:size-12">
        <CheckIcon className="size-6" strokeWidth={3} />
      </span>
      <h2 className="text-lg font-bold sm:self-end">Đặt hàng thành công</h2>
      <p className="col-span-2 text-sm leading-6 text-foreground/80 sm:col-span-1 sm:col-start-2 sm:self-start">
        {firstName ? `Cảm ơn ${firstName}! ` : "Cảm ơn bạn! "}
        {store ? `Cửa hàng ${store.code} – ${store.name}` : "Cửa hàng"}
        {confirmed
          ? " đã nhận đơn, bạn theo dõi tiến trình giao hàng ngay bên dưới."
          : " đang xác nhận đơn và sẽ giao tới bạn trong khoảng 24 phút."}
      </p>
      <Button
        asChild
        variant="outline"
        className="col-span-2 mt-1 h-9 bg-white sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0"
      >
        <Link href="/">Tiếp tục mua sắm</Link>
      </Button>
    </div>
  )
}

function OrderNotFound({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl px-6 py-14 text-center ring-1 ring-border md:py-20">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchXIcon className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-bold">Không tìm thấy đơn hàng {code}</h1>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
        Mã đơn có thể bị nhập sai. Kiểm tra lại mã trong tin nhắn xác nhận hoặc xem danh sách đơn trong tài khoản của
        bạn.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild className="h-10 px-5">
          <Link href="/tai-khoan?tab=don-hang">Đơn hàng của tôi</Link>
        </Button>
        <Button asChild variant="outline" className="h-10 px-5">
          <Link href="/">Về trang chủ</Link>
        </Button>
      </div>
    </div>
  )
}
