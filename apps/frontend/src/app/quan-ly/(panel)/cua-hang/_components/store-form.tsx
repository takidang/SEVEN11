"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toDateKey } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { useDb } from "@/stores/db"
import type { Store, StoreStatus } from "@/types"

const PROVINCES = [
  "TP Hồ Chí Minh",
  "Hà Nội",
  "Đà Nẵng",
  "Hải Phòng",
  "Cần Thơ",
  "Đồng Nai",
  "Khánh Hòa",
  "Lâm Đồng",
  "Quảng Ninh",
]

const OPEN_HOURS = ["24/7", "06:00 - 24:00", "06:00 - 22:00", "07:00 - 23:00"]

const NO_MANAGER = "none"

function decimalIn(min: number, max: number) {
  return (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max
}

function storeSchema(stores: Store[], editingId: string | null) {
  return z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{4}$/, "Mã cửa hàng gồm đúng 4 chữ số"),
      name: z.string().trim().min(3, "Nhập tên ngắn của cửa hàng").max(60, "Tối đa 60 ký tự"),
      address: z.string().trim().min(5, "Nhập số nhà, tên đường").max(120, "Tối đa 120 ký tự"),
      ward: z.string().trim().min(3, "Nhập phường/xã").max(60, "Tối đa 60 ký tự"),
      province: z.string().min(1, "Chọn tỉnh/thành phố"),
      phone: z
        .string()
        .trim()
        .regex(/^0\d{9,10}$/, "Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0"),
      email: z
        .string()
        .trim()
        .refine((v) => z.email().safeParse(v).success, "Email không hợp lệ"),
      openHours: z.string().min(1, "Chọn giờ mở cửa"),
      status: z.enum(["active", "maintenance", "closed"]),
      managerId: z.string(),
      lat: z.string().refine(decimalIn(8, 24), "Vĩ độ trong khoảng 8 – 24 (lãnh thổ Việt Nam)"),
      lng: z.string().refine(decimalIn(102, 110), "Kinh độ trong khoảng 102 – 110 (lãnh thổ Việt Nam)"),
    })
    .superRefine((v, ctx) => {
      const others = stores.filter((s) => s.id !== editingId)
      if (others.some((s) => s.code === v.code || (!editingId && s.id === `st-${v.code}`))) {
        ctx.addIssue({ code: "custom", path: ["code"], message: `Mã ${v.code} đã được dùng cho cửa hàng khác` })
      }
      if (others.some((s) => s.email.toLowerCase() === v.email.toLowerCase())) {
        ctx.addIssue({ code: "custom", path: ["email"], message: "Email này đã thuộc cửa hàng khác" })
      }
    })
}

type StoreFormValues = z.infer<ReturnType<typeof storeSchema>>

/** Create (store = null) or edit a store. Admin only. */
export function StoreForm({
  store,
  onSaved,
  onCancel,
}: {
  store: Store | null
  onSaved: (store: Store) => void
  onCancel: () => void
}) {
  const stores = useDb((s) => s.stores)
  const employees = useDb((s) => s.employees)
  const schema = useMemo(() => storeSchema(stores, store?.id ?? null), [stores, store])

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(schema),
    defaultValues: store
      ? {
          code: store.code,
          name: store.name,
          address: store.address,
          ward: store.ward,
          province: store.province,
          phone: store.phone,
          email: store.email,
          openHours: store.openHours,
          status: store.status,
          managerId: store.managerId ?? NO_MANAGER,
          lat: String(store.lat),
          lng: String(store.lng),
        }
      : {
          code: "",
          name: "",
          address: "",
          ward: "",
          province: "TP Hồ Chí Minh",
          phone: "",
          email: "",
          openHours: "24/7",
          status: "active",
          managerId: NO_MANAGER,
          lat: "",
          lng: "",
        },
  })
  const { errors, isSubmitting } = form.formState
  const managerId = useWatch({ control: form.control, name: "managerId" })

  const managers = useMemo(() => employees.filter((e) => e.role === "manager" && e.status !== "inactive"), [employees])
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s] as const)), [stores])
  const ownManagers = managers.filter((m) => store && m.storeId === store.id)
  const otherManagers = managers.filter((m) => !store || m.storeId !== store.id)
  const pickedManager = managers.find((m) => m.id === managerId)
  const transferFrom =
    pickedManager && pickedManager.storeId && pickedManager.storeId !== store?.id
      ? storeById.get(pickedManager.storeId)
      : undefined
  const hourOptions = store && !OPEN_HOURS.includes(store.openHours) ? [...OPEN_HOURS, store.openHours] : OPEN_HOURS
  const provinceOptions = store && !PROVINCES.includes(store.province) ? [...PROVINCES, store.province] : PROVINCES

  const onSubmit = form.handleSubmit((v) => {
    const db = useDb.getState()
    const saved: Store = {
      id: store?.id ?? `st-${v.code}`,
      code: v.code,
      name: v.name,
      address: v.address,
      ward: v.ward,
      province: v.province,
      phone: v.phone,
      email: v.email,
      openHours: v.openHours,
      status: v.status,
      managerId: v.managerId === NO_MANAGER ? undefined : v.managerId,
      openedAt: store?.openedAt ?? toDateKey(new Date()),
      lat: Number(v.lat),
      lng: Number(v.lng),
    }
    db.saveStore(saved)

    // Moving a manager from another store: the employee follows, the old store loses its manager.
    const manager = saved.managerId ? db.employees.find((e) => e.id === saved.managerId) : undefined
    if (manager && manager.storeId !== saved.id) {
      const previous = manager.storeId ? db.stores.find((s) => s.id === manager.storeId) : undefined
      db.saveEmployee({ ...manager, storeId: saved.id })
      if (previous?.managerId === manager.id) db.saveStore({ ...previous, managerId: undefined })
    }

    toast.success(store ? `Đã cập nhật cửa hàng ${saved.code}` : `Đã thêm cửa hàng ${saved.code} – ${saved.name}`)
    onSaved(saved)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <FieldGroup className="gap-4">
          <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
            <Field data-invalid={!!errors.code}>
              <FieldLabel htmlFor="store-code">Mã cửa hàng</FieldLabel>
              <Input
                id="store-code"
                inputMode="numeric"
                maxLength={4}
                placeholder="VD: 1090"
                className="tabular"
                aria-invalid={!!errors.code}
                {...form.register("code")}
              />
              <FieldError errors={[errors.code]} />
            </Field>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="store-name">Tên ngắn</FieldLabel>
              <Input
                id="store-name"
                placeholder="VD: 99 Pasteur"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
          </div>

          <Field data-invalid={!!errors.address}>
            <FieldLabel htmlFor="store-address">Địa chỉ</FieldLabel>
            <Input
              id="store-address"
              placeholder="VD: Số 99 Pasteur"
              aria-invalid={!!errors.address}
              {...form.register("address")}
            />
            <FieldError errors={[errors.address]} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.ward}>
              <FieldLabel htmlFor="store-ward">Phường/xã</FieldLabel>
              <Input
                id="store-ward"
                placeholder="VD: Phường Sài Gòn"
                aria-invalid={!!errors.ward}
                {...form.register("ward")}
              />
              <FieldError errors={[errors.ward]} />
            </Field>
            <Field data-invalid={!!errors.province}>
              <FieldLabel htmlFor="store-province">Tỉnh/thành phố</FieldLabel>
              <Controller
                control={form.control}
                name="province"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="store-province" className="w-full" aria-invalid={!!errors.province}>
                      <SelectValue placeholder="Chọn tỉnh/thành phố" />
                    </SelectTrigger>
                    <SelectContent>
                      {provinceOptions.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.province]} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="store-phone">Số điện thoại</FieldLabel>
              <Input
                id="store-phone"
                type="tel"
                inputMode="tel"
                placeholder="VD: 02873001090"
                className="tabular"
                aria-invalid={!!errors.phone}
                {...form.register("phone")}
              />
              <FieldError errors={[errors.phone]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="store-email">Email cửa hàng</FieldLabel>
              <Input
                id="store-email"
                type="email"
                placeholder="VD: cuahang1090@7eleven.demo"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.openHours}>
              <FieldLabel htmlFor="store-hours">Giờ mở cửa</FieldLabel>
              <Controller
                control={form.control}
                name="openHours"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="store-hours" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hourOptions.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h === "24/7" ? "24/7 (mở cả ca đêm)" : h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.openHours]} />
            </Field>
            <Field data-invalid={!!errors.status}>
              <FieldLabel htmlFor="store-status">Trạng thái</FieldLabel>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as StoreStatus)}>
                    <SelectTrigger id="store-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STORE_STATUS) as StoreStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STORE_STATUS[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="store-manager">Quản lý cửa hàng</FieldLabel>
            <Controller
              control={form.control}
              name="managerId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="store-manager" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-72">
                    <SelectItem value={NO_MANAGER}>Chưa có quản lý</SelectItem>
                    {ownManagers.length ? (
                      <SelectGroup>
                        <SelectSeparator />
                        <SelectLabel>Thuộc cửa hàng này</SelectLabel>
                        {ownManagers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.fullName} · {m.code}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                    {otherManagers.length ? (
                      <SelectGroup>
                        <SelectSeparator />
                        <SelectLabel>Điều chuyển từ cửa hàng khác</SelectLabel>
                        {otherManagers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.fullName} · CH {m.storeId ? (storeById.get(m.storeId)?.code ?? "—") : "—"}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
              )}
            />
            {transferFrom ? (
              <FieldDescription className="text-warning">
                {pickedManager?.fullName} sẽ được điều chuyển từ cửa hàng {transferFrom.code} sang cửa hàng này
                {transferFrom.managerId === pickedManager?.id
                  ? `; cửa hàng ${transferFrom.code} sẽ chưa có quản lý`
                  : ""}
                .
              </FieldDescription>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.lat}>
              <FieldLabel htmlFor="store-lat">Vĩ độ</FieldLabel>
              <Input
                id="store-lat"
                inputMode="decimal"
                placeholder="VD: 10.7771"
                className="tabular"
                aria-invalid={!!errors.lat}
                {...form.register("lat")}
              />
              <FieldError errors={[errors.lat]} />
            </Field>
            <Field data-invalid={!!errors.lng}>
              <FieldLabel htmlFor="store-lng">Kinh độ</FieldLabel>
              <Input
                id="store-lng"
                inputMode="decimal"
                placeholder="VD: 106.7009"
                className="tabular"
                aria-invalid={!!errors.lng}
                {...form.register("lng")}
              />
              <FieldError errors={[errors.lng]} />
            </Field>
          </div>
        </FieldGroup>
      </div>

      <div className="flex justify-end gap-2 border-t bg-muted/40 p-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {store ? "Lưu thay đổi" : "Thêm cửa hàng"}
        </Button>
      </div>
    </form>
  )
}
