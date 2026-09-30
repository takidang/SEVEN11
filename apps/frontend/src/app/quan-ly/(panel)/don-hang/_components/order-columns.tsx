"use client"

import { GlobeIcon, StoreIcon } from "lucide-react"

import type { ColumnDef } from "@/components/admin/data-table"
import { StatusBadge } from "@/components/admin/status-badge"
import { formatDate, formatPhone, formatTime, formatVND, toDateKey } from "@/lib/format"
import { CHANNEL, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/order-status"
import type { Customer, Order, SalesChannel, Store } from "@/types"

export function ChannelChip({ channel }: { channel: SalesChannel }) {
  const Icon = channel === "online" ? GlobeIcon : StoreIcon
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <Icon className={channel === "online" ? "size-3.5 text-info" : "size-3.5 text-brand"} />
      {CHANNEL[channel]}
    </span>
  )
}

/** "chờ 6 phút" for pending orders — how long the customer has been waiting. */
export function waitingLabel(order: Order, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / 60_000))
  if (minutes < 1) return "vừa đặt"
  if (minutes < 60) return `chờ ${minutes} phút`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `chờ ${hours} giờ` : `chờ ${Math.floor(hours / 24)} ngày`
}

export function orderColumns({
  customerMap,
  storeMap,
  showStore,
  now,
}: {
  customerMap: Map<string, Customer>
  storeMap: Map<string, Store>
  showStore: boolean
  now: Date
}): ColumnDef<Order, unknown>[] {
  const today = toDateKey(now)
  const columns: (ColumnDef<Order, unknown> | false)[] = [
    {
      accessorKey: "code",
      header: "Mã đơn",
      cell: ({ row }) => {
        const o = row.original
        return (
          <div className="min-w-0">
            <span className="font-mono text-[13px] font-medium text-foreground">{o.code}</span>
            <span className="block text-xs text-muted-foreground md:hidden">
              {formatTime(o.createdAt)} · {CHANNEL[o.channel]}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: "Thời gian",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => {
        const at = row.original.createdAt
        return (
          <div className="leading-tight">
            <span className="tabular text-sm">{formatTime(at)}</span>
            <span className="tabular block text-xs text-muted-foreground">
              {toDateKey(at) === today ? "Hôm nay" : formatDate(at)}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: "channel",
      header: "Kênh",
      enableSorting: false,
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => <ChannelChip channel={row.original.channel} />,
    },
    {
      id: "customer",
      header: "Khách hàng",
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (o) => (o.customerId ? (customerMap.get(o.customerId)?.fullName ?? "") : ""),
      cell: ({ row }) => {
        const o = row.original
        const customer = o.customerId ? customerMap.get(o.customerId) : undefined
        if (!customer && !o.delivery) return <span className="text-sm text-muted-foreground">Khách lẻ</span>
        return (
          <div className="max-w-52 min-w-0 leading-tight">
            <span className="block truncate text-sm font-medium">{customer?.fullName ?? o.delivery?.recipient}</span>
            <span className="tabular block text-xs text-muted-foreground">
              {formatPhone(customer?.phone ?? o.delivery?.phone ?? "")}
            </span>
          </div>
        )
      },
    },
    showStore && {
      id: "store",
      header: "Cửa hàng",
      meta: { className: "hidden xl:table-cell" },
      accessorFn: (o) => storeMap.get(o.storeId)?.code ?? "",
      cell: ({ row }) => {
        const store = storeMap.get(row.original.storeId)
        return store ? (
          <div className="max-w-44 min-w-0 leading-tight">
            <span className="tabular text-sm font-medium">{store.code}</span>
            <span className="block truncate text-xs text-muted-foreground">{store.name}</span>
          </div>
        ) : null
      },
    },
    {
      id: "payment",
      header: "Thanh toán",
      enableSorting: false,
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => {
        const o = row.original
        const status = PAYMENT_STATUS[o.paymentStatus]
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="text-xs text-muted-foreground">{PAYMENT_METHOD[o.paymentMethod]}</span>
            <StatusBadge tone={status.tone} className="h-5 px-2 text-[11px]">
              {status.label}
            </StatusBadge>
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Trạng thái",
      enableSorting: false,
      cell: ({ row }) => {
        const o = row.original
        const status = ORDER_STATUS[o.status]
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {o.status === "pending" ? (
              <span className="pl-1 text-[11px] font-medium text-warning">{waitingLabel(o, now)}</span>
            ) : null}
          </div>
        )
      },
    },
    {
      accessorKey: "total",
      header: "Tổng tiền",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-semibold">{formatVND(row.original.total)}</span>,
    },
  ]
  return columns.filter(Boolean) as ColumnDef<Order, unknown>[]
}
