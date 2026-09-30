"use client"

import { BikeIcon, MapPinIcon, StoreIcon, TriangleAlertIcon } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import { Panel } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DELIVERY_RADIUS_KM, distanceKm, formatDistance } from "@/lib/geo"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { type DeliveryAddress, useCart } from "@/stores/cart"
import type { Store } from "@/types"

import { deliveryWindow, type RecipientValues } from "./checkout-form"

export function DeliverySection({
  form,
  store,
  address,
  now,
  onChangeAddress,
}: {
  form: UseFormReturn<RecipientValues>
  store: Store | undefined
  address: DeliveryAddress | null
  now: Date
  onChangeAddress: () => void
}) {
  const note = useCart((s) => s.note)
  const setNote = useCart((s) => s.setNote)
  const { errors } = form.formState
  const slot = deliveryWindow(now)
  const storeOpen = store?.status === "active"
  const away =
    store && address?.lat !== undefined && address?.lng !== undefined
      ? distanceKm({ lat: address.lat, lng: address.lng }, store)
      : null
  const tooFar = away !== null && away > DELIVERY_RADIUS_KM

  return (
    <div id="giao-hang" className="scroll-mt-32 lg:scroll-mt-20">
      <Panel title="Thông tin giao hàng" bodyClassName="space-y-4 p-4">
        {store ? (
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <StoreIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Giao từ cửa hàng {store.code} – {store.name}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {store.address}, {store.ward}, {store.province} · Mở cửa {store.openHours}
                {away !== null ? ` · cách ${formatDistance(away)}` : ""}
              </p>
              {tooFar ? (
                <p className="mt-1 flex items-start gap-1 text-xs leading-5 font-medium text-warning">
                  <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" /> Địa chỉ này ngoài vùng giao{" "}
                  {DELIVERY_RADIUS_KM} km, chưa đặt giao hàng được. Bạn có thể tới cửa hàng mua trực tiếp hoặc đổi địa
                  chỉ.
                </p>
              ) : null}
              {!storeOpen ? (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                  <TriangleAlertIcon className="size-3.5" /> Cửa hàng đang tạm ngưng nhận đơn, vui lòng chọn địa chỉ
                  khác.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg p-3 ring-1",
            address ? "ring-border" : "bg-warning-soft/60 ring-warning/30",
          )}
        >
          <MapPinIcon className="size-5 shrink-0 text-orange" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Địa chỉ nhận hàng</p>
            {address ? (
              <p className="text-sm font-medium">
                {address.line}, {address.ward}, {address.province}
              </p>
            ) : (
              <p className="text-sm font-medium text-warning">Chưa có địa chỉ giao hàng</p>
            )}
          </div>
          <Button variant="outline" onClick={onChangeAddress} className="h-9 shrink-0">
            {address ? "Thay đổi" : "Nhập địa chỉ"}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.recipient}>
            <FieldLabel htmlFor="checkout-recipient">Người nhận</FieldLabel>
            <Input
              id="checkout-recipient"
              autoComplete="name"
              placeholder="Họ và tên người nhận"
              aria-invalid={!!errors.recipient}
              className="h-10"
              {...form.register("recipient")}
            />
            <FieldError errors={[errors.recipient]} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="checkout-phone">Số điện thoại</FieldLabel>
            <Input
              id="checkout-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="Ví dụ: 0901 234 567"
              aria-invalid={!!errors.phone}
              className="h-10"
              {...form.register("phone")}
            />
            <FieldError errors={[errors.phone]} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="checkout-note">
            Ghi chú cho cửa hàng <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
          </FieldLabel>
          <Textarea
            id="checkout-note"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Gọi trước khi giao, không lấy ống hút"
            className="min-h-16"
          />
        </Field>

        <div className="flex items-center gap-3 rounded-lg bg-fresh-soft px-3 py-2.5">
          <BikeIcon className="size-5 shrink-0 text-fresh" />
          <p className="text-sm">
            <span className="font-semibold">Giao ngay</span> · dự kiến{" "}
            <span className="tabular font-semibold">
              {formatTime(slot.from)} – {formatTime(slot.to)}
            </span>
          </p>
        </div>
      </Panel>
    </div>
  )
}
