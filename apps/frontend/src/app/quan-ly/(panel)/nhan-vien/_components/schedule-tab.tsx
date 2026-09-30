"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  SunsetIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatNumber, initials, toDateKey } from "@/lib/format"
import { SHIFT_STATUS, SHIFT_TYPE } from "@/lib/order-status"
import { ROLE_LABEL } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Employee, Shift, ShiftType, Store } from "@/types"

import { AssignShiftDialog, type Slot } from "./assign-shift-dialog"
import {
  addDays,
  dayMonth,
  mondayOf,
  rosterOf,
  runsShift,
  SHIFT_TYPES,
  shiftWindow,
  shortName,
  weekdayShort,
} from "./staff-meta"

const SHIFT_ICON: Record<ShiftType, typeof SunIcon> = { morning: SunIcon, afternoon: SunsetIcon, night: MoonIcon }

const URGENT_GAP_MS = 3 * 86_400_000

export function ScheduleTab({
  store,
  canManage,
  now,
  onReviewDay,
}: {
  store: Store
  canManage: boolean
  now: Date
  /** Jump to the cash reconciliation of a day. */
  onReviewDay: (date: string) => void
}) {
  const allShifts = useDb((s) => s.shifts)
  const employees = useDb((s) => s.employees)
  const [weekOffset, setWeekOffset] = useState(0)
  const [slot, setSlot] = useState<Slot | null>(null)

  const monday = addDays(mondayOf(now), weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const keys = days.map(toDateKey)
  const firstKey = keys[0]
  const lastKey = keys[6]
  const todayKey = toDateKey(now)

  const storeShifts = useMemo(() => allShifts.filter((s) => s.storeId === store.id), [allShifts, store.id])
  const bySlot = useMemo(() => {
    const map = new Map<string, Shift>()
    for (const s of storeShifts) if (s.date >= firstKey && s.date <= lastKey) map.set(`${s.date}:${s.type}`, s)
    return map
  }, [storeShifts, firstKey, lastKey])
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees])
  const roster = useMemo(() => rosterOf(employees, store.id), [employees, store.id])

  // Open slots that still matter (not over yet).
  let openSlots = 0
  let totalSlots = 0
  for (const key of keys) {
    for (const type of SHIFT_TYPES) {
      if (!runsShift(store, type)) continue
      totalSlots++
      if (!bySlot.has(`${key}:${type}`) && shiftWindow(key, type).end > now) openSlots++
    }
  }

  // Shifts per person this week (roster + anyone else still on the rota, e.g. on leave).
  const load = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of bySlot.values()) counts.set(s.employeeId, (counts.get(s.employeeId) ?? 0) + 1)
    const people: Employee[] = [...roster]
    for (const id of counts.keys()) {
      const e = employeeById.get(id)
      if (e && !people.some((p) => p.id === id)) people.push(e)
    }
    return people.map((e) => ({ employee: e, shifts: counts.get(e.id) ?? 0 }))
  }, [bySlot, roster, employeeById])
  const maxLoad = Math.max(1, ...load.map((l) => l.shifts))

  // On narrow screens the grid scrolls sideways: bring today's column into view.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = scrollRef.current
    const today = container?.querySelector<HTMLElement>('th[aria-current="date"]')
    const rowHeader = container?.querySelector<HTMLElement>("thead th")
    if (!container || !today || !rowHeader || container.scrollWidth <= container.clientWidth) return
    // Line today's column up right after the sticky "Ca làm" column.
    container.scrollTo({ left: Math.max(0, today.offsetLeft - rowHeader.offsetWidth) })
  }, [weekOffset])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Tuần trước" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
            Tuần này
          </Button>
          <Button variant="outline" size="icon" aria-label="Tuần sau" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
        <p className="text-sm font-medium">
          Tuần {dayMonth(days[0])} – {dayMonth(days[6])}/{days[6].getFullYear()}
          <span className="ml-2 hidden font-normal text-muted-foreground sm:inline">
            Cửa hàng {store.code} – {store.name}
          </span>
        </p>
        <div className="ml-auto">
          {openSlots ? (
            <StatusBadge tone="warning" className="h-7 px-3">
              <TriangleAlertIcon className="size-3.5" /> Còn {openSlots} ca chưa có người
            </StatusBadge>
          ) : (
            <StatusBadge tone="fresh" className="h-7 px-3">
              <CircleCheckIcon className="size-3.5" /> Đã đủ người cho các ca còn lại
            </StatusBadge>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
        <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
          <caption className="sr-only">
            Lịch ca tuần {dayMonth(days[0])} – {dayMonth(days[6])} của cửa hàng {store.code}
          </caption>
          <thead>
            <tr className="border-b">
              <th
                scope="col"
                className="sticky left-0 z-20 w-28 bg-card px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border sm:w-32"
              >
                Ca làm
              </th>
              {days.map((d, i) => {
                const today = keys[i] === todayKey
                return (
                  <th
                    key={keys[i]}
                    scope="col"
                    className={cn("px-2 py-2 text-center font-normal", today && "bg-brand-soft")}
                    aria-current={today ? "date" : undefined}
                  >
                    <span
                      className={cn("block text-xs", today ? "font-semibold text-brand-dark" : "text-muted-foreground")}
                    >
                      {today ? "Hôm nay" : weekdayShort(d)}
                    </span>
                    <span className={cn("tabular block text-sm font-semibold", today && "text-brand-dark")}>
                      {dayMonth(d)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {SHIFT_TYPES.map((type) => {
              const Icon = SHIFT_ICON[type]
              return (
                <tr key={type} className="border-b last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-20 bg-card px-3 py-2 text-left align-top after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Icon className="size-4 text-muted-foreground" /> {SHIFT_TYPE[type].label}
                    </span>
                    <span className="tabular mt-0.5 block text-xs font-normal text-muted-foreground">
                      {SHIFT_TYPE[type].time}
                    </span>
                  </th>
                  {keys.map((key) => (
                    <td key={key} className={cn("p-1.5 align-top", key === todayKey && "bg-brand-soft/40")}>
                      <SlotCell
                        store={store}
                        date={key}
                        type={type}
                        shift={bySlot.get(`${key}:${type}`)}
                        employee={employeeById.get(bySlot.get(`${key}:${type}`)?.employeeId ?? "")}
                        now={now}
                        canManage={canManage}
                        onOpen={() => setSlot({ date: key, type })}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl bg-card ring-1 ring-border">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">Phân bổ ca trong tuần</h2>
          <span className="text-xs text-muted-foreground">
            {formatNumber(totalSlots - openSlots)} / {formatNumber(totalSlots)} ca đã có người · mỗi ca 8 giờ
          </span>
        </div>
        {load.length ? (
          <ul className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {load.map(({ employee, shifts }) => (
              <li key={employee.id} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{employee.fullName}</span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {shifts} ca · {shifts * 8} giờ
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="block h-1.5 flex-1 rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-chart-1"
                      style={{ width: `${(shifts / maxLoad) * 100}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {employee.status === "active" ? ROLE_LABEL[employee.role] : "Nghỉ phép"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Cửa hàng chưa có nhân viên đang làm việc.</p>
        )}
      </section>

      <AssignShiftDialog
        store={store}
        slot={slot}
        shifts={storeShifts}
        employees={employees}
        roster={roster}
        now={now}
        onClose={() => setSlot(null)}
        onReviewDay={onReviewDay}
      />
    </div>
  )
}

function SlotCell({
  store,
  date,
  type,
  shift,
  employee,
  now,
  canManage,
  onOpen,
}: {
  store: Store
  date: string
  type: ShiftType
  shift?: Shift
  employee?: Employee
  now: Date
  canManage: boolean
  onOpen: () => void
}) {
  const base = "flex min-h-[4.5rem] w-full flex-col items-start gap-1.5 rounded-lg p-2 text-left"
  if (!runsShift(store, type)) {
    return (
      <div className={cn(base, "items-center justify-center bg-muted/60 text-center text-xs text-muted-foreground")}>
        Không mở ca đêm
      </div>
    )
  }

  const { start, end } = shiftWindow(date, type)
  const over = end <= now
  const live = start <= now && now < end

  if (!shift) {
    if (over) {
      return (
        <div className={cn(base, "items-center justify-center text-center text-xs text-muted-foreground")}>
          Không có ca
        </div>
      )
    }
    // Gaps in the next 3 days are urgent; later ones are simply still open.
    const urgent = start.getTime() - now.getTime() < URGENT_GAP_MS
    const label = (
      <>
        <span className="flex items-center gap-1 text-xs font-medium">
          {urgent ? <TriangleAlertIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
          {canManage ? "Xếp người" : "Chưa có người"}
        </span>
        <span className="text-[11px] opacity-80">
          {live ? "Ca đang trống" : urgent ? "Sắp đến ca" : "Chưa có người"}
        </span>
      </>
    )
    const look = urgent
      ? "border border-dashed border-warning/40 bg-warning-soft/50 text-warning"
      : "border border-dashed border-border text-muted-foreground"
    return canManage ? (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          base,
          look,
          "transition-colors",
          urgent
            ? "hover:border-warning hover:bg-warning-soft"
            : "hover:border-brand/50 hover:bg-brand-soft/40 hover:text-brand",
        )}
      >
        {label}
      </button>
    ) : (
      <div className={cn(base, look)}>{label}</div>
    )
  }

  const late = shift.status === "scheduled" && start <= now
  const badge = late
    ? { label: over ? "Chưa chấm công" : "Chưa vào ca", tone: "warning" as const }
    : SHIFT_STATUS[shift.status]
  const content = (
    <>
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <Avatar className="size-6">
          <AvatarFallback className="bg-brand-soft text-[10px] font-semibold text-brand-dark">
            {employee ? initials(employee.fullName) : "?"}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-xs font-medium" title={employee?.fullName}>
          {employee ? shortName(employee.fullName) : "Không rõ"}
        </span>
      </span>
      <StatusBadge tone={badge.tone} className="h-5 max-w-full px-2 text-[11px]">
        <span className="truncate">{badge.label}</span>
      </StatusBadge>
    </>
  )
  const tone = cn(
    base,
    "bg-background ring-1 ring-border",
    live && "ring-2 ring-brand/60",
    shift.status === "absent" && "bg-red-soft/40",
  )
  return canManage ? (
    <button
      type="button"
      onClick={onOpen}
      className={cn(tone, "transition-shadow hover:ring-brand")}
      aria-label={`${SHIFT_TYPE[type].label} ${date}: ${employee?.fullName ?? "không rõ"}, ${badge.label}`}
    >
      {content}
    </button>
  ) : (
    <div className={tone}>{content}</div>
  )
}
