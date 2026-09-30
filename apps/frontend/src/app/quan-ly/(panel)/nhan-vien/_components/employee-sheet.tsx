"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarDaysIcon, LockIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { StatusBadge } from "@/components/admin/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDate, formatNumber, formatPhone, initials, toDateKey } from "@/lib/format"
import { SHIFT_STATUS, SHIFT_TYPE } from "@/lib/order-status"
import { ROLE_LABEL } from "@/lib/permissions"
import { newId, useDb } from "@/stores/db"
import type { Employee, EmployeeStatus, Role } from "@/types"

import { EMPLOYEE_STATUS } from "@/lib/order-status"

import { addDays, dayMonth, mondayOf, parseDateKey, SHIFT_TYPES, weekdayShort } from "./staff-meta"

export type EmployeeSheetState = { mode: "view"; employeeId: string } | { mode: "create"; nonce: number } | null

/** Admin edits anyone; a manager edits the cashiers of their own store (never themselves or other managers). */
export function canEditEmployee(actor: Employee, target: Employee) {
  if (actor.role === "admin") return true
  if (actor.role === "manager") return target.role === "cashier" && !!actor.storeId && target.storeId === actor.storeId
  return false
}

function rolesFor(actor: Employee): Role[] {
  return actor.role === "admin" ? ["admin", "manager", "cashier"] : ["cashier"]
}

function nextEmployeeCode(employees: Employee[]) {
  const max = employees.reduce((m, e) => Math.max(m, Number(e.code.replace(/\D/g, "")) || 0), 0)
  return `NV${String(max + 1).padStart(4, "0")}`
}

export function EmployeeSheet({
  state,
  onStateChange,
  actor,
  defaultStoreId,
  now,
}: {
  state: EmployeeSheetState
  onStateChange: (state: EmployeeSheetState) => void
  actor: Employee
  /** Store preselected when creating (the store in scope). */
  defaultStoreId: string | null
  now: Date
}) {
  const employees = useDb((s) => s.employees)
  const stores = useDb((s) => s.stores)
  const [shown, setShown] = useState<EmployeeSheetState>(state)
  if (state && state !== shown) setShown(state)

  const employee = shown?.mode === "view" ? employees.find((e) => e.id === shown.employeeId) : undefined
  const creating = shown?.mode === "create"
  const editable = creating || (!!employee && canEditEmployee(actor, employee))
  const store = employee?.storeId ? stores.find((s) => s.id === employee.storeId) : undefined
  const close = () => onStateChange(null)

  return (
    <Sheet open={!!state} onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {shown?.mode === "create" ? (
          <>
            <SheetHeader className="border-b p-4 pr-12">
              <SheetTitle className="text-lg font-semibold">Thêm nhân viên</SheetTitle>
              <SheetDescription>
                {actor.role === "admin"
                  ? "Tài khoản đăng nhập bằng email, mật khẩu mặc định 123456."
                  : "Quản lý cửa hàng chỉ thêm được thu ngân cho cửa hàng của mình."}
              </SheetDescription>
            </SheetHeader>
            <EmployeeForm
              key={shown.nonce}
              employee={null}
              actor={actor}
              defaultStoreId={defaultStoreId}
              now={now}
              onCancel={close}
              onSaved={(saved) => onStateChange({ mode: "view", employeeId: saved.id })}
            />
          </>
        ) : employee ? (
          <>
            <SheetHeader className="flex-row items-start gap-3 border-b p-4 pr-12">
              <Avatar className="size-12">
                <AvatarFallback className="bg-brand-soft text-sm font-semibold text-brand-dark">
                  {initials(employee.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-lg font-semibold">{employee.fullName}</SheetTitle>
                  <StatusBadge tone={EMPLOYEE_STATUS[employee.status].tone}>
                    {EMPLOYEE_STATUS[employee.status].label}
                  </StatusBadge>
                </div>
                <SheetDescription className="mt-0.5">
                  <span className="font-mono text-xs">{employee.code}</span> · {ROLE_LABEL[employee.role]} ·{" "}
                  {store ? `Cửa hàng ${store.code} – ${store.name}` : "Toàn chuỗi"}
                </SheetDescription>
              </div>
            </SheetHeader>
            {editable ? (
              <EmployeeForm
                key={employee.id}
                employee={employee}
                actor={actor}
                defaultStoreId={defaultStoreId}
                now={now}
                onCancel={close}
                onSaved={() => undefined}
              >
                <WeekShifts employee={employee} now={now} />
              </EmployeeForm>
            ) : (
              <div className="flex-1 space-y-6 overflow-y-auto p-4">
                <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <LockIcon className="mt-px size-3.5 shrink-0" />
                  {employee.id === actor.id
                    ? "Đây là tài khoản của bạn. Liên hệ quản trị chuỗi để thay đổi thông tin."
                    : "Bạn chỉ xem được thông tin nhân viên này."}
                </p>
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Số điện thoại</dt>
                  <dd className="tabular">{formatPhone(employee.phone)}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate">{employee.email}</dd>
                  <dt className="text-muted-foreground">Vai trò</dt>
                  <dd>{ROLE_LABEL[employee.role]}</dd>
                  <dt className="text-muted-foreground">Cửa hàng</dt>
                  <dd>{store ? `${store.code} – ${store.name}` : "Toàn chuỗi"}</dd>
                  <dt className="text-muted-foreground">Ngày vào làm</dt>
                  <dd>{formatDate(employee.hiredAt)}</dd>
                </dl>
                <WeekShifts employee={employee} now={now} />
              </div>
            )}
          </>
        ) : (
          <SheetHeader className="sr-only">
            <SheetTitle>Nhân viên</SheetTitle>
            <SheetDescription>Thông tin nhân viên</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function employeeSchema(employees: Employee[], editing: Employee | null, allowedRoles: Role[], latestHireKey: string) {
  return z
    .object({
      fullName: z.string().trim().min(2, "Nhập họ tên nhân viên").max(60, "Tối đa 60 ký tự"),
      phone: z
        .string()
        .trim()
        .regex(/^0\d{9}$/, "Số di động gồm 10 chữ số, bắt đầu bằng 0"),
      email: z
        .string()
        .trim()
        .refine((v) => z.email().safeParse(v).success, "Email không hợp lệ"),
      role: z.enum(["admin", "manager", "cashier"]),
      storeId: z.string(),
      status: z.enum(["active", "on-leave", "inactive"]),
      hiredAt: z.string().min(1, "Chọn ngày vào làm"),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
      const email = v.email.toLowerCase()
      if (employees.some((e) => e.id !== editing?.id && e.email.toLowerCase() === email)) {
        issue("email", "Email này đã được dùng cho nhân viên khác")
      }
      if (!allowedRoles.includes(v.role) && v.role !== editing?.role) issue("role", "Bạn không được gán vai trò này")
      if (v.role !== "admin" && !v.storeId) issue("storeId", "Chọn cửa hàng làm việc")
      if (v.hiredAt > latestHireKey) issue("hiredAt", "Ngày vào làm không được quá 30 ngày tới")
    })
}

type EmployeeValues = z.infer<ReturnType<typeof employeeSchema>>

function EmployeeForm({
  employee,
  actor,
  defaultStoreId,
  now,
  onSaved,
  onCancel,
  children,
}: {
  employee: Employee | null
  actor: Employee
  defaultStoreId: string | null
  now: Date
  onSaved: (employee: Employee) => void
  onCancel: () => void
  children?: React.ReactNode
}) {
  const employees = useDb((s) => s.employees)
  const stores = useDb((s) => s.stores)
  const shifts = useDb((s) => s.shifts)
  const allowedRoles = rolesFor(actor)
  const isSelf = employee?.id === actor.id
  const [schema] = useState(() =>
    employeeSchema(employees, employee, allowedRoles, toDateKey(new Date(now.getTime() + 30 * 86_400_000))),
  )
  const managerStoreId = actor.role === "manager" ? actor.storeId : null

  const form = useForm<EmployeeValues>({
    resolver: zodResolver(schema),
    defaultValues: employee
      ? {
          fullName: employee.fullName,
          phone: employee.phone,
          email: employee.email,
          role: employee.role,
          storeId: employee.storeId ?? "",
          status: employee.status,
          hiredAt: employee.hiredAt.slice(0, 10),
        }
      : {
          fullName: "",
          phone: "",
          email: "",
          role: "cashier",
          storeId: managerStoreId ?? defaultStoreId ?? "",
          status: "active",
          hiredAt: toDateKey(now),
        },
  })
  const { errors, isDirty, isSubmitting } = form.formState
  const role = useWatch({ control: form.control, name: "role" })
  const code = useMemo(() => employee?.code ?? nextEmployeeCode(employees), [employee, employees])

  const onSubmit = form.handleSubmit((v) => {
    const db = useDb.getState()
    const saved: Employee = {
      id: employee?.id ?? newId("em"),
      code: employee?.code ?? nextEmployeeCode(db.employees),
      fullName: v.fullName,
      phone: v.phone,
      email: v.email.toLowerCase(),
      role: v.role,
      storeId: v.role === "admin" ? null : v.storeId,
      status: v.status,
      hiredAt: v.hiredAt,
    }
    db.saveEmployee(saved)

    if (employee) {
      // A store must not keep pointing at someone who is no longer its manager.
      const leftManagement =
        employee.role === "manager" && (saved.role !== "manager" || saved.storeId !== employee.storeId)
      if (leftManagement) {
        for (const s of db.stores) if (s.managerId === employee.id) db.saveStore({ ...s, managerId: undefined })
      }
      // Upcoming shifts that no longer fit: warn, the schedule is the manager's call.
      const today = toDateKey(new Date())
      const unavailable = saved.status !== "active" || saved.storeId !== employee.storeId
      const upcoming = unavailable
        ? shifts.filter((s) => s.employeeId === employee.id && s.status === "scheduled" && s.date >= today).length
        : 0
      toast.success(`Đã lưu thông tin ${saved.fullName}`, {
        description: upcoming ? `Nhân viên còn ${upcoming} ca đã xếp từ hôm nay – hãy xếp lại lịch ca.` : undefined,
      })
      form.reset(v)
    } else {
      toast.success(`Đã thêm nhân viên ${saved.fullName} (${saved.code})`)
    }
    onSaved(saved)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <FieldGroup className="gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field data-invalid={!!errors.fullName}>
              <FieldLabel htmlFor="emp-name">Họ tên</FieldLabel>
              <Input
                id="emp-name"
                placeholder="VD: Nguyễn Văn An"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              <FieldError errors={[errors.fullName]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="emp-code">Mã nhân viên</FieldLabel>
              <Input id="emp-code" value={code} readOnly disabled className="font-mono" />
              {!employee ? <FieldDescription className="text-xs">Tự động cấp</FieldDescription> : null}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="emp-phone">Số điện thoại</FieldLabel>
              <Input
                id="emp-phone"
                type="tel"
                inputMode="tel"
                placeholder="VD: 0901234567"
                className="tabular"
                aria-invalid={!!errors.phone}
                {...form.register("phone")}
              />
              <FieldError errors={[errors.phone]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="emp-email">Email đăng nhập</FieldLabel>
              <Input
                id="emp-email"
                type="email"
                placeholder="VD: an.nguyen@7eleven.demo"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.role}>
              <FieldLabel htmlFor="emp-role">Vai trò</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v as Role)
                      if (v === "admin") form.setValue("storeId", "")
                    }}
                    disabled={isSelf || allowedRoles.length === 1}
                  >
                    <SelectTrigger id="emp-role" className="w-full" aria-invalid={!!errors.role}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(allowedRoles.includes(field.value) ? allowedRoles : [field.value, ...allowedRoles]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.role]} />
            </Field>
            <Field data-invalid={!!errors.storeId}>
              <FieldLabel htmlFor="emp-store">Cửa hàng</FieldLabel>
              <Controller
                control={form.control}
                name="storeId"
                render={({ field }) => (
                  <Select
                    value={role === "admin" ? "chain" : field.value}
                    onValueChange={field.onChange}
                    disabled={role === "admin" || !!managerStoreId}
                  >
                    <SelectTrigger id="emp-store" className="w-full" aria-invalid={!!errors.storeId}>
                      <SelectValue placeholder="Chọn cửa hàng" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-72">
                      {role === "admin" ? <SelectItem value="chain">Toàn chuỗi</SelectItem> : null}
                      {stores
                        .filter((s) => !managerStoreId || s.id === managerStoreId)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.code} – {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.storeId]} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.status}>
              <FieldLabel htmlFor="emp-status">Trạng thái</FieldLabel>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as EmployeeStatus)}
                    disabled={isSelf}
                  >
                    <SelectTrigger id="emp-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {EMPLOYEE_STATUS[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {isSelf ? (
                <FieldDescription className="text-xs">
                  Không tự đổi vai trò hay khoá tài khoản của mình.
                </FieldDescription>
              ) : null}
            </Field>
            <Field data-invalid={!!errors.hiredAt}>
              <FieldLabel htmlFor="emp-hired">Ngày vào làm</FieldLabel>
              <Input id="emp-hired" type="date" aria-invalid={!!errors.hiredAt} {...form.register("hiredAt")} />
              <FieldError errors={[errors.hiredAt]} />
            </Field>
          </div>
        </FieldGroup>

        {children}
      </div>

      <div className="flex items-center justify-end gap-2 border-t bg-muted/40 p-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {employee && !isDirty ? "Đóng" : "Huỷ"}
        </Button>
        <Button type="submit" disabled={isSubmitting || (!!employee && !isDirty)}>
          {employee ? "Lưu thay đổi" : "Thêm nhân viên"}
        </Button>
      </div>
    </form>
  )
}

/** The employee's shifts in the current week (Mon–Sun). */
function WeekShifts({ employee, now }: { employee: Employee; now: Date }) {
  const shifts = useDb((s) => s.shifts)
  const stores = useDb((s) => s.stores)
  const monday = mondayOf(now)
  const todayKey = toDateKey(now)

  const mine = useMemo(() => {
    const first = toDateKey(mondayOf(now))
    const last = toDateKey(addDays(mondayOf(now), 6))
    return shifts
      .filter((s) => s.employeeId === employee.id && s.date >= first && s.date <= last)
      .sort((a, b) => a.date.localeCompare(b.date) || SHIFT_TYPES.indexOf(a.type) - SHIFT_TYPES.indexOf(b.type))
  }, [shifts, employee.id, now])
  const storeCode = (id: string) => stores.find((s) => s.id === id)?.code ?? "—"

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Ca làm tuần này</h3>
        <span className="text-xs text-muted-foreground">
          {dayMonth(monday)} – {dayMonth(addDays(monday, 6))} · {formatNumber(mine.length)} ca ·{" "}
          {formatNumber(mine.length * 8)} giờ
        </span>
      </div>
      {mine.length ? (
        <ul className="divide-y rounded-lg ring-1 ring-border">
          {mine.map((s) => {
            const date = parseDateKey(s.date)
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <span
                  className={
                    s.date === todayKey
                      ? "w-20 shrink-0 text-sm font-semibold whitespace-nowrap text-brand"
                      : "w-20 shrink-0 text-sm whitespace-nowrap text-muted-foreground"
                  }
                >
                  {weekdayShort(date)} {dayMonth(date)}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  {SHIFT_TYPE[s.type].label}{" "}
                  <span className="tabular text-xs text-muted-foreground">
                    {SHIFT_TYPE[s.type].time} · CH {storeCode(s.storeId)}
                  </span>
                </span>
                <StatusBadge tone={SHIFT_STATUS[s.status].tone}>{SHIFT_STATUS[s.status].label}</StatusBadge>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-lg px-3 py-4 text-sm text-muted-foreground ring-1 ring-border">
          <CalendarDaysIcon className="size-4" />
          {employee.role === "admin" ? "Quản trị chuỗi không xếp ca tại quầy." : "Chưa có ca nào trong tuần này."}
        </p>
      )}
    </section>
  )
}
