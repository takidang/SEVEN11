"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CalculatorIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { NumberInput } from "@/components/admin/number-input"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber, formatVND } from "@/lib/format"
import { SHIFT_TYPE } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Employee, Shift } from "@/types"

import { clock, dayMonth, parseDateKey, type ShiftCash, shiftWindow, weekdayShort } from "./staff-meta"

export type CashAction = { kind: "check-in"; shift: Shift } | { kind: "check-out"; shift: Shift } | null

export const STANDARD_FLOAT = 2_000_000

const DENOMINATIONS = [500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000]

/** "Thừa 20.000 ₫" / "Thiếu 30.000 ₫" / "Khớp" with the matching tone. */
export function differenceLabel(difference: number) {
  if (difference === 0) return { label: "Khớp", tone: "fresh" as const }
  if (difference > 0) return { label: `Thừa ${formatVND(difference)}`, tone: "warning" as const }
  return { label: `Thiếu ${formatVND(-difference)}`, tone: "danger" as const }
}

export function CashDialog({
  action,
  employees,
  cashFor,
  suggestedFloat,
  now,
  onClose,
}: {
  action: CashAction
  employees: Employee[]
  /** Cash figures for a shift (sales so far, expected drawer). */
  cashFor: (shift: Shift) => ShiftCash
  /** Opening float suggestion for a check-in (the previous closing count, or the standard float). */
  suggestedFloat: (shift: Shift) => number
  now: Date
  onClose: () => void
}) {
  const [shown, setShown] = useState<CashAction>(action)
  if (action && action !== shown) setShown(action)

  return (
    <Dialog open={!!action} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        {shown?.kind === "check-in" ? (
          <CheckInForm
            key={shown.shift.id}
            shift={shown.shift}
            employee={employees.find((e) => e.id === shown.shift.employeeId)}
            suggested={suggestedFloat(shown.shift)}
            now={now}
            onDone={onClose}
          />
        ) : shown?.kind === "check-out" ? (
          <CheckOutForm
            key={shown.shift.id}
            shift={shown.shift}
            employee={employees.find((e) => e.id === shown.shift.employeeId)}
            cash={cashFor(shown.shift)}
            now={now}
            onDone={onClose}
          />
        ) : (
          <DialogHeader className="sr-only">
            <DialogTitle>Tiền két</DialogTitle>
            <DialogDescription>Vào ca hoặc chốt ca</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function shiftTitle(shift: Shift) {
  const date = parseDateKey(shift.date)
  return `${SHIFT_TYPE[shift.type].label} · ${weekdayShort(date)} ${dayMonth(date)}`
}

const checkInSchema = z.object({
  openingCash: z
    .number({ error: "Nhập số tiền đầu ca" })
    .min(0, "Số tiền không hợp lệ")
    .max(50_000_000, "Tiền đầu ca tối đa 50.000.000 ₫"),
})

function CheckInForm({
  shift,
  employee,
  suggested,
  now,
  onDone,
}: {
  shift: Shift
  employee?: Employee
  suggested: number
  now: Date
  onDone: () => void
}) {
  const form = useForm<z.input<typeof checkInSchema>, unknown, z.output<typeof checkInSchema>>({
    resolver: zodResolver(checkInSchema),
    defaultValues: { openingCash: suggested },
  })
  const { errors } = form.formState
  const { start } = shiftWindow(shift.date, shift.type)
  const lateMinutes = Math.floor((now.getTime() - start.getTime()) / 60_000)

  const onSubmit = form.handleSubmit(({ openingCash }) => {
    useDb.getState().checkIn(shift.id, openingCash)
    toast.success(`${employee?.fullName ?? "Nhân viên"} đã vào ${SHIFT_TYPE[shift.type].label.toLowerCase()}`, {
      description: `Tiền đầu ca ${formatVND(openingCash)}`,
    })
    onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>Vào ca · {shiftTitle(shift)}</DialogTitle>
        <DialogDescription>
          {employee?.fullName ?? "Nhân viên"} · {SHIFT_TYPE[shift.type].time}
        </DialogDescription>
      </DialogHeader>
      {lateMinutes > 5 ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          Vào ca trễ {formatNumber(lateMinutes)} phút so với giờ bắt đầu {clock(start)}.
        </p>
      ) : null}
      <Field data-invalid={!!errors.openingCash}>
        <FieldLabel htmlFor="opening-cash">Tiền đầu ca trong két</FieldLabel>
        <Controller
          control={form.control}
          name="openingCash"
          render={({ field }) => (
            <NumberInput
              id="opening-cash"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              suffix="₫"
              invalid={!!errors.openingCash}
              autoFocus
            />
          )}
        />
        <FieldDescription className="text-xs">
          Đếm tiền lẻ nhận bàn giao. Gợi ý {formatVND(suggested)}
          {suggested === STANDARD_FLOAT ? " (quỹ tiền lẻ chuẩn)" : " (tiền cuối ca trước)"}.
        </FieldDescription>
        <FieldError errors={[errors.openingCash]} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit">Xác nhận vào ca</Button>
      </DialogFooter>
    </form>
  )
}

const checkOutSchema = z
  .object({
    closingCash: z.number({ error: "Nhập số tiền đếm được" }).min(0).max(500_000_000, "Số tiền quá lớn"),
    note: z.string().trim().max(200, "Ghi chú tối đa 200 ký tự"),
    expected: z.number(),
  })
  .refine((v) => v.closingCash === v.expected || v.note.length >= 5, {
    path: ["note"],
    message: "Tiền két bị lệch: ghi rõ lý do (tối thiểu 5 ký tự)",
  })

function CheckOutForm({
  shift,
  employee,
  cash,
  now,
  onDone,
}: {
  shift: Shift
  employee?: Employee
  cash: ShiftCash
  now: Date
  onDone: () => void
}) {
  const expected = cash.expected ?? cash.sales
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState<Record<number, number | undefined>>({})
  const form = useForm<z.input<typeof checkOutSchema>, unknown, z.output<typeof checkOutSchema>>({
    resolver: zodResolver(checkOutSchema),
    defaultValues: { closingCash: undefined, note: "", expected },
  })
  const { errors } = form.formState
  const closingCash = useWatch({ control: form.control, name: "closingCash" })
  const { end } = shiftWindow(shift.date, shift.type)
  const minutesLeft = Math.ceil((end.getTime() - now.getTime()) / 60_000)
  const difference = closingCash !== undefined ? closingCash - expected : null
  const diff = difference !== null ? differenceLabel(difference) : null

  const setCount = (denomination: number, count: number | undefined) => {
    const next = { ...counts, [denomination]: count }
    setCounts(next)
    const total = DENOMINATIONS.reduce((sum, d) => sum + d * (next[d] ?? 0), 0)
    form.setValue("closingCash", total, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })
  }

  const onSubmit = form.handleSubmit(({ closingCash: counted, note }) => {
    useDb.getState().checkOut(shift.id, counted, note || undefined)
    const result = differenceLabel(counted - expected)
    toast.success(`Đã chốt ${SHIFT_TYPE[shift.type].label.toLowerCase()} của ${employee?.fullName ?? "nhân viên"}`, {
      description: `Tiền két ${formatVND(counted)} · ${result.label}`,
    })
    onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>Chốt ca · {shiftTitle(shift)}</DialogTitle>
        <DialogDescription>
          {employee?.fullName ?? "Nhân viên"} · vào ca {shift.checkInAt ? clock(shift.checkInAt) : "—"}
        </DialogDescription>
      </DialogHeader>

      {minutesLeft > 0 ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
          Ca kết thúc lúc {clock(end)} (
          {minutesLeft >= 60
            ? `còn ${Math.floor(minutesLeft / 60)} giờ ${minutesLeft % 60} phút`
            : `còn ${minutesLeft} phút`}
          ). Chốt sớm sẽ ghi nhận giờ ra ca là bây giờ.
        </p>
      ) : null}

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
        <dt className="text-muted-foreground">Tiền đầu ca</dt>
        <dd className="tabular text-right">{formatVND(shift.openingCash ?? 0)}</dd>
        <dt className="text-muted-foreground">
          Tiền mặt bán được <span className="text-xs">({formatNumber(cash.orders)} đơn)</span>
        </dt>
        <dd className="tabular text-right">+ {formatVND(cash.sales)}</dd>
        <dt className="border-t pt-1.5 font-medium">Tiền dự kiến trong két</dt>
        <dd className="tabular border-t pt-1.5 text-right font-semibold">{formatVND(expected)}</dd>
      </dl>

      <Field data-invalid={!!errors.closingCash}>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor="closing-cash">Tiền mặt thực tế đếm được</FieldLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-brand"
            onClick={() => setCounting((c) => !c)}
            aria-expanded={counting}
          >
            <CalculatorIcon /> Đếm theo mệnh giá
            <ChevronDownIcon className={cn("transition-transform", counting && "rotate-180")} />
          </Button>
        </div>
        {counting ? (
          <div className="grid grid-cols-3 gap-2 rounded-lg p-2 ring-1 ring-border">
            {DENOMINATIONS.map((d) => (
              <label key={d} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {formatNumber(d)}
                <NumberInput
                  value={counts[d]}
                  onChange={(v) => setCount(d, v)}
                  grouping={false}
                  maxDigits={4}
                  suffix="tờ"
                  className="h-7"
                />
              </label>
            ))}
          </div>
        ) : null}
        <Controller
          control={form.control}
          name="closingCash"
          render={({ field }) => (
            <NumberInput
              id="closing-cash"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              suffix="₫"
              invalid={!!errors.closingCash}
              autoFocus
            />
          )}
        />
        <FieldError errors={[errors.closingCash]} />
      </Field>

      <div className="flex min-h-7 items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Chênh lệch</span>
        {diff ? (
          <StatusBadge tone={diff.tone}>{diff.label}</StatusBadge>
        ) : (
          <span className="text-muted-foreground">Nhập số tiền để đối chiếu</span>
        )}
      </div>

      <Field data-invalid={!!errors.note}>
        <FieldLabel htmlFor="closing-note">Ghi chú {difference ? "(bắt buộc khi lệch tiền)" : ""}</FieldLabel>
        <Textarea
          id="closing-note"
          rows={2}
          placeholder="VD: Thối nhầm cho khách 20.000 ₫"
          aria-invalid={!!errors.note}
          {...form.register("note")}
        />
        <FieldError errors={[errors.note]} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit">Chốt ca</Button>
      </DialogFooter>
    </form>
  )
}
