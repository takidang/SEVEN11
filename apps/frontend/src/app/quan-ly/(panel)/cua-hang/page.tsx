"use client"

import { PlusIcon, SearchIcon, StoreIcon, WalletIcon, WrenchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber, formatPercent, formatVND, normalizeText } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { canManage } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"
import type { Store, StoreStatus } from "@/types"

import { StoreCard } from "./_components/store-card"
import { computeStoreMetrics } from "./_components/store-metrics"
import { StoreSheet, type StoreSheetState } from "./_components/store-sheet"

export default function StoresPage() {
  const now = useNow(60_000)
  const staff = useCurrentStaff()
  const { storeId } = useStoreScope()
  const stores = useDb((s) => s.stores)
  const employees = useDb((s) => s.employees)
  const orders = useDb((s) => s.orders)

  const [query, setQuery] = useState("")
  const [province, setProvince] = useState("all")
  const [status, setStatus] = useState<StoreStatus | "all">("all")
  const [sheet, setSheet] = useState<StoreSheetState>(null)

  const metrics = useMemo(
    () =>
      now
        ? computeStoreMetrics(
            orders,
            stores.map((s) => s.id),
            now,
          )
        : null,
    [orders, stores, now],
  )

  const people = useMemo(() => {
    const byId = new Map(employees.map((e) => [e.id, e] as const))
    const staffCount = new Map<string, number>()
    for (const e of employees) {
      if (e.storeId && e.status !== "inactive") staffCount.set(e.storeId, (staffCount.get(e.storeId) ?? 0) + 1)
    }
    return { byId, staffCount }
  }, [employees])

  const provinces = useMemo(() => [...new Set(stores.map((s) => s.province))], [stores])

  const rows = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    return stores
      .filter((s) => {
        if (province !== "all" && s.province !== province) return false
        if (status !== "all" && s.status !== status) return false
        const haystack = normalizeText(`${s.code} ${s.name} ${s.address} ${s.ward} ${s.province}`)
        return terms.every((t) => haystack.includes(t))
      })
      .sort((a, b) => Number(b.id === storeId) - Number(a.id === storeId) || a.code.localeCompare(b.code))
  }, [stores, query, province, status, storeId])

  if (!now || !staff || !metrics) return <PageSkeleton />

  const canEdit = canManage(staff.role, "stores")
  const counts = { active: 0, maintenance: 0, closed: 0 }
  for (const s of stores) counts[s.status]++
  const maintenanceCodes = stores.filter((s) => s.status === "maintenance").map((s) => s.code)
  const chain = metrics.chain
  const delta = chain.yesterdaySoFar.revenue
    ? (chain.today.revenue - chain.yesterdaySoFar.revenue) / chain.yesterdaySoFar.revenue
    : null
  const filtered = query.trim() !== "" || province !== "all" || status !== "all"
  const highlightLabel = staff.role === "admin" ? "Cửa hàng đang chọn" : "Cửa hàng của bạn"
  const canOpenSchedule = (store: Store) =>
    canManage(staff.role, "employees") && (staff.role === "admin" || store.id === staff.storeId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cửa hàng"
        description={
          canEdit
            ? "Mạng lưới cửa hàng, giờ mở cửa, người quản lý và doanh thu từng điểm bán."
            : "Mạng lưới cửa hàng toàn chuỗi (chỉ xem). Liên hệ quản trị chuỗi để thay đổi thông tin cửa hàng."
        }
        actions={
          canEdit ? (
            <Button onClick={() => setSheet({ mode: "create" })}>
              <PlusIcon /> Thêm cửa hàng
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tổng cửa hàng"
          value={formatNumber(stores.length)}
          icon={StoreIcon}
          hint={provinces.map((p) => `${p} ${stores.filter((s) => s.province === p).length}`).join(" · ")}
        />
        <StatCard
          label="Đang hoạt động"
          value={formatNumber(counts.active)}
          icon={StoreIcon}
          hint={`${formatPercent(counts.active / Math.max(1, stores.length), 0)} mạng lưới${counts.closed ? ` · ${counts.closed} đã đóng` : ""}`}
        />
        <StatCard
          label="Bảo trì"
          value={formatNumber(counts.maintenance)}
          icon={WrenchIcon}
          hint={
            maintenanceCodes.length
              ? `Cửa hàng ${maintenanceCodes.join(", ")} tạm ngưng bán`
              : "Không có cửa hàng bảo trì"
          }
        />
        <StatCard
          label="Doanh thu hôm nay toàn chuỗi"
          value={formatVND(chain.today.revenue)}
          icon={WalletIcon}
          delta={delta}
          deltaLabel="so với cùng giờ hôm qua"
          hint={`${formatNumber(chain.today.orders)} đơn`}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã, tên hoặc địa chỉ"
              className="bg-card pl-8"
              aria-label="Tìm cửa hàng"
            />
          </div>
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger className="w-44 bg-card" aria-label="Lọc theo tỉnh/thành phố">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả tỉnh/thành</SelectItem>
              {provinces.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as StoreStatus | "all")}>
            <SelectTrigger className="w-44 bg-card" aria-label="Lọc theo trạng thái">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              {(Object.keys(STORE_STATUS) as StoreStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STORE_STATUS[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">{formatNumber(rows.length)} cửa hàng</span>
        </div>

        {rows.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                manager={store.managerId ? people.byId.get(store.managerId) : undefined}
                staffCount={people.staffCount.get(store.id) ?? 0}
                metrics={metrics.byStore.get(store.id)!}
                highlight={store.id === storeId ? highlightLabel : undefined}
                onOpen={() => setSheet({ mode: "view", storeId: store.id })}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-card py-14 text-center ring-1 ring-border">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <StoreIcon className="size-5" />
            </span>
            <p className="text-sm font-medium">{filtered ? "Không có cửa hàng phù hợp" : "Chưa có cửa hàng"}</p>
            <p className="text-xs text-muted-foreground">
              {filtered ? "Thử từ khoá, tỉnh/thành hoặc trạng thái khác." : "Thêm cửa hàng đầu tiên của chuỗi."}
            </p>
          </div>
        )}
      </div>

      <StoreSheet
        state={sheet}
        onStateChange={setSheet}
        metrics={metrics.byStore}
        canEdit={canEdit}
        canOpenSchedule={canOpenSchedule}
      />
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
