"use client"

import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, LogInIcon, ReceiptTextIcon, UserRoundXIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { type ColumnDef, DataTable } from "@/components/admin/data-table"
import { StatCard } from "@/components/admin/stat-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatNumber, formatVND, initials, toDateKey } from "@/lib/format"
import { SHIFT_STATUS, SHIFT_TYPE } from "@/lib/order-status"
import { useDb } from "@/stores/db"
import type { Employee, Shift, Store } from "@/types"

import { type CashAction, CashDialog, differenceLabel, STANDARD_FLOAT } from "./cash-dialogs"
import {
  addDays,
  clock,
  counterCashOrders,
  dayMonth,
  parseDateKey,
  SHIFT_TYPES,
  type ShiftCash,
  shiftCash,
  shiftWindow,
  weekdayLong,
} from "./staff-meta"

/** Check-in opens 30 minutes before the shift starts. */
const EARLY_CHECK_IN_MS = 30 * 60_000

interface Row {
  shift: Shift
  employee?: Employee
  cash: ShiftCash
}

export function ClosingTab({
  store,
  canManage,
  now,
  date,
  onDateChange,
}: {
  store: Store
  canManage: boolean
  now: Date
  /** yyyy-MM-dd */
  date: string
  onDateChange: (date: string) => void
}) {
  const shifts = useDb((s) => s.shifts)
  const orders = useDb((s) => s.orders)
  const employees = useDb((s) => s.employees)
  const [action, setAction] = useState<CashAction>(null)
  const todayKey = toDateKey(now)

  const cashOrders = useMemo(() => counterCashOrders(orders, store.id), [orders, store.id])
  const storeShifts = useMemo(() => shifts.filter((s) => s.storeId === store.id), [shifts, store.id])

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(employees.map((e) => [e.id, e] as const))
    return storeShifts
      .filter((s) => s.date === date)
      .sort((a, b) => SHIFT_TYPES.indexOf(a.type) - SHIFT_TYPES.indexOf(b.type))
      .map((shift) => ({ shift, employee: byId.get(shift.employeeId), cash: shiftCash(shift, cashOrders) }))
  }, [storeShifts, date, employees, cashOrders])

  const totals = useMemo(() => {
    let sales = 0
    let orderCount = 0
    let difference = 0
    let closed = 0
    let open = 0
    const short = { shifts: 0, amount: 0 }
    const over = { shifts: 0, amount: 0 }
    for (const { shift, cash } of rows) {
      sales += cash.sales
      orderCount += cash.orders
      if (shift.status === "completed") closed++
      if (shift.status === "in-progress" || shift.status === "scheduled") open++
      if (cash.difference !== null) {
        difference += cash.difference
        if (cash.difference < 0) {
          short.shifts++
          short.amount -= cash.difference
        } else if (cash.difference > 0) {
          over.shifts++
          over.amount += cash.difference
        }
      }
    }
    return { sales, orderCount, difference, closed, open, short, over }
  }, [rows])

  const differenceHint = [
    totals.short.shifts ? `thiếu ${formatVND(totals.short.amount)} ở ${totals.short.shifts} ca` : null,
    totals.over.shifts ? `thừa ${formatVND(totals.over.amount)} ở ${totals.over.shifts} ca` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  // What should be in the drawer: the running shift's expected cash, else the last closing count of the day.
  const running = rows.find((r) => r.shift.status === "in-progress" && r.cash.expected !== null)
  const lastClosed = [...rows].reverse().find((r) => r.shift.closingCash !== undefined)
  const drawer = running
    ? {
        label: "Tiền két dự kiến lúc này",
        amount: running.cash.expected!,
        hint: `${SHIFT_TYPE[running.shift.type].label} đang làm · tính đến ${clock(now)}`,
      }
    : lastClosed
      ? {
          label: "Tiền két khi chốt ca gần nhất",
          amount: lastClosed.shift.closingCash!,
          hint: `Đếm lúc chốt ${SHIFT_TYPE[lastClosed.shift.type].label.toLowerCase()}`,
        }
      : null

  const cashFor = (shift: Shift) => shiftCash(shift, cashOrders)
  const suggestedFloat = (shift: Shift) => {
    const { start } = shiftWindow(shift.date, shift.type)
    const previous = storeShifts
      .filter((s) => s.id !== shift.id && s.status === "completed" && s.closingCash !== undefined)
      .map((s) => ({ s, end: shiftWindow(s.date, s.type).end.getTime() }))
      .filter((x) => x.end <= start.getTime())
      .sort((a, b) => b.end - a.end)[0]
    return previous?.s.closingCash ?? STANDARD_FLOAT
  }

  const markAbsent = (row: Row) => {
    useDb.getState().saveShift({ ...row.shift, status: "absent" })
    toast.success(
      `Đã ghi nhận ${row.employee?.fullName ?? "nhân viên"} vắng ${SHIFT_TYPE[row.shift.type].label.toLowerCase()}`,
    )
  }

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: "shift",
      header: "Ca",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{SHIFT_TYPE[row.original.shift.type].label}</p>
          <p className="tabular text-xs text-muted-foreground">{SHIFT_TYPE[row.original.shift.type].time}</p>
        </div>
      ),
    },
    {
      id: "employee",
      header: "Nhân viên",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-brand-soft text-[11px] font-semibold text-brand-dark">
              {row.original.employee ? initials(row.original.employee.fullName) : "?"}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{row.original.employee?.fullName ?? "Không rõ"}</span>
        </div>
      ),
    },
    {
      id: "attendance",
      header: "Vào → ra",
      enableSorting: false,
      cell: ({ row }) => {
        const { shift } = row.original
        return (
          <span className="tabular">
            {shift.checkInAt ? clock(shift.checkInAt) : "—"} → {shift.checkOutAt ? clock(shift.checkOutAt) : "—"}
          </span>
        )
      },
    },
    {
      id: "opening",
      header: "Tiền đầu ca",
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => money(row.original.shift.openingCash),
    },
    {
      id: "sales",
      header: "Tiền mặt bán được",
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) =>
        row.original.shift.status === "absent" ||
        now < shiftWindow(row.original.shift.date, row.original.shift.type).start ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div>
            <p>{formatVND(row.original.cash.sales)}</p>
            <p className="text-xs text-muted-foreground">{formatNumber(row.original.cash.orders)} đơn tiền mặt</p>
          </div>
        ),
    },
    {
      id: "expected",
      header: "Tiền dự kiến",
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => money(row.original.cash.expected ?? undefined),
    },
    {
      id: "actual",
      header: "Tiền thực tế",
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => money(row.original.shift.closingCash),
    },
    {
      id: "difference",
      header: "Chênh lệch",
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        const { cash, shift } = row.original
        if (cash.difference === null) return <span className="text-muted-foreground">—</span>
        const d = differenceLabel(cash.difference)
        return (
          <div className="flex flex-col items-end gap-1">
            <StatusBadge tone={d.tone}>{d.label}</StatusBadge>
            {shift.note ? (
              <span className="max-w-48 truncate text-xs text-muted-foreground" title={shift.note}>
                {shift.note}
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "status",
      header: "Trạng thái",
      enableSorting: false,
      cell: ({ row }) => {
        const { shift } = row.original
        const { start } = shiftWindow(shift.date, shift.type)
        const late = shift.status === "scheduled" && now >= start
        return (
          <StatusBadge tone={late ? "warning" : SHIFT_STATUS[shift.status].tone}>
            {late ? "Chưa vào ca" : SHIFT_STATUS[shift.status].label}
          </StatusBadge>
        )
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        if (!canManage) return null
        const { shift } = row.original
        const { start, end } = shiftWindow(shift.date, shift.type)
        if (shift.status === "in-progress") {
          return (
            <Button size="sm" onClick={() => setAction({ kind: "check-out", shift })}>
              <ReceiptTextIcon /> Chốt ca
            </Button>
          )
        }
        if (shift.status === "scheduled") {
          const canCheckIn = now.getTime() >= start.getTime() - EARLY_CHECK_IN_MS && now < end
          return (
            <div className="flex justify-end gap-1.5">
              {now >= start ? (
                <Button size="sm" variant="outline" onClick={() => markAbsent(row.original)}>
                  <UserRoundXIcon /> Vắng
                </Button>
              ) : null}
              {canCheckIn ? (
                <Button size="sm" onClick={() => setAction({ kind: "check-in", shift })}>
                  <LogInIcon /> Vào ca
                </Button>
              ) : null}
            </div>
          )
        }
        return null
      },
    },
  ]

  const day = parseDateKey(date)
  const shiftDay = (delta: number) => onDateChange(toDateKey(addDays(day, delta)))
  // A shift of another day still open (typically last night's shift, which runs until 06:00).
  const openElsewhere = storeShifts
    .filter((s) => s.status === "in-progress" && s.date !== date)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const openElsewhereDay = openElsewhere ? parseDateKey(openElsewhere.date) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Ngày trước" onClick={() => shiftDay(-1)}>
            <ChevronLeftIcon />
          </Button>
          <Input
            type="date"
            value={date}
            max={todayKey}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="w-40 bg-card"
            aria-label="Ngày chốt ca"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Ngày sau"
            onClick={() => shiftDay(1)}
            disabled={date >= todayKey}
          >
            <ChevronRightIcon />
          </Button>
          <Button variant="outline" onClick={() => onDateChange(todayKey)} disabled={date === todayKey}>
            Hôm nay
          </Button>
        </div>
        <p className="text-sm font-medium">
          {date === todayKey ? `Hôm nay, ${weekdayLong(day).toLowerCase()}` : weekdayLong(day)} {dayMonth(day)}/
          {day.getFullYear()}
          <span className="ml-2 hidden font-normal text-muted-foreground sm:inline">
            Cửa hàng {store.code} – {store.name}
          </span>
        </p>
      </div>

      {openElsewhere && openElsewhereDay ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-info-soft px-4 py-2.5 text-sm text-info">
          <ClockIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {SHIFT_TYPE[openElsewhere.type].label} {weekdayLong(openElsewhereDay).toLowerCase()}{" "}
            {dayMonth(openElsewhereDay)} của{" "}
            {employees.find((e) => e.id === openElsewhere.employeeId)?.fullName ?? "nhân viên"} vẫn đang làm (
            {SHIFT_TYPE[openElsewhere.type].time}).
          </span>
          <Button size="sm" variant="outline" className="bg-card" onClick={() => onDateChange(openElsewhere.date)}>
            Xem ngày {dayMonth(openElsewhereDay)}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tiền mặt bán tại quầy"
          value={formatVND(totals.sales)}
          hint={`${formatNumber(totals.orderCount)} đơn trả tiền mặt trong các ca`}
        />
        <StatCard
          label="Ca đã chốt"
          value={`${formatNumber(totals.closed)} / ${formatNumber(rows.length)}`}
          hint={
            !rows.length
              ? "Không có ca nào trong ngày"
              : totals.open
                ? `${totals.open} ca chưa kết thúc hoặc chưa chốt`
                : "Đã chốt xong các ca trong ngày"
          }
        />
        <StatCard
          label="Chênh lệch két (cộng dồn)"
          value={totals.closed ? differenceLabel(totals.difference).label : "—"}
          hint={
            !totals.closed
              ? "Chưa có ca nào được chốt"
              : differenceHint
                ? `Gồm ${differenceHint}`
                : "Các ca đã chốt đều khớp tiền"
          }
        />
        {drawer ? (
          <StatCard label={drawer.label} value={formatVND(drawer.amount)} hint={drawer.hint} />
        ) : (
          <StatCard label="Tiền trong két" value="—" hint="Chưa có ca nào vào ca trong ngày" />
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        pageSize={10}
        emptyTitle="Không có ca nào trong ngày"
        emptyDescription="Xếp người vào ca ở tab “Lịch ca” để theo dõi vào ca và chốt tiền két."
      />

      <CashDialog
        action={action}
        employees={employees}
        cashFor={cashFor}
        suggestedFloat={suggestedFloat}
        now={now}
        onClose={() => setAction(null)}
      />
    </div>
  )
}

function money(value: number | undefined) {
  return value === undefined ? <span className="text-muted-foreground">—</span> : formatVND(value)
}
