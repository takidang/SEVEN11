"use client"

import { ClockAlertIcon, LogInIcon, LogOutIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, formatDateTime, formatTime, formatVND, toDateKey } from "@/lib/format"
import { SHIFT_TYPE } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { newId, useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import type { Employee, Shift, ShiftType, Store } from "@/types"

import { MoneyInput } from "./money-input"

const DEFAULT_OPENING_CASH = 2_000_000

/** The shift slot a moment falls in. 00:00–06:00 belongs to the night shift that started the day before. */
function slotAt(now: Date): { type: ShiftType; date: string } {
  const h = now.getHours()
  if (h >= 6 && h < 14) return { type: "morning", date: toDateKey(now) }
  if (h >= 14 && h < 22) return { type: "afternoon", date: toDateKey(now) }
  if (h >= 22) return { type: "night", date: toDateKey(now) }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return { type: "night", date: toDateKey(yesterday) }
}

/** Shift chip in the POS top bar: "Chưa vào ca" → check in; in a shift → cash summary + check out. */
export function ShiftControl({ staff, store }: { staff: Employee; store: Store }) {
  const shifts = useDb((s) => s.shifts)
  const current = useMemo(
    () => shifts.find((s) => s.employeeId === staff.id && s.storeId === store.id && s.status === "in-progress"),
    [shifts, staff.id, store.id],
  )
  const [checkInOpen, setCheckInOpen] = useState(false)

  if (!current) {
    return (
      <>
        <Button
          variant="outline"
          className="h-9 gap-2 border-dashed border-orange/50 bg-orange-soft/60 hover:bg-orange-soft"
          onClick={() => setCheckInOpen(true)}
        >
          <ClockAlertIcon className="text-orange" />
          <span className="font-medium">Chưa vào ca</span>
          <span className="rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-brand ring-1 ring-border">
            Vào ca
          </span>
        </Button>
        <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} staff={staff} store={store} />
      </>
    )
  }

  return <CurrentShift shift={current} staff={staff} />
}

function CheckInDialog({
  open,
  onOpenChange,
  staff,
  store,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: Employee
  store: Store
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <CheckInForm staff={staff} store={store} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function CheckInForm({ staff, store, onDone }: { staff: Employee; store: Store; onDone: () => void }) {
  const shifts = useDb((s) => s.shifts)
  const now = useNow(60_000)
  const [openingCash, setOpeningCash] = useState<number | null>(DEFAULT_OPENING_CASH)

  const slot = now ? slotAt(now) : null
  const scheduled = slot
    ? shifts.find(
        (s) =>
          s.employeeId === staff.id &&
          s.storeId === store.id &&
          s.date === slot.date &&
          s.type === slot.type &&
          s.status === "scheduled",
      )
    : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (openingCash === null) {
      toast.error("Nhập tiền đầu ca")
      return
    }
    const target = slotAt(new Date())
    const db = useDb.getState()
    let shift = db.shifts.find(
      (s) =>
        s.employeeId === staff.id &&
        s.storeId === store.id &&
        s.date === target.date &&
        s.type === target.type &&
        s.status === "scheduled",
    )
    if (!shift) {
      shift = { id: newId("sh"), storeId: store.id, employeeId: staff.id, ...target, status: "scheduled" }
      db.saveShift(shift)
    }
    db.checkIn(shift.id, openingCash)
    toast.success(`Đã vào ${SHIFT_TYPE[target.type].label.toLowerCase()} · tiền đầu ca ${formatVND(openingCash)}`)
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Vào ca làm việc</DialogTitle>
        <DialogDescription>
          Đếm tiền trong két trước khi bắt đầu bán. Số tiền này dùng để đối chiếu khi kết ca.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-muted/50 px-4 py-3 text-sm ring-1 ring-border">
        <dt className="text-muted-foreground">Nhân viên</dt>
        <dd className="font-medium">
          {staff.fullName} <span className="font-normal text-muted-foreground">· {staff.code}</span>
        </dd>
        <dt className="text-muted-foreground">Cửa hàng</dt>
        <dd className="font-medium">
          {store.code} – {store.name}
        </dd>
        <dt className="text-muted-foreground">Ca làm</dt>
        <dd className="font-medium">
          {slot ? (
            <>
              {SHIFT_TYPE[slot.type].label} · {SHIFT_TYPE[slot.type].time}
              <span className="block text-xs font-normal text-muted-foreground">
                {scheduled ? `Theo lịch ngày ${formatDate(slot.date)}` : "Chưa có lịch — hệ thống sẽ tạo ca mới"}
              </span>
            </>
          ) : (
            "—"
          )}
        </dd>
      </dl>
      <div className="grid gap-1.5">
        <Label htmlFor="pos-opening-cash">Tiền đầu ca trong két</Label>
        <MoneyInput
          id="pos-opening-cash"
          autoFocus
          value={openingCash}
          onChange={setOpeningCash}
          className="h-11"
          inputClassName="text-lg font-semibold md:text-lg"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Để sau
        </Button>
        <Button type="submit">
          <LogInIcon /> Vào ca
        </Button>
      </DialogFooter>
    </form>
  )
}

function CurrentShift({ shift, staff }: { shift: Shift; staff: Employee }) {
  const orders = useDb((s) => s.orders)
  const [open, setOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)
  const type = SHIFT_TYPE[shift.type]

  const summary = useMemo(() => {
    const since = shift.checkInAt ?? `${shift.date}T00:00:00`
    let cashSales = 0
    let otherSales = 0
    let count = 0
    for (const o of orders) {
      if (o.createdAt < since) break // newest first
      if (o.channel !== "in-store" || o.storeId !== shift.storeId || o.employeeId !== staff.id) continue
      if (o.status === "cancelled") continue
      count++
      if (o.paymentMethod === "cash") cashSales += o.total
      else otherSales += o.total
    }
    const openingCash = shift.openingCash ?? 0
    return { cashSales, otherSales, count, openingCash, expectedCash: openingCash + cashSales }
  }, [orders, shift, staff.id])

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-fresh opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-fresh" />
            </span>
            <span className="font-medium">{type.label}</span>
            <span className="hidden text-muted-foreground xl:inline">
              · vào lúc {shift.checkInAt ? formatTime(shift.checkInAt) : "—"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-0 p-0">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">
              {type.label} · {type.time}
            </p>
            <p className="text-xs text-muted-foreground">
              Lịch ngày {formatDate(shift.date)} · vào ca lúc {shift.checkInAt ? formatDateTime(shift.checkInAt) : "—"}
            </p>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">Đơn đã bán trong ca</dt>
            <dd className="tabular text-right font-medium">{summary.count}</dd>
            <dt className="text-muted-foreground">Tiền đầu ca</dt>
            <dd className="tabular text-right">{formatVND(summary.openingCash)}</dd>
            <dt className="text-muted-foreground">Thu tiền mặt</dt>
            <dd className="tabular text-right">{formatVND(summary.cashSales)}</dd>
            <dt className="text-muted-foreground">Thẻ, ví, chuyển khoản</dt>
            <dd className="tabular text-right">{formatVND(summary.otherSales)}</dd>
            <dt className="border-t pt-1.5 font-medium">Tiền mặt dự kiến trong két</dt>
            <dd className="tabular border-t pt-1.5 text-right font-semibold">{formatVND(summary.expectedCash)}</dd>
          </dl>
          <div className="border-t p-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setOpen(false)
                setCheckOutOpen(true)
              }}
            >
              <LogOutIcon /> Kết ca
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={checkOutOpen} onOpenChange={setCheckOutOpen}>
        <DialogContent className="sm:max-w-md">
          {checkOutOpen ? (
            <CheckOutForm shift={shift} expectedCash={summary.expectedCash} onDone={() => setCheckOutOpen(false)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CheckOutForm({ shift, expectedCash, onDone }: { shift: Shift; expectedCash: number; onDone: () => void }) {
  const [closingCash, setClosingCash] = useState<number | null>(expectedCash)
  const [note, setNote] = useState("")
  const diff = closingCash === null ? null : closingCash - expectedCash

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (closingCash === null) {
      toast.error("Nhập số tiền mặt đếm được trong két")
      return
    }
    useDb.getState().checkOut(shift.id, closingCash, note.trim() || undefined)
    toast.success(`Đã kết ${SHIFT_TYPE[shift.type].label.toLowerCase()}`)
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Kết ca</DialogTitle>
        <DialogDescription>Đếm tiền mặt trong két và ghi chú nếu có chênh lệch.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="pos-closing-cash">Tiền mặt đếm được</Label>
        <MoneyInput
          id="pos-closing-cash"
          autoFocus
          value={closingCash}
          onChange={setClosingCash}
          className="h-11"
          inputClassName="text-lg font-semibold md:text-lg"
        />
        <p className="text-xs text-muted-foreground">
          Dự kiến {formatVND(expectedCash)}
          {diff !== null && diff !== 0 ? (
            <span className={cn("ml-1 font-medium", diff < 0 ? "text-destructive" : "text-warning")}>
              · {diff < 0 ? "thiếu" : "thừa"} {formatVND(Math.abs(diff))}
            </span>
          ) : null}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pos-shift-note">Ghi chú</Label>
        <Textarea
          id="pos-shift-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: đã nộp 3.000.000 ₫ cho quản lý"
          rows={2}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit">
          <LogOutIcon /> Kết ca
        </Button>
      </DialogFooter>
    </form>
  )
}
