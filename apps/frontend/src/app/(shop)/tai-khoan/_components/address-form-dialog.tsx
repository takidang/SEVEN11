"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CrosshairIcon, Loader2Icon, StoreIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { normalizePhone, phoneSchema } from "@/lib/phone"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DELIVERY_RADIUS_KM, distanceKm, formatDistance, type LatLng, requestLocation } from "@/lib/geo"
import { lookupAddress, matchProvince } from "@/lib/geocode"
import { cn } from "@/lib/utils"
import { storeForAddress } from "@/stores/cart"
import { newId, useDb } from "@/stores/db"
import type { Address, Customer } from "@/types"

const LABEL_SUGGESTIONS = ["Nhà riêng", "Công ty", "Trường học"]

const addressSchema = z.object({
  label: z.string().trim().min(1, "Đặt tên gợi nhớ cho địa chỉ").max(30, "Tên gợi nhớ tối đa 30 ký tự"),
  recipient: z.string().trim().min(2, "Nhập họ tên người nhận").max(60, "Họ tên tối đa 60 ký tự"),
  phone: phoneSchema,
  province: z.string().min(1, "Chọn tỉnh / thành phố"),
  ward: z.string().trim().min(2, "Nhập phường / xã").max(60, "Tối đa 60 ký tự"),
  line: z.string().trim().min(4, "Nhập số nhà, tên đường").max(120, "Tối đa 120 ký tự"),
  isDefault: z.boolean(),
})

type AddressValues = z.infer<typeof addressSchema>

/** Add (address = null) or edit a saved address. */
export function AddressFormDialog({
  customer,
  address,
  open,
  onOpenChange,
}: {
  customer: Customer
  address: Address | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AddressForm
          key={address?.id ?? "new"}
          customer={customer}
          address={address}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function AddressForm({
  customer,
  address,
  onDone,
}: {
  customer: Customer
  address: Address | null
  onDone: () => void
}) {
  const stores = useDb((s) => s.stores)
  const provinces = useMemo(() => [...new Set(stores.map((s) => s.province))], [stores])
  const isFirst = customer.addresses.length === 0
  const lockDefault = isFirst || !!address?.isDefault

  const form = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? {
          label: address.label,
          recipient: address.recipient,
          phone: address.phone,
          province: address.province,
          ward: address.ward,
          line: address.line,
          isDefault: address.isDefault,
        }
      : {
          label: isFirst ? LABEL_SUGGESTIONS[0] : "",
          recipient: customer.fullName,
          phone: customer.phone,
          province: provinces[0] ?? "",
          ward: "",
          line: "",
          isDefault: isFirst,
        },
  })
  const { errors } = form.formState
  const label = useWatch({ control: form.control, name: "label" })
  const province = useWatch({ control: form.control, name: "province" })
  const [point, setPoint] = useState<LatLng | null>(
    address?.lat !== undefined && address?.lng !== undefined ? { lat: address.lat, lng: address.lng } : null,
  )
  const [locating, setLocating] = useState(false)

  // Coordinates are what let an order be served by the closest store instead of the first one.
  const store = stores.find((s) => s.id === storeForAddress({ province, ...point }))
  const away = store && point ? distanceKm(point, store) : null
  const tooFar = away !== null && away > DELIVERY_RADIUS_KM

  const useMyLocation = async () => {
    setLocating(true)
    const found = await requestLocation()
    if (!found) {
      setLocating(false)
      toast.error("Không lấy được vị trí", { description: "Bật quyền vị trí cho trình duyệt rồi thử lại." })
      return
    }
    setPoint(found)
    const place = await lookupAddress(found)
    setLocating(false)
    if (!place) {
      toast.success("Đã gắn vị trí vào địa chỉ này", { description: "Không đọc được tên đường, kiểm tra lại giúp em." })
      return
    }
    const matched = matchProvince(place.province, provinces)
    if (matched) form.setValue("province", matched, { shouldValidate: true })
    if (place.ward) form.setValue("ward", place.ward, { shouldValidate: true })
    if (place.line) form.setValue("line", place.line, { shouldValidate: true })
    toast.success("Đã điền địa chỉ theo vị trí của bạn")
  }

  const submit = form.handleSubmit((values) => {
    const saved: Address = {
      id: address?.id ?? newId("addr"),
      label: values.label.trim(),
      recipient: values.recipient.trim(),
      phone: normalizePhone(values.phone),
      province: values.province,
      ward: values.ward.trim(),
      line: values.line.trim(),
      isDefault: lockDefault ? true : values.isDefault,
      ...point,
    }
    useDb.getState().saveAddress(customer.id, saved)
    toast.success(address ? "Đã cập nhật địa chỉ" : "Đã thêm địa chỉ mới", {
      description: `${saved.label}: ${saved.line}, ${saved.ward}`,
    })
    onDone()
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{address ? "Sửa địa chỉ" : "Thêm địa chỉ mới"}</DialogTitle>
        <DialogDescription>Địa chỉ mặc định sẽ được điền sẵn khi bạn đặt hàng.</DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.label}>
          <FieldLabel htmlFor="address-label">Tên gợi nhớ</FieldLabel>
          <Input
            id="address-label"
            placeholder="Ví dụ: Nhà riêng"
            aria-invalid={!!errors.label}
            className="h-10"
            {...form.register("label")}
          />
          <div className="flex flex-wrap gap-1.5">
            {LABEL_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => form.setValue("label", suggestion, { shouldValidate: true, shouldDirty: true })}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs ring-1 transition",
                  label === suggestion
                    ? "bg-brand text-white ring-brand"
                    : "bg-white text-brand ring-brand/25 hover:bg-brand-soft",
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <FieldError errors={[errors.label]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.recipient}>
            <FieldLabel htmlFor="address-recipient">Người nhận</FieldLabel>
            <Input
              id="address-recipient"
              autoComplete="name"
              aria-invalid={!!errors.recipient}
              className="h-10"
              {...form.register("recipient")}
            />
            <FieldError errors={[errors.recipient]} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="address-phone">Số điện thoại</FieldLabel>
            <Input
              id="address-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              aria-invalid={!!errors.phone}
              className="h-10"
              {...form.register("phone")}
            />
            <FieldError errors={[errors.phone]} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.province}>
            <FieldLabel htmlFor="address-province">Tỉnh / thành phố</FieldLabel>
            <Controller
              control={form.control}
              name="province"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="address-province"
                    className="w-full data-[size=default]:h-10"
                    aria-invalid={!!errors.province}
                  >
                    <SelectValue placeholder="Chọn tỉnh / thành phố" />
                  </SelectTrigger>
                  <SelectContent>
                    {provinces.map((p) => (
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
          <Field data-invalid={!!errors.ward}>
            <FieldLabel htmlFor="address-ward">Phường / xã</FieldLabel>
            <Input
              id="address-ward"
              placeholder="Ví dụ: Phường Sài Gòn"
              aria-invalid={!!errors.ward}
              className="h-10"
              {...form.register("ward")}
            />
            <FieldError errors={[errors.ward]} />
          </Field>
        </div>

        <Field data-invalid={!!errors.line}>
          <FieldLabel htmlFor="address-line">Số nhà, tên đường</FieldLabel>
          <Input
            id="address-line"
            autoComplete="street-address"
            placeholder="Ví dụ: Số 81 Nguyễn Du"
            aria-invalid={!!errors.line}
            className="h-10"
            {...form.register("line")}
          />
          <FieldError errors={[errors.line]} />
        </Field>

        <Field orientation="horizontal" data-disabled={lockDefault}>
          <Controller
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <Checkbox
                id="address-default"
                checked={lockDefault || field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                disabled={lockDefault}
              />
            )}
          />
          <div className="grid gap-0.5">
            <FieldLabel htmlFor="address-default" className="font-normal">
              Đặt làm địa chỉ mặc định
            </FieldLabel>
            {lockDefault ? (
              <FieldDescription className="text-xs">
                {isFirst
                  ? "Địa chỉ đầu tiên luôn là địa chỉ mặc định."
                  : "Muốn đổi mặc định, hãy chọn “Đặt làm mặc định” ở địa chỉ khác."}
              </FieldDescription>
            ) : null}
          </div>
        </Field>
      </FieldGroup>

      <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
        {locating ? <Loader2Icon className="animate-spin" /> : <CrosshairIcon />}
        {point ? "Cập nhật lại vị trí" : "Gắn vị trí hiện tại để giao từ cửa hàng gần nhất"}
      </Button>

      {store ? (
        <p
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            tooFar ? "bg-warning-soft/60 ring-1 ring-warning/30" : "bg-brand-soft text-brand-dark",
          )}
        >
          {tooFar ? (
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          ) : (
            <StoreIcon className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            {tooFar ? (
              <>
                <span className="font-medium">Ngoài vùng giao hàng.</span> Cửa hàng gần nhất cách {formatDistance(away)}
                , quá {DELIVERY_RADIUS_KM} km nên địa chỉ này chưa đặt giao được.
              </>
            ) : (
              <>
                Giao từ cửa hàng {store.code} – {store.name}
                {away !== null ? <span className="font-medium"> · cách {formatDistance(away)}</span> : null}
              </>
            )}
          </span>
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit">{address ? "Lưu địa chỉ" : "Thêm địa chỉ"}</Button>
      </DialogFooter>
    </form>
  )
}
