"use client"

import {
  BikeIcon,
  CheckIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  HouseIcon,
  type LucideIcon,
  PackageIcon,
  StoreIcon,
  TimerIcon,
  XIcon,
} from "lucide-react"

import { Panel } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { formatDateTime, formatTime } from "@/lib/format"
import { ORDER_FLOW, ORDER_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import type { Order, OrderEvent, OrderStatus } from "@/types"

const STEP_ICON: Record<OrderStatus, LucideIcon> = {
  pending: ClipboardListIcon,
  confirmed: CircleCheckIcon,
  preparing: PackageIcon,
  delivering: BikeIcon,
  completed: HouseIcon,
  cancelled: XIcon,
}

const HEADLINE: Record<Exclude<OrderStatus, "cancelled">, { title: string; description: string }> = {
  pending: { title: "Đang chờ cửa hàng xác nhận", description: "Cửa hàng sẽ xác nhận đơn của bạn trong ít phút." },
  confirmed: { title: "Cửa hàng đã nhận đơn", description: "Nhân viên sắp bắt đầu chuẩn bị hàng cho bạn." },
  preparing: { title: "Đang chuẩn bị hàng", description: "Sản phẩm của bạn đang được lấy và đóng gói cẩn thận." },
  delivering: {
    title: "Đơn hàng đang được giao",
    description: "Shipper đang trên đường tới, bạn để ý điện thoại nhé.",
  },
  completed: { title: "Giao hàng thành công", description: "Cảm ơn bạn đã mua sắm tại 7-Eleven." },
}

/** Latest timeline event for a status (a status can only be reached once, but be safe). */
function eventFor(timeline: OrderEvent[], status: OrderStatus) {
  return timeline.findLast((e) => e.status === status)
}

export function OrderProgress({ order, now }: { order: Order; now: Date | null }) {
  if (order.channel === "in-store") {
    return (
      <Panel bodyClassName="flex items-center gap-3 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <StoreIcon className="size-5" />
        </span>
        <div>
          <p className="font-semibold">Đã mua tại cửa hàng</p>
          <p className="text-sm text-muted-foreground">Thanh toán tại quầy lúc {formatDateTime(order.createdAt)}.</p>
        </div>
      </Panel>
    )
  }

  if (order.status === "cancelled") return <CancelledState order={order} />

  const currentIndex = ORDER_FLOW.indexOf(order.status)
  const headline = HEADLINE[order.status]
  const HeadlineIcon = STEP_ICON[order.status]

  return (
    <Panel bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b p-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            order.status === "completed" ? "bg-fresh text-white" : "bg-brand-soft text-brand",
          )}
        >
          <HeadlineIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{headline.title}</p>
          <p className="text-sm text-muted-foreground">{headline.description}</p>
        </div>
        <Eta order={order} now={now} />
      </div>

      <ol className="grid grid-cols-1 p-4 sm:grid-cols-5 sm:px-2 sm:py-5" aria-label="Tiến trình đơn hàng">
        {ORDER_FLOW.map((status, i) => {
          const event = eventFor(order.timeline, status)
          const done = i < currentIndex || (i === currentIndex && status === "completed")
          const current = i === currentIndex && !done
          const Icon = STEP_ICON[status]
          return (
            <li
              key={status}
              aria-current={current ? "step" : undefined}
              className="relative flex gap-3 pb-6 last:pb-0 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
            >
              {i < ORDER_FLOW.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-10 bottom-1 left-[19px] w-0.5 rounded-full sm:top-[19px] sm:bottom-auto sm:left-[calc(50%+26px)] sm:h-0.5 sm:w-[calc(100%-52px)]",
                    i < currentIndex ? "bg-brand" : "bg-border",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative flex size-10 shrink-0 items-center justify-center rounded-full transition",
                  done && "bg-brand text-white",
                  current && "bg-brand-soft text-brand ring-2 ring-brand",
                  !done && !current && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-5" strokeWidth={2.5} /> : <Icon className="size-5" />}
              </span>
              <div className="min-w-0 pt-1 sm:pt-0">
                <p className={cn("text-sm font-medium", !done && !current && "text-muted-foreground")}>
                  {ORDER_STATUS[status].label}
                </p>
                <p className="tabular text-xs text-muted-foreground">{event ? formatTime(event.at) : "--:--"}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

function Eta({ order, now }: { order: Order; now: Date | null }) {
  if (order.status === "completed") {
    const completed = eventFor(order.timeline, "completed")
    return completed ? (
      <StatusBadge tone="fresh" className="h-7 px-3 text-sm">
        Đã giao lúc {formatTime(completed.at)}
      </StatusBadge>
    ) : null
  }
  if (!order.delivery) return null

  const eta = new Date(order.delivery.eta)
  const from = new Date(eta.getTime() - 10 * 60_000)
  const minutesLeft = now ? Math.ceil((eta.getTime() - now.getTime()) / 60_000) : null

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 sm:w-auto sm:flex-col sm:items-end sm:bg-transparent sm:p-0">
      <p className="text-sm">
        Dự kiến giao{" "}
        <span className="tabular font-semibold">
          {formatTime(from)} – {formatTime(eta)}
        </span>
      </p>
      {minutesLeft === null ? null : minutesLeft > 0 ? (
        <StatusBadge tone="orange" dot={false}>
          <TimerIcon className="size-3.5" /> còn ~{minutesLeft} phút
        </StatusBadge>
      ) : (
        <StatusBadge tone="warning" dot={false}>
          <TimerIcon className="size-3.5" /> Sắp tới, chậm hơn dự kiến
        </StatusBadge>
      )}
    </div>
  )
}

function CancelledState({ order }: { order: Order }) {
  const cancelled = eventFor(order.timeline, "cancelled")
  return (
    <Panel bodyClassName="space-y-4 p-4">
      <div className="flex gap-3 rounded-lg bg-red-soft p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red text-white">
          <XIcon className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Đơn hàng đã bị huỷ</p>
          <p className="mt-0.5 text-sm">Lý do: {cancelled?.note || "Không ghi lý do"}</p>
          {cancelled ? (
            <p className="mt-0.5 text-xs text-foreground/70">
              Huỷ lúc {formatDateTime(cancelled.at)}
              {cancelled.by ? ` bởi ${cancelled.by}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Lịch sử đơn hàng</p>
        <ol className="space-y-2">
          {order.timeline.map((event, i) => (
            <li key={`${event.status}-${i}`} className="flex items-center gap-3 text-sm">
              <span className="tabular w-12 shrink-0 text-xs text-muted-foreground">{formatTime(event.at)}</span>
              <StatusBadge tone={ORDER_STATUS[event.status].tone}>{ORDER_STATUS[event.status].label}</StatusBadge>
              {event.by ? <span className="truncate text-xs text-muted-foreground">{event.by}</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  )
}
