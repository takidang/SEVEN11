"use client"

import { CalendarDaysIcon, ExternalLinkIcon, PencilIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDate, formatNumber, formatPhone, formatVND, initials } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { ROLE_LABEL } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { EMPLOYEE_STATUS } from "@/lib/order-status"
import { ROLE_ORDER } from "@/lib/permissions"
import { useDb } from "@/stores/db"
import type { Employee, Store } from "@/types"

import { StoreForm } from "./store-form"
import { dayLabel, type StoreMetrics } from "./store-metrics"

export type StoreSheetState = { mode: "view" | "edit"; storeId: string } | { mode: "create" } | null

/** Store details (everyone who can open the page) and the create/edit form (admin). */
export function StoreSheet({
  state,
  onStateChange,
  metrics,
  canEdit,
  canOpenSchedule,
}: {
  state: StoreSheetState
  onStateChange: (state: StoreSheetState) => void
  metrics: Map<string, StoreMetrics>
  canEdit: boolean
  /** The viewer may open this store's shift schedule (admin: any store, manager: own store). */
  canOpenSchedule: (store: Store) => boolean
}) {
  const stores = useDb((s) => s.stores)
  const [shown, setShown] = useState<StoreSheetState>(state)
  if (state && state !== shown) setShown(state)

  const current = shown && shown.mode !== "create" ? stores.find((s) => s.id === shown.storeId) : undefined
  const open = !!state

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onStateChange(null))}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {shown?.mode === "create" ? (
          <>
            <SheetHeader className="border-b p-4 pr-12">
              <SheetTitle className="text-lg font-semibold">Thêm cửa hàng</SheetTitle>
              <SheetDescription>Mã 4 chữ số là mã định danh cửa hàng trên hoá đơn và báo cáo.</SheetDescription>
            </SheetHeader>
            <StoreForm
              store={null}
              onCancel={() => onStateChange(null)}
              onSaved={(saved) => onStateChange({ mode: "view", storeId: saved.id })}
            />
          </>
        ) : current && shown ? (
          shown.mode === "edit" && canEdit ? (
            <>
              <SheetHeader className="border-b p-4 pr-12">
                <SheetTitle className="text-lg font-semibold">
                  Sửa cửa hàng {current.code} – {current.name}
                </SheetTitle>
                <SheetDescription>Khai trương ngày {formatDate(current.openedAt)}</SheetDescription>
              </SheetHeader>
              <StoreForm
                key={current.id}
                store={current}
                onCancel={() => onStateChange({ mode: "view", storeId: current.id })}
                onSaved={(saved) => onStateChange({ mode: "view", storeId: saved.id })}
              />
            </>
          ) : (
            <StoreDetails
              store={current}
              metrics={metrics.get(current.id)}
              canEdit={canEdit}
              canOpenSchedule={canOpenSchedule(current)}
              onEdit={() => onStateChange({ mode: "edit", storeId: current.id })}
            />
          )
        ) : (
          <SheetHeader className="sr-only">
            <SheetTitle>Cửa hàng</SheetTitle>
            <SheetDescription>Thông tin cửa hàng</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function StoreDetails({
  store,
  metrics,
  canEdit,
  canOpenSchedule,
  onEdit,
}: {
  store: Store
  metrics?: StoreMetrics
  canEdit: boolean
  canOpenSchedule: boolean
  onEdit: () => void
}) {
  const router = useRouter()
  const { canSwitch, setStoreScope } = useStoreScope()
  const employees = useDb((s) => s.employees)
  const staff = useMemo(
    () =>
      employees
        .filter((e) => e.storeId === store.id)
        .sort(
          (a, b) =>
            ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
            Number(a.status === "inactive") - Number(b.status === "inactive") ||
            a.fullName.localeCompare(b.fullName, "vi"),
        ),
    [employees, store.id],
  )
  const manager = store.managerId ? employees.find((e) => e.id === store.managerId) : undefined
  const status = STORE_STATUS[store.status]
  const days = metrics?.days ?? []
  const maxRevenue = Math.max(1, ...days.map((d) => d.revenue))
  const activeStaff = staff.filter((e) => e.status !== "inactive").length

  const openSchedule = () => {
    if (canSwitch) setStoreScope(store.id)
    router.push("/quan-ly/nhan-vien?tab=lich-ca")
  }

  return (
    <>
      <SheetHeader className="gap-1 border-b p-4 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-lg font-semibold">
            <span className="tabular text-brand">{store.code}</span> – {store.name}
          </SheetTitle>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <SheetDescription>
          {store.address}, {store.ward}, {store.province}
        </SheetDescription>
        {canEdit || canOpenSchedule ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {canEdit ? (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <PencilIcon /> Sửa thông tin
              </Button>
            ) : null}
            {canOpenSchedule ? (
              <Button size="sm" variant="outline" onClick={openSchedule}>
                <CalendarDaysIcon /> Xem lịch ca
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Thông tin</h3>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Điện thoại</dt>
            <dd className="tabular">{formatPhone(store.phone)}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate">{store.email}</dd>
            <dt className="text-muted-foreground">Giờ mở cửa</dt>
            <dd>{store.openHours}</dd>
            <dt className="text-muted-foreground">Khai trương</dt>
            <dd>{formatDate(store.openedAt)}</dd>
            <dt className="text-muted-foreground">Quản lý</dt>
            <dd>{manager ? `${manager.fullName} · ${formatPhone(manager.phone)}` : "Chưa có quản lý"}</dd>
            <dt className="text-muted-foreground">Toạ độ</dt>
            <dd className="flex flex-wrap items-center gap-x-2">
              <span className="tabular">
                {store.lat.toFixed(4)}, {store.lng.toFixed(4)}
              </span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand hover:underline"
              >
                Xem bản đồ <ExternalLinkIcon className="size-3.5" />
              </a>
            </dd>
          </dl>
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Doanh thu 7 ngày</h3>
            {metrics ? (
              <span className="tabular text-xs text-muted-foreground">
                {formatVND(metrics.weekRevenue)} · {formatNumber(metrics.weekOrders)} đơn
              </span>
            ) : null}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-medium whitespace-nowrap">Ngày</th>
                <th className="py-1.5 text-left font-medium">
                  <span className="sr-only">Biểu đồ</span>
                </th>
                <th className="py-1.5 text-right font-medium whitespace-nowrap">Đơn</th>
                <th className="py-1.5 pl-4 text-right font-medium whitespace-nowrap">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {days
                .slice()
                .reverse()
                .map((d, i) => (
                  <tr key={d.key} className="border-b last:border-0">
                    <td className="py-2 whitespace-nowrap">{i === 0 ? "Hôm nay" : dayLabel(d.date)}</td>
                    <td className="w-full px-3 py-2">
                      <span className="block h-1.5 rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-chart-1"
                          style={{ width: `${(d.revenue / maxRevenue) * 100}%` }}
                        />
                      </span>
                    </td>
                    <td className="tabular py-2 text-right">{formatNumber(d.orders)}</td>
                    <td className="tabular py-2 pl-4 text-right whitespace-nowrap">{formatVND(d.revenue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Nhân viên</h3>
            <span className="text-xs text-muted-foreground">{formatNumber(activeStaff)} đang làm việc</span>
          </div>
          {staff.length ? (
            <ul className="divide-y rounded-lg ring-1 ring-border">
              {staff.map((e) => (
                <StaffRow key={e.id} employee={e} isManager={e.id === store.managerId} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg px-3 py-6 text-center text-sm text-muted-foreground ring-1 ring-border">
              Cửa hàng chưa có nhân viên.
            </p>
          )}
        </section>
      </div>
    </>
  )
}

function StaffRow({ employee, isManager }: { employee: Employee; isManager: boolean }) {
  const status = EMPLOYEE_STATUS[employee.status]
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Avatar className="size-8">
        <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-dark">
          {initials(employee.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{employee.fullName}</p>
        <p className="text-xs text-muted-foreground">
          {isManager ? "Quản lý cửa hàng" : ROLE_LABEL[employee.role]} ·{" "}
          <span className="tabular">{employee.code}</span> ·{" "}
          <span className="tabular">{formatPhone(employee.phone)}</span>
        </p>
      </div>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </li>
  )
}
