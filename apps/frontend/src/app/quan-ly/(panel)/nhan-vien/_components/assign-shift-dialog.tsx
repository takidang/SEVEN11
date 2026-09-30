"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ReceiptTextIcon, Trash2Icon, UserRoundXIcon } from "lucide-react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { StatusBadge } from "@/components/admin/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { formatVND, initials, toDateKey } from "@/lib/format"
import { SHIFT_STATUS, SHIFT_TYPE } from "@/lib/order-status"
import { ROLE_LABEL } from "@/lib/permissions"
import { useDb } from "@/stores/db"
import type { Employee, Shift, ShiftType, Store } from "@/types"

import { addDays, clock, dayMonth, mondayOf, parseDateKey, shiftId, shiftWindow, weekdayLong } from "./staff-meta"

export interface Slot {
  date: string
  type: ShiftType
}

const schema = z.object({ employeeId: z.string().min(1, "Chọn nhân viên cho ca này") })
type Values = z.infer<typeof schema>

/** Assign / change / remove the person on one slot of the rota, or review a shift that already started. */
export function AssignShiftDialog({
  store,
  slot,
  shifts,
  employees,
  roster,
  now,
  onClose,
  onReviewDay,
}: {
  store: Store
  slot: Slot | null
  /** All shifts of this store. */
  shifts: Shift[]
  employees: Employee[]
  roster: Employee[]
  now: Date
  onClose: () => void
  onReviewDay: (date: string) => void
}) {
  const [shown, setShown] = useState<Slot | null>(slot)
  if (slot && slot !== shown) setShown(slot)

  return (
    <Dialog open={!!slot} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        {shown ? (
          <SlotBody
            key={`${shown.date}-${shown.type}`}
            store={store}
            slot={shown}
            shifts={shifts}
            employees={employees}
            roster={roster}
            now={now}
            onClose={onClose}
            onReviewDay={onReviewDay}
          />
        ) : (
          <DialogHeader className="sr-only">
            <DialogTitle>Ca làm</DialogTitle>
            <DialogDescription>Xếp nhân viên vào ca</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SlotBody({
  store,
  slot,
  shifts,
  employees,
  roster,
  now,
  onClose,
  onReviewDay,
}: {
  store: Store
  slot: Slot
  shifts: Shift[]
  employees: Employee[]
  roster: Employee[]
  now: Date
  onClose: () => void
  onReviewDay: (date: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const shift = shifts.find((s) => s.date === slot.date && s.type === slot.type)
  const assigned = shift ? employees.find((e) => e.id === shift.employeeId) : undefined
  const { start, end } = shiftWindow(slot.date, slot.type)
  const date = parseDateKey(slot.date)
  const meta = SHIFT_TYPE[slot.type]
  const started = now >= start
  const editable = (!shift || shift.status === "scheduled") && now < end
  const title = `${meta.label} · ${weekdayLong(date)} ${dayMonth(date)}`

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { employeeId: shift?.employeeId ?? "" },
  })
  const { errors } = form.formState

  // Week load and same-day conflicts help pick someone fairly.
  const weekFirst = toDateKey(mondayOf(date))
  const weekLast = toDateKey(addDays(mondayOf(date), 6))
  const weekLoad = (employeeId: string) =>
    shifts.filter((s) => s.employeeId === employeeId && s.date >= weekFirst && s.date <= weekLast).length
  const sameDay = (employeeId: string) =>
    shifts
      .filter((s) => s.employeeId === employeeId && s.date === slot.date && s.type !== slot.type)
      .map((s) => SHIFT_TYPE[s.type].label)

  const onSubmit = form.handleSubmit(({ employeeId }) => {
    const person = employees.find((e) => e.id === employeeId)
    useDb.getState().saveShift({
      id: shift?.id ?? shiftId(store.code, slot.date, slot.type),
      storeId: store.id,
      employeeId,
      date: slot.date,
      type: slot.type,
      status: "scheduled",
    })
    toast.success(`Đã xếp ${person?.fullName ?? "nhân viên"} vào ${meta.label.toLowerCase()} ${dayMonth(date)}`)
    onClose()
  })

  const markAbsent = () => {
    if (!shift) return
    useDb.getState().saveShift({ ...shift, status: "absent" })
    toast.success(`Đã ghi nhận ${assigned?.fullName ?? "nhân viên"} vắng ${meta.label.toLowerCase()}`)
    onClose()
  }

  const remove = () => {
    if (!shift) return
    useDb.getState().deleteShift(shift.id)
    toast.success(`Đã xoá ${meta.label.toLowerCase()} ${dayMonth(date)}`)
    onClose()
  }

  if (!editable) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {meta.time} · Cửa hàng {store.code} – {store.name}
          </DialogDescription>
        </DialogHeader>
        {shift ? (
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Nhân viên</dt>
            <dd>{assigned?.fullName ?? "Không rõ"}</dd>
            <dt className="text-muted-foreground">Trạng thái</dt>
            <dd>
              <StatusBadge tone={SHIFT_STATUS[shift.status].tone}>{SHIFT_STATUS[shift.status].label}</StatusBadge>
            </dd>
            <dt className="text-muted-foreground">Vào ca / ra ca</dt>
            <dd className="tabular">
              {shift.checkInAt ? clock(shift.checkInAt) : "—"} → {shift.checkOutAt ? clock(shift.checkOutAt) : "—"}
            </dd>
            <dt className="text-muted-foreground">Tiền đầu ca</dt>
            <dd className="tabular">{shift.openingCash !== undefined ? formatVND(shift.openingCash) : "—"}</dd>
            <dt className="text-muted-foreground">Tiền cuối ca</dt>
            <dd className="tabular">{shift.closingCash !== undefined ? formatVND(shift.closingCash) : "—"}</dd>
            {shift.note ? (
              <>
                <dt className="text-muted-foreground">Ghi chú</dt>
                <dd>{shift.note}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Ca này đã qua và không có ai được xếp.</p>
        )}
        {shift?.status === "scheduled" && now >= end ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Ca đã kết thúc nhưng nhân viên chưa chấm công vào ca.
          </p>
        ) : null}
        <DialogFooter>
          {shift?.status === "scheduled" ? (
            <Button variant="outline" onClick={markAbsent} className="sm:mr-auto">
              <UserRoundXIcon /> Đánh dấu vắng
            </Button>
          ) : null}
          {shift && shift.status !== "absent" ? (
            <Button
              variant="outline"
              onClick={() => {
                onClose()
                onReviewDay(slot.date)
              }}
            >
              <ReceiptTextIcon /> Xem chốt ca
            </Button>
          ) : null}
          <Button onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="contents">
      <DialogHeader>
        <DialogTitle>{shift ? `Đổi người · ${title}` : `Xếp ca · ${title}`}</DialogTitle>
        <DialogDescription>
          {meta.time} · Cửa hàng {store.code} – {store.name}
        </DialogDescription>
      </DialogHeader>

      {started && shift ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          Ca đã bắt đầu lúc {clock(start)} nhưng {assigned?.fullName ?? "nhân viên"} chưa vào ca.
        </p>
      ) : null}

      {roster.length ? (
        <Field data-invalid={!!errors.employeeId}>
          <Controller
            control={form.control}
            name="employeeId"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                aria-label="Nhân viên"
                className="max-h-[50dvh] gap-2 overflow-y-auto p-0.5"
              >
                {roster.map((e) => {
                  const load = weekLoad(e.id)
                  const conflicts = sameDay(e.id)
                  return (
                    <FieldLabel key={e.id} htmlFor={`slot-emp-${e.id}`}>
                      <Field orientation="horizontal" className="items-center">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-dark">
                            {initials(e.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <FieldContent className="min-w-0">
                          <FieldTitle>{e.fullName}</FieldTitle>
                          <span className="text-xs font-normal text-muted-foreground">
                            {ROLE_LABEL[e.role]} · {load} ca tuần này
                            {conflicts.length ? (
                              <span className="text-warning">
                                {" "}
                                · đã có {conflicts.join(", ").toLowerCase()} cùng ngày
                              </span>
                            ) : null}
                          </span>
                        </FieldContent>
                        <RadioGroupItem value={e.id} id={`slot-emp-${e.id}`} />
                      </Field>
                    </FieldLabel>
                  )
                })}
              </RadioGroup>
            )}
          />
          <FieldError errors={[errors.employeeId]} />
        </Field>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
          Cửa hàng chưa có nhân viên đang làm việc để xếp ca.
        </p>
      )}

      <DialogFooter>
        {shift ? (
          <>
            <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon /> Xoá ca
            </Button>
            {started ? (
              <Button type="button" variant="outline" onClick={markAbsent}>
                <UserRoundXIcon /> Vắng
              </Button>
            ) : null}
          </>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="submit" disabled={!roster.length}>
          {shift ? "Lưu" : "Xếp ca"}
        </Button>
      </DialogFooter>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá ca này?</AlertDialogTitle>
            <AlertDialogDescription>
              {assigned?.fullName ?? "Nhân viên"} sẽ không còn trong {meta.label.toLowerCase()} {dayMonth(date)}. Ô lịch
              sẽ trống và cần xếp người khác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Xoá ca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
