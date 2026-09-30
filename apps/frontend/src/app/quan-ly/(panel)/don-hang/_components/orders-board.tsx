"use client"

import { BellRingIcon, ScanBarcodeIcon, SearchIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { DataTable } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber, formatVND } from "@/lib/format"
import { canView } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"
import type { Order } from "@/types"

import { orderColumns } from "./order-columns"
import {
  DATE_PRESETS,
  DEFAULT_DATE_PRESET,
  filterOrders,
  parseChannel,
  parseDatePreset,
  parseStatusTab,
  sortForBoard,
  STATUS_TABS,
  type StatusTab,
  tabOfStatus,
} from "./order-filters"
import { OrderSheet } from "./order-sheet"

/** Update the board's query string without a navigation (Next syncs useSearchParams). */
function setQuery(patch: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  const qs = params.toString()
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`)
}

export function OrdersBoard() {
  const params = useSearchParams()
  const staff = useCurrentStaff()
  const { storeId } = useStoreScope()
  const orders = useDb((s) => s.orders)
  const customers = useDb((s) => s.customers)
  const stores = useDb((s) => s.stores)
  const now = useNow(30_000)
  const [search, setSearch] = useState("")

  const tab = parseStatusTab(params.get("trang-thai"))
  const channel = parseChannel(params.get("kenh"))
  const datePreset = parseDatePreset(params.get("ngay"))
  const code = params.get("ma")

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c] as const)), [customers])
  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s] as const)), [stores])
  const store = storeId ? storeMap.get(storeId) : undefined

  const scoped = useMemo(() => (storeId ? orders.filter((o) => o.storeId === storeId) : orders), [orders, storeId])

  const filtered = useMemo(
    () => (now ? filterOrders(scoped, { channel, datePreset, search, now, customerMap }) : []),
    [scoped, channel, datePreset, search, now, customerMap],
  )

  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = {
      all: filtered.length,
      pending: 0,
      processing: 0,
      delivering: 0,
      completed: 0,
      cancelled: 0,
    }
    for (const o of filtered) result[tabOfStatus(o.status)]++
    return result
  }, [filtered])

  const rows = useMemo(() => {
    const statuses = STATUS_TABS.find((t) => t.id === tab)?.statuses
    return sortForBoard(statuses ? filtered.filter((o) => statuses.includes(o.status)) : filtered)
  }, [filtered, tab])

  const rowsTotal = useMemo(() => rows.reduce((sum, o) => sum + (o.status === "cancelled" ? 0 : o.total), 0), [rows])

  const columns = useMemo(
    () => (now ? orderColumns({ customerMap, storeMap, showStore: !storeId, now }) : []),
    [customerMap, storeMap, storeId, now],
  )

  // Managers and cashiers only open orders of their own store; admin can follow any link.
  const selected = useMemo(() => {
    if (!code) return null
    const pool = staff?.role === "admin" ? orders : scoped
    return pool.find((o) => o.code === code) ?? null
  }, [code, orders, scoped, staff?.role])

  useEffect(() => {
    if (code && !selected) {
      toast.error(`Không tìm thấy đơn hàng ${code}`, { id: `order-missing-${code}` })
      setQuery({ ma: null })
    }
  }, [code, selected])

  const openOrder = useCallback((orderCode: string) => setQuery({ ma: orderCode }), [])
  useNewOnlineOrderAlerts(scoped, storeId, openOrder)

  if (!staff) return null

  const filtersActive = channel !== "all" || datePreset !== DEFAULT_DATE_PRESET || search.trim() !== ""

  return (
    <div className="space-y-5">
      <PageHeader
        title="Đơn hàng"
        description={
          store
            ? `Đơn online và đơn bán tại quầy của cửa hàng ${store.code} – ${store.name}.`
            : "Đơn online và đơn bán tại quầy của toàn chuỗi."
        }
        actions={
          canView(staff.role, "pos") ? (
            <Button asChild>
              <Link href="/quan-ly/ban-hang">
                <ScanBarcodeIcon /> Bán tại quầy
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <Tabs value={tab} onValueChange={(value) => setQuery({ "trang-thai": value === "all" ? null : value })}>
          <TabsList
            variant="line"
            className="no-scrollbar w-full justify-start gap-0 overflow-x-auto rounded-none border-b px-2 py-0 group-data-horizontal/tabs:h-auto"
          >
            {STATUS_TABS.map((t) => {
              const count = counts[t.id]
              const attention = t.id === "pending" && count > 0
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="h-11 flex-none gap-2 rounded-none px-3 text-[13px] group-data-horizontal/tabs:after:bottom-0 data-active:text-brand-dark data-active:after:bg-brand"
                >
                  {t.label}
                  <span
                    className={cn(
                      "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                      attention ? "bg-orange text-white" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {formatNumber(count)}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <InputGroup className="h-8 w-full bg-white sm:w-72">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mã đơn, tên hoặc SĐT khách"
              aria-label="Tìm đơn hàng"
            />
            {search ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Xoá tìm kiếm" onClick={() => setSearch("")}>
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          <Select value={channel} onValueChange={(value) => setQuery({ kenh: value === "all" ? null : value })}>
            <SelectTrigger className="w-[150px] bg-white" aria-label="Kênh bán">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả kênh</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="in-store">Tại quầy</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={datePreset}
            onValueChange={(value) => setQuery({ ngay: value === DEFAULT_DATE_PRESET ? null : value })}
          >
            <SelectTrigger className="w-[170px] bg-white" aria-label="Thời gian">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("")
                setQuery({ kenh: null, ngay: null })
              }}
            >
              Xoá bộ lọc
            </Button>
          ) : null}
          <p className="ml-auto text-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">{formatNumber(rows.length)}</span> đơn hàng
            {rows.length ? (
              <>
                {" · "}
                <span className="tabular font-medium text-foreground">{formatVND(rowsTotal)}</span>
              </>
            ) : null}
          </p>
        </div>

        {now ? (
          <DataTable
            columns={columns}
            data={rows}
            pageSize={20}
            onRowClick={(o) => openOrder(o.code)}
            rowClassName={(row) =>
              row.status === "pending"
                ? "bg-orange-soft/45 hover:bg-orange-soft/80 [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-orange)]"
                : undefined
            }
            className="rounded-none border-t ring-0"
            emptyTitle="Không có đơn hàng phù hợp"
            emptyDescription={
              filtersActive
                ? "Thử đổi khoảng thời gian, kênh bán hoặc từ khoá tìm kiếm."
                : "Đơn mới đặt online hoặc bán tại quầy sẽ hiện ở đây."
            }
          />
        ) : (
          <div className="space-y-2 border-t p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
      </div>

      <OrderSheet order={selected} onClose={() => setQuery({ ma: null })} />
    </div>
  )
}

/**
 * Toast when an online order arrives while the board is open (placed on the
 * storefront in another tab — the DB syncs across tabs).
 */
function useNewOnlineOrderAlerts(scoped: Order[], storeId: string | null, openOrder: (code: string) => void) {
  const customers = useDb((s) => s.customers)
  const seen = useRef<{ storeId: string | null; since: string; ids: Set<string> } | null>(null)

  useEffect(() => {
    const pending = scoped.filter((o) => o.channel === "online" && o.status === "pending")
    const state = seen.current
    if (!state || state.storeId !== storeId) {
      seen.current = { storeId, since: new Date().toISOString(), ids: new Set(pending.map((o) => o.id)) }
      return
    }
    const fresh = pending.filter((o) => !state.ids.has(o.id) && o.createdAt >= state.since)
    for (const o of pending) state.ids.add(o.id)
    if (!fresh.length) return

    const newest = fresh[0]
    const customer = newest.customerId ? customers.find((c) => c.id === newest.customerId) : undefined
    toast(fresh.length === 1 ? `Có đơn online mới ${newest.code}` : `Có ${fresh.length} đơn online mới`, {
      description: [customer?.fullName ?? newest.delivery?.recipient, formatVND(newest.total)]
        .filter(Boolean)
        .join(" · "),
      icon: <BellRingIcon className="size-4 text-orange" />,
      duration: 10_000,
      action: { label: "Xem đơn", onClick: () => openOrder(newest.code) },
    })
  }, [scoped, storeId, customers, openOrder])
}
