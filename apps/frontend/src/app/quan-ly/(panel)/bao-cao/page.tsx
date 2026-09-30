"use client"

import {
  CoinsIcon,
  DownloadIcon,
  ReceiptTextIcon,
  ShoppingBasketIcon,
  TicketPercentIcon,
  WalletIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { PageHeader, Panel } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  addDays,
  type ChannelFilter,
  firstOrderAt,
  periodOfDays,
  type PeriodPreset,
  presetPeriod,
  previousPeriod,
  productLookup,
  relativeChange,
  selectOrders,
  startOfDay,
  summarizeSales,
} from "@/lib/analytics"
import { formatDate, formatDateTime, formatNumber, formatPercent, formatTime, formatVND, toDateKey } from "@/lib/format"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"

import { StatRowSkeleton } from "../_components/dashboard-skeleton"
import { useScopeInfo } from "../_components/use-scope-info"
import { downloadCsv, toCsv } from "./_components/csv"
import { CHANNEL_FILTER_LABEL, periodLabel, type PresetValue, ReportFilters } from "./_components/report-filters"
import { buildReport, REPORT_TABS, type ReportTab, reportToCsv } from "./_components/report-model"
import {
  DeliveryTab,
  PaymentsTab,
  ProductsTab,
  ProfitTab,
  RevenueTab,
  StaffTab,
  StoresTab,
} from "./_components/report-tabs"

export default function ReportsPage() {
  const now = useNow(60_000)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo"
        description="Doanh thu, lợi nhuận gộp, hàng hoá, cửa hàng, nhân viên và thanh toán theo kỳ"
      />
      {now ? <Reports now={now} /> : <ReportsSkeleton />}
    </div>
  )
}

function Reports({ now }: { now: Date }) {
  const scope = useScopeInfo()
  const orders = useDb((s) => s.orders)
  const products = useDb((s) => s.products)
  const categories = useDb((s) => s.categories)
  const stores = useDb((s) => s.stores)
  const employees = useDb((s) => s.employees)

  const [preset, setPreset] = useState<PresetValue>("7d")
  const [customDays, setCustomDays] = useState<{ first: Date; last: Date } | null>(null)
  const [channel, setChannel] = useState<ChannelFilter>("all")
  const [tab, setTab] = useState<ReportTab>("doanh-thu")

  const tabs = REPORT_TABS.filter((t) => !t.chainOnly || scope.isChain)
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "doanh-thu"

  // Periods move at midnight only; the previous period also follows the time of day while today is running.
  const dayKey = toDateKey(now)
  const today = useMemo(() => new Date(`${dayKey}T00:00:00`), [dayKey])
  const period = useMemo(
    () =>
      preset === "custom" && customDays
        ? periodOfDays(customDays.first, customDays.last)
        : presetPeriod(preset === "custom" ? "7d" : preset, today),
    [preset, customDays, today],
  )
  const previous = useMemo(() => previousPeriod(period, now), [period, now])

  const dataStart = useMemo(() => firstOrderAt(orders), [orders])
  const comparable = !!dataStart && previous.from >= startOfDay(dataStart)

  const productMap = useMemo(() => productLookup(products), [products])
  const current = useMemo(
    () => selectOrders(orders, { storeId: scope.storeId, channel }, period),
    [orders, scope.storeId, channel, period],
  )
  const previousOrders = useMemo(
    () => (comparable ? selectOrders(orders, { storeId: scope.storeId, channel }, previous) : null),
    [comparable, orders, scope.storeId, channel, previous],
  )
  const summary = useMemo(() => summarizeSales(current, productMap), [current, productMap])
  const before = useMemo(
    () => (previousOrders ? summarizeSales(previousOrders, productMap) : null),
    [previousOrders, productMap],
  )

  const report = useMemo(
    () =>
      buildReport(activeTab, {
        orders: current,
        previousOrders,
        products: productMap,
        categories,
        stores,
        employees,
        storeId: scope.storeId,
        period,
      }),
    [activeTab, current, previousOrders, productMap, categories, stores, employees, scope.storeId, period],
  )

  const change = (value: number, previousValue: number | undefined) =>
    before && previousValue !== undefined ? relativeChange(value, previousValue) : null
  const noCompareHint = "Chưa có số liệu kỳ trước"
  const caption = `${periodLabel(period)} · ${CHANNEL_FILTER_LABEL[channel]} · ${scope.label}`

  const exportCsv = () => {
    const tabLabel = REPORT_TABS.find((t) => t.value === activeTab)?.label ?? ""
    const content = toCsv(reportToCsv(report), [
      ["Báo cáo", tabLabel],
      ["Phạm vi", scope.label],
      ["Kỳ báo cáo", periodLabel(period)],
      ["Kênh bán", CHANNEL_FILTER_LABEL[channel]],
      ["Xuất lúc", formatDateTime(new Date())],
    ])
    const lastDay = toDateKey(addDays(period.to, -1))
    const filename = `bao-cao-${activeTab}_${toDateKey(period.from)}_${lastDay}${scope.store ? `_ch${scope.store.code}` : ""}.csv`
    downloadCsv(filename, content)
    toast.success("Đã xuất file CSV", { description: filename })
  }

  return (
    <>
      <div className="space-y-2">
        <ReportFilters
          preset={preset}
          period={period}
          channel={channel}
          today={today}
          scopeLabel={scope.label}
          onPresetChange={(value: PeriodPreset) => {
            setPreset(value)
            setCustomDays(null)
          }}
          onCustomRange={(first, last) => {
            setPreset("custom")
            setCustomDays({ first, last })
          }}
          onChannelChange={setChannel}
        />
        <p className="text-xs text-muted-foreground">
          {comparable
            ? `So sánh với ${periodLabel(previous)}${previous.to < addDays(previous.from, previous.days) ? ` (đến ${formatTime(now)})` : ""}`
            : "Chưa đủ dữ liệu kỳ trước để so sánh"}
          {preset === "custom" ? ` · ${period.days} ngày` : ""}
          {dataStart && period.from < startOfDay(dataStart) ? ` · dữ liệu có từ ${formatDate(dataStart)}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 [&>div>div:last-child]:mt-auto">
        <StatCard
          label="Doanh thu"
          value={formatVND(summary.revenue)}
          icon={WalletIcon}
          delta={change(summary.revenue, before?.revenue)}
          hint={noCompareHint}
        />
        <StatCard
          label="Lợi nhuận gộp"
          value={
            <span className="flex flex-wrap items-baseline gap-x-2">
              {formatVND(summary.grossProfit)}
              <span className="text-xs font-medium tracking-normal text-muted-foreground">
                Biên {summary.revenue ? formatPercent(summary.margin) : "—"}
              </span>
            </span>
          }
          icon={CoinsIcon}
          delta={change(summary.grossProfit, before?.grossProfit)}
          hint={noCompareHint}
        />
        <StatCard
          label="Số đơn"
          value={formatNumber(summary.orders)}
          icon={ReceiptTextIcon}
          delta={change(summary.orders, before?.orders)}
          hint={noCompareHint}
        />
        <StatCard
          label="Giá trị TB/đơn"
          value={formatVND(summary.aov)}
          icon={ShoppingBasketIcon}
          delta={summary.orders ? change(summary.aov, before?.aov) : null}
          hint={summary.orders ? noCompareHint : "Chưa có đơn trong kỳ"}
        />
        <StatCard
          label="Tổng giảm giá"
          value={formatVND(summary.discount)}
          icon={TicketPercentIcon}
          delta={change(summary.discount, before?.discount)}
          upIsGood={false}
          hint={noCompareHint}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setTab(value as ReportTab)} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="-mx-4 no-scrollbar max-w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <Button variant="outline" className="bg-white" onClick={exportCsv}>
            <DownloadIcon /> Xuất CSV
          </Button>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {report.tab !== t.value ? null : report.tab === "doanh-thu" ? (
              <RevenueTab report={report} now={now} caption={caption} />
            ) : report.tab === "lai-lo" ? (
              <ProfitTab report={report} caption={caption} />
            ) : report.tab === "hang-hoa" ? (
              <ProductsTab report={report} />
            ) : report.tab === "cua-hang" ? (
              <StoresTab report={report} />
            ) : report.tab === "nhan-vien" ? (
              <StaffTab report={report} />
            ) : report.tab === "thanh-toan" ? (
              <PaymentsTab report={report} showCancellation={channel !== "in-store"} />
            ) : (
              <DeliveryTab report={report} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}

function ReportsSkeleton() {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-[190px] rounded-lg" />
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="h-8 w-[150px] rounded-lg" />
      </div>
      <StatRowSkeleton count={5} className="lg:grid-cols-3 xl:grid-cols-5" />
      <Skeleton className="h-8 w-96 max-w-full rounded-lg" />
      <Panel title={<Skeleton className="h-4 w-40" />}>
        <Skeleton className="h-[280px] w-full" />
      </Panel>
    </>
  )
}
