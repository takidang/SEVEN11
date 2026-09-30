"use client"

import { TrendingDownIcon, UserRoundXIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

import { DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { ResultCount, SearchInput, Toolbar } from "@/components/admin/toolbar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatNumber, normalizeText } from "@/lib/format"
import { keepStatus, memberSpendByMonth, monthKey, TIER_ORDER, TIERS } from "@/lib/membership"
import { canManage } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"
import type { Customer, MemberTier } from "@/types"

import { customerColumns, type CustomerRow, isAtRisk } from "./_components/customer-columns"
import { CustomerSheet } from "./_components/customer-sheet"
import { CustomerStats } from "./_components/customer-stats"

type SortKey = "tierSpend" | "month" | "stars" | "total" | "orders" | "joined" | "name"

const SORTS: Record<SortKey, { label: string; compare: (a: CustomerRow, b: CustomerRow) => number }> = {
  tierSpend: { label: "Chi tiêu tích luỹ", compare: (a, b) => b.customer.tierSpend - a.customer.tierSpend },
  month: { label: "Chi tiêu tháng này", compare: (a, b) => b.keep.spent - a.keep.spent },
  stars: { label: "Sao vàng", compare: (a, b) => b.customer.stars - a.customer.stars },
  total: { label: "Tổng chi tiêu", compare: (a, b) => b.customer.totalSpent - a.customer.totalSpent },
  orders: { label: "Số đơn", compare: (a, b) => b.customer.orderCount - a.customer.orderCount },
  joined: { label: "Mới tham gia", compare: (a, b) => b.customer.joinedAt.localeCompare(a.customer.joinedAt) },
  name: { label: "Tên A–Z", compare: (a, b) => a.customer.fullName.localeCompare(b.customer.fullName, "vi") },
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomersView />
    </Suspense>
  )
}

function CustomersView() {
  const now = useNow(60_000)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const staff = useCurrentStaff()
  const { storeId } = useStoreScope()
  const customers = useDb((s) => s.customers)
  const orders = useDb((s) => s.orders)
  const stores = useDb((s) => s.stores)

  const [query, setQuery] = useState("")
  const [tier, setTier] = useState<MemberTier | "all">("all")
  const [atRiskOnly, setAtRiskOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>("tierSpend")
  const [storeOnly, setStoreOnly] = useState(true)

  const store = storeId ? stores.find((s) => s.id === storeId) : undefined
  const limitToStore = !!storeId && storeOnly

  // Members who bought at the store in scope (membership itself is chain-wide).
  const storeCustomerIds = useMemo(() => {
    if (!storeId) return null
    const ids = new Set<string>()
    for (const o of orders) if (o.storeId === storeId && o.customerId) ids.add(o.customerId)
    return ids
  }, [orders, storeId])

  const spendByMonth = useMemo(() => memberSpendByMonth(orders), [orders])

  // Every member in scope with this month's keep-the-tier status (spend counted chain-wide).
  const scoped = useMemo<CustomerRow[]>(() => {
    if (!now) return []
    const month = monthKey(now)
    return customers
      .filter((c) => !limitToStore || !storeCustomerIds || storeCustomerIds.has(c.id))
      .map((customer) => ({
        customer,
        keep: keepStatus(customer, spendByMonth.get(customer.id)?.get(month) ?? 0, now),
      }))
  }, [customers, limitToStore, storeCustomerIds, spendByMonth, now])

  const atRiskCount = useMemo(() => scoped.filter((r) => isAtRisk(r.keep)).length, [scoped])

  const rows = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    const digits = query.replace(/\D/g, "")
    return scoped
      .filter(({ customer: c, keep }) => {
        if (tier !== "all" && c.tier !== tier) return false
        if (atRiskOnly && !isAtRisk(keep)) return false
        if (!terms.length) return true
        if (digits.length >= 3 && c.phone.includes(digits)) return true
        const haystack = normalizeText(`${c.fullName} ${c.email ?? ""}`)
        return terms.every((t) => haystack.includes(t))
      })
      .sort(SORTS[sort].compare)
  }, [scoped, query, tier, atRiskOnly, sort])

  const sdt = params.get("sdt")
  const selected = sdt ? (customers.find((c) => c.phone === sdt.replace(/\D/g, "")) ?? null) : null

  const openCustomer = (c: Customer) => router.replace(`${pathname}?sdt=${c.phone}`, { scroll: false })
  const closeCustomer = () => router.replace(pathname, { scroll: false })

  if (!now || !staff) return <PageSkeleton />

  const canEdit = canManage(staff.role, "customers")
  const filtered = query.trim() !== "" || tier !== "all" || atRiskOnly

  return (
    <div className="space-y-6">
      <PageHeader
        title="Khách hàng"
        description={
          limitToStore && store
            ? `Thành viên đã mua tại cửa hàng ${store.code} – ${store.name}. Hạng thành viên dùng chung toàn chuỗi.`
            : "Thành viên lên hạng ngay khi chi tiêu tích luỹ đạt mốc, và giữ hạng bằng mức chi tối thiểu mỗi tháng."
        }
      />

      <CustomerStats rows={scoped} now={now} storeCode={limitToStore ? store?.code : undefined} />

      {sdt && !selected ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warning-soft px-4 py-2.5 text-sm text-warning">
          <UserRoundXIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Không có thành viên nào dùng số điện thoại <span className="tabular font-medium">{sdt}</span>.
          </span>
          <Button size="sm" variant="outline" className="bg-card text-foreground" onClick={closeCustomer}>
            Bỏ qua
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="Tìm tên hoặc số điện thoại" />
          <Select value={tier} onValueChange={(v) => setTier(v as MemberTier | "all")}>
            <SelectTrigger className="w-[calc(50%-4px)] bg-card sm:w-40" aria-label="Lọc theo hạng">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">Tất cả hạng</SelectItem>
              {TIER_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  Hạng {TIERS[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Toggle
            variant="outline"
            pressed={atRiskOnly}
            onPressedChange={setAtRiskOnly}
            className="w-[calc(50%-4px)] bg-card data-[state=on]:border-brand/40 data-[state=on]:bg-brand-soft data-[state=on]:text-brand sm:w-auto"
          >
            <TrendingDownIcon /> Nguy cơ xuống hạng
            <span className="tabular rounded-full bg-muted px-1.5 text-[11px] leading-4 font-semibold text-muted-foreground">
              {formatNumber(atRiskCount)}
            </span>
          </Toggle>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-60 bg-card" aria-label="Sắp xếp">
              <span className="text-muted-foreground">Xếp theo:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {(Object.keys(SORTS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORTS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {storeId && store ? (
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={storeOnly ? "store" : "all"}
              onValueChange={(v) => v && setStoreOnly(v === "store")}
              className="bg-card"
              aria-label="Phạm vi khách hàng"
            >
              <ToggleGroupItem value="store" className="data-[state=on]:bg-brand-soft data-[state=on]:text-brand-dark">
                Khách của CH {store.code}
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="data-[state=on]:bg-brand-soft data-[state=on]:text-brand-dark">
                Toàn chuỗi
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          <ResultCount>
            {filtered
              ? `${formatNumber(rows.length)} / ${formatNumber(scoped.length)} khách hàng`
              : `${formatNumber(rows.length)} khách hàng`}
          </ResultCount>
        </Toolbar>

        <DataTable
          key={sort}
          columns={customerColumns}
          data={rows}
          getRowId={(r) => r.customer.id}
          onRowClick={(r) => openCustomer(r.customer)}
          emptyTitle={
            filtered
              ? atRiskOnly && !query.trim() && tier === "all"
                ? "Không có thành viên nào có nguy cơ xuống hạng"
                : "Không tìm thấy khách hàng"
              : "Chưa có thành viên"
          }
          emptyDescription={
            filtered
              ? atRiskOnly && !query.trim() && tier === "all"
                ? "Mọi thành viên cần giữ hạng tháng này đều đã chi đủ mức tối thiểu."
                : limitToStore
                  ? "Thử từ khoá khác, hoặc chuyển sang “Toàn chuỗi” để tìm cả khách chưa mua tại cửa hàng này."
                  : "Thử từ khoá, hạng khác hoặc bỏ lọc nguy cơ xuống hạng."
              : "Khách đăng ký bằng số điện thoại trên web hoặc tại quầy sẽ xuất hiện ở đây."
          }
        />
      </div>

      <CustomerSheet customer={selected} now={now} canEdit={canEdit} onClose={closeCustomer} />
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
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
