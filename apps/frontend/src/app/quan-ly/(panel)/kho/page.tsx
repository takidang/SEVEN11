"use client"

import { CalendarClockIcon, ClipboardCheckIcon, TruckIcon, WarehouseIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { PageHeader } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber } from "@/lib/format"
import { canManage } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"

import { replaceQuery } from "@/lib/query"
import { BatchesTab, useBatchRows } from "./_components/batches-tab"
import { ChainScopeHint } from "./_components/chain-scope-hint"
import { type StockFilter, StockTab } from "./_components/stock-tab"
import { type StocktakeSession, StocktakeTab } from "./_components/stocktake-tab"

const TABS = ["ton-kho", "han-dung", "kiem-kho"] as const
type Tab = (typeof TABS)[number]

const FILTER_FROM_QUERY: Record<string, StockFilter> = { "can-nhap": "restock", "sap-het": "low", "het-hang": "out" }
const QUERY_FROM_FILTER: Record<StockFilter, string | null> = {
  all: null,
  restock: "can-nhap",
  low: "sap-het",
  out: "het-hang",
}

const EMPTY_SESSION: StocktakeSession = { counts: {}, categoryId: "all" }

const TRIGGER =
  "flex-none px-0.5 group-data-horizontal/tabs:after:bottom-[-1px] data-active:text-foreground data-active:after:bg-brand"

function CountPill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warning" }) {
  return (
    <span
      className={
        tone === "warning"
          ? "tabular rounded-full bg-warning-soft px-1.5 text-xs leading-5 font-semibold text-warning"
          : "tabular rounded-full bg-muted px-1.5 text-xs leading-5 font-semibold text-muted-foreground"
      }
    >
      {children}
    </span>
  )
}

function InventoryView() {
  const staff = useCurrentStaff()
  const { storeId } = useStoreScope()
  const stores = useDb((s) => s.stores)
  const params = useSearchParams()
  const now = useNow(60_000)

  const canEdit = !!staff && canManage(staff.role, "inventory") && !!storeId
  const canPurchase = !!staff && canManage(staff.role, "purchasing")
  const store = stores.find((s) => s.id === storeId)
  const storeLabel = store ? `Cửa hàng ${store.code}` : "Toàn chuỗi"

  const tabParam = params.get("tab")
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "ton-kho"
  const filter = FILTER_FROM_QUERY[params.get("loc") ?? ""] ?? "all"

  // The stocktake session lives here so switching tabs doesn't lose it; it belongs to one store.
  const [stocktake, setStocktake] = useState<{ storeId: string | null; session: StocktakeSession }>({
    storeId,
    session: EMPTY_SESSION,
  })
  const session = stocktake.storeId === storeId ? stocktake.session : EMPTY_SESSION
  const countedTotal = Object.values(session.counts).filter((v) => v !== "").length

  const batchRows = useBatchRows(storeId, now)
  const expiringCount = batchRows.filter((r) => r.expiry.kind !== "ok").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tồn kho"
        description={
          store
            ? `Cửa hàng ${store.code} – ${store.name} · tồn theo mặt hàng, lô & hạn dùng, kiểm kho`
            : `Tổng hợp ${stores.length} cửa hàng · tồn theo mặt hàng, lô & hạn dùng`
        }
        actions={
          canPurchase ? (
            <Button asChild>
              <Link href="/quan-ly/nhap-hang?goi-y=1">
                <TruckIcon /> Tạo phiếu nhập cho hàng sắp hết
              </Link>
            </Button>
          ) : null
        }
      />

      {!storeId ? <ChainScopeHint storeCount={stores.length} /> : null}

      <Tabs
        value={tab}
        onValueChange={(value) => replaceQuery({ tab: value === "ton-kho" ? null : value })}
        className="gap-4"
      >
        <TabsList
          variant="line"
          className="w-full justify-start gap-5 rounded-none border-b p-0 group-data-horizontal/tabs:h-11"
        >
          <TabsTrigger value="ton-kho" className={TRIGGER}>
            <WarehouseIcon /> Tồn kho
          </TabsTrigger>
          <TabsTrigger value="han-dung" className={TRIGGER}>
            <CalendarClockIcon /> Lô & hạn dùng
            {expiringCount ? <CountPill tone="warning">{formatNumber(expiringCount)}</CountPill> : null}
          </TabsTrigger>
          <TabsTrigger value="kiem-kho" className={TRIGGER}>
            <ClipboardCheckIcon /> Kiểm kho
            {countedTotal ? <CountPill>{formatNumber(countedTotal)}</CountPill> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ton-kho">
          <StockTab
            storeId={storeId}
            canEdit={canEdit}
            storeLabel={storeLabel}
            filter={filter}
            onFilterChange={(next) => replaceQuery({ loc: QUERY_FROM_FILTER[next] })}
          />
        </TabsContent>
        <TabsContent value="han-dung">
          <BatchesTab storeId={storeId} canEdit={canEdit} storeLabel={storeLabel} now={now} />
        </TabsContent>
        <TabsContent value="kiem-kho">
          <StocktakeTab
            storeId={canEdit ? storeId : null}
            storeLabel={storeLabel}
            session={session}
            onSessionChange={(updater) =>
              setStocktake((prev) => ({
                storeId,
                session: updater(prev.storeId === storeId ? prev.session : EMPTY_SESSION),
              }))
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryView />
    </Suspense>
  )
}
