"use client"

import { useMemo } from "react"

import { PageHeader } from "@/components/admin/page-header"
import { productLookup, selectOrders } from "@/lib/analytics"
import { formatDate, toDateKey } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"

import { AttentionPanel } from "./_components/attention-panel"
import { BudgetPanel } from "./_components/budget-panel"
import { ChannelMixPanel } from "./_components/channel-mix-panel"
import { weekdayLong } from "./_components/chart-kit"
import { PanelSkeleton, StatRowSkeleton } from "./_components/dashboard-skeleton"
import { HourlyRevenuePanel } from "./_components/hourly-revenue-panel"
import { KpiRow } from "./_components/kpi-row"
import { LiveOrdersPanel } from "./_components/live-orders-panel"
import { RevenueTrendPanel } from "./_components/revenue-trend-panel"
import { StoreRevenuePanel } from "./_components/store-revenue-panel"
import { TopProductsPanel } from "./_components/top-products-panel"
import { useScopeInfo } from "./_components/use-scope-info"

/*
 * Layout: 12 columns from xl, rows paired by height (trend + channel, hourly + attention,
 * stores + products). Between lg and xl charts take the full width and the two side panels
 * pair up; on phones "Cần chú ý" moves right after the revenue trend.
 */
const SPAN = {
  trend: "order-1 lg:order-1 lg:col-span-2 xl:order-none xl:col-span-8",
  channel: "order-4 lg:order-3 xl:order-none xl:col-span-4",
  hourly: "order-3 lg:order-2 lg:col-span-2 xl:order-none xl:col-span-8",
  attention: "order-2 lg:order-4 xl:order-none xl:col-span-4",
  stores: "order-5 lg:col-span-2 xl:order-none xl:col-span-6",
  products: "order-6 lg:col-span-2 xl:order-none",
  live: "order-7 lg:col-span-2 xl:order-none xl:col-span-12",
}

export default function DashboardPage() {
  const now = useNow()
  const { storeId, isChain, label } = useScopeInfo()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description={
          <>
            {label}
            {" · "}
            {now ? (
              `${weekdayLong(now)}, ${formatDate(now)}`
            ) : (
              <span className="inline-block h-3.5 w-32 animate-pulse rounded bg-muted align-middle" />
            )}
          </>
        }
      />
      {now ? <Dashboard now={now} storeId={storeId} isChain={isChain} /> : <DashboardSkeleton isChain={isChain} />}
    </div>
  )
}

function Dashboard({ now, storeId, isChain }: { now: Date; storeId: string | null; isChain: boolean }) {
  const orders = useDb((s) => s.orders)
  const products = useDb((s) => s.products)
  const productMap = useMemo(() => productLookup(products), [products])
  const scoped = useMemo(() => selectOrders(orders, { storeId }), [orders, storeId])
  // Day boundaries only change at midnight, so the heavy aggregates don't recompute on every tick.
  const dayKey = toDateKey(now)
  const today = useMemo(() => new Date(`${dayKey}T00:00:00`), [dayKey])

  return (
    <>
      <KpiRow orders={scoped} products={productMap} storeId={storeId} now={now} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <RevenueTrendPanel className={SPAN.trend} orders={scoped} products={productMap} today={today} now={now} />
        <ChannelMixPanel className={SPAN.channel} orders={scoped} today={today} />
        <HourlyRevenuePanel className={SPAN.hourly} orders={scoped} today={today} now={now} />
        <AttentionPanel className={SPAN.attention} storeId={storeId} products={productMap} now={now} />
        <BudgetPanel className={SPAN.attention} storeId={storeId} now={now} />
        {isChain ? (
          <StoreRevenuePanel className={SPAN.stores} orders={scoped} products={productMap} today={today} />
        ) : null}
        <TopProductsPanel
          className={cn(SPAN.products, isChain ? "xl:col-span-6" : "xl:col-span-12")}
          orders={scoped}
          products={productMap}
          today={today}
          columns={isChain ? 1 : 2}
        />
        <LiveOrdersPanel
          className={SPAN.live}
          orders={scoped}
          now={now}
          showStore={isChain}
          wide
          limit={isChain ? 8 : 6}
        />
      </div>
    </>
  )
}

function DashboardSkeleton({ isChain }: { isChain: boolean }) {
  return (
    <>
      <StatRowSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <PanelSkeleton className={SPAN.trend} height={340} />
        <PanelSkeleton className={SPAN.channel} height={340} />
        <PanelSkeleton className={SPAN.hourly} height={260} />
        <PanelSkeleton className={SPAN.attention} height={260} />
        {isChain ? <PanelSkeleton className={SPAN.stores} height={380} /> : null}
        <PanelSkeleton className={cn(SPAN.products, isChain ? "xl:col-span-6" : "xl:col-span-12")} height={380} />
        <PanelSkeleton className={SPAN.live} height={240} />
      </div>
    </>
  )
}
