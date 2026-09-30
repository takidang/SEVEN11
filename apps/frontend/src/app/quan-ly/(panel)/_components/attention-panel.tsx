"use client"

import {
  TrendingDownIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  type LucideIcon,
  PackageXIcon,
  TruckIcon,
  WrenchIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { Panel } from "@/components/admin/page-header"
import {
  addDays,
  awaitingPurchaseOrders,
  expiringBatches,
  periodOfDays,
  type ProductLookup,
  salesByStore,
  selectOrders,
  startOfDay,
  stockAlerts,
} from "@/lib/analytics"
import { perStoreCosts } from "@/lib/budget"
import { formatNumber, formatVND } from "@/lib/format"
import type { Tone } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"

interface AttentionItem {
  key: string
  title: string
  detail: string
  count: number
  tone: Tone
  icon: LucideIcon
  href: string
}

/** Icon wells per status tone (same meaning as StatusBadge). */
const WELL: Partial<Record<Tone, string>> = {
  danger: "bg-red-soft text-red",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
}

/** Operational counts that need someone to act, each linking to the screen where they act. */
export function AttentionPanel({
  storeId,
  products,
  now,
  className,
}: {
  storeId: string | null
  products: ProductLookup
  now: Date
  className?: string
}) {
  const orders = useDb((s) => s.orders)
  const stock = useDb((s) => s.stock)
  const batches = useDb((s) => s.batches)
  const purchaseOrders = useDb((s) => s.purchaseOrders)
  const stores = useDb((s) => s.stores)

  const stockCount = useMemo(() => stockAlerts(stock, products, storeId), [stock, products, storeId])
  const expiry = useMemo(() => expiringBatches(batches, storeId, now, 24), [batches, storeId, now])
  const purchasing = useMemo(() => awaitingPurchaseOrders(purchaseOrders, storeId, now), [purchaseOrders, storeId, now])
  const maintenance = useMemo(() => stores.filter((s) => s.status === "maintenance"), [stores])

  // A store can lose money while the chain makes it, so say so here instead of making someone
  // open the report store by store.
  const losing = useMemo(() => {
    const period = periodOfDays(addDays(startOfDay(now), -29), now)
    const costs = perStoreCosts(period.days, stores.length)
    const running = costs.payroll + costs.rent + costs.utilities + costs.marketing
    return salesByStore(selectOrders(orders, { storeId: null }, period), products, stores)
      .map((row) => ({ row, net: row.grossProfit - running }))
      .filter((s) => s.net < 0)
      .sort((a, b) => a.net - b.net)
  }, [orders, products, stores, now])

  const items: AttentionItem[] = [
    {
      key: "stock",
      title: "Hết hàng / sắp hết",
      count: stockCount.out + stockCount.low,
      detail:
        stockCount.out + stockCount.low > 0
          ? `${formatNumber(stockCount.out)} hết hàng · ${formatNumber(stockCount.low)} sắp hết`
          : "Tồn kho đang đủ bán",
      tone: stockCount.out > 0 ? "danger" : stockCount.low > 0 ? "warning" : "neutral",
      icon: PackageXIcon,
      href: "/quan-ly/kho?tab=ton-kho&loc=can-nhap",
    },
    {
      key: "expiry",
      title: "Lô hết hạn trong 24 giờ",
      count: expiry.expiring,
      detail:
        expiry.expired > 0
          ? `${formatNumber(expiry.expired)} lô đã quá hạn, cần xuất huỷ`
          : expiry.expiring > 0
            ? "Giảm giá hoặc xuất huỷ kịp thời"
            : "Không có lô nào sắp hết hạn",
      tone: expiry.expired > 0 ? "danger" : expiry.expiring > 0 ? "warning" : "neutral",
      icon: CalendarClockIcon,
      href: "/quan-ly/kho?tab=han-dung",
    },
    {
      key: "purchasing",
      title: "Phiếu nhập chờ nhận hàng",
      count: purchasing.awaiting,
      detail:
        purchasing.late > 0
          ? `${formatNumber(purchasing.late)} phiếu đã trễ hẹn giao`
          : purchasing.awaiting > 0
            ? "Nhà cung cấp đang giao hàng"
            : "Không có phiếu nào đang chờ",
      tone: purchasing.late > 0 ? "warning" : purchasing.awaiting > 0 ? "info" : "neutral",
      icon: TruckIcon,
      href: "/quan-ly/nhap-hang",
    },
  ]
  if (!storeId) {
    items.push({
      key: "losing",
      title: "Cửa hàng đang lỗ (30 ngày)",
      count: losing.length,
      detail: losing.length
        ? losing
            .slice(0, 2)
            .map((s) => {
              const store = stores.find((x) => x.id === s.row.storeId)
              return `${store?.code ?? s.row.storeId} lỗ ${formatVND(-s.net)}`
            })
            .join(" · ") + (losing.length > 2 ? ` · và ${losing.length - 2} cửa hàng khác` : "")
        : "Cửa hàng nào cũng có lãi",
      tone: losing.length ? "danger" : "neutral",
      icon: TrendingDownIcon,
      href: "/quan-ly/bao-cao",
    })
    items.push({
      key: "maintenance",
      title: "Cửa hàng đang bảo trì",
      count: maintenance.length,
      detail: maintenance.length
        ? maintenance.map((s) => `${s.code} – ${s.name}`).join(", ")
        : "Tất cả cửa hàng đang hoạt động",
      tone: maintenance.length ? "warning" : "neutral",
      icon: WrenchIcon,
      href: "/quan-ly/cua-hang",
    })
  }

  return (
    <Panel
      title="Cần chú ý"
      description={
        storeId ? "Việc cần xử lý trong hôm nay" : "Việc cần xử lý hôm nay · tồn kho tính theo từng cửa hàng"
      }
      className={cn("flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col p-0"
    >
      <ul className="flex flex-1 flex-col divide-y">
        {items.map((item) => (
          <li key={item.key} className="flex flex-1">
            <Link
              href={item.href}
              className="flex flex-1 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
            >
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", WELL[item.tone])}>
                <item.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground" title={item.detail}>
                  {item.detail}
                </span>
              </span>
              <span
                className={cn(
                  "tabular text-lg font-semibold",
                  item.count ? "text-foreground" : "text-muted-foreground/70",
                )}
              >
                {formatNumber(item.count)}
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
