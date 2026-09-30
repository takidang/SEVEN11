"use client"

import { CrosshairIcon, Loader2Icon, MapPinIcon, StoreIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DELIVERY_RADIUS_KM, distanceKm, formatDistance, type LatLng, requestLocation } from "@/lib/geo"
import { lookupAddress, matchProvince } from "@/lib/geocode"
import { cn } from "@/lib/utils"
import { storeForAddress, useCart } from "@/stores/cart"
import { useDb } from "@/stores/db"
import { useCurrentCustomer } from "@/stores/session"

const PROVINCES = ["TP Hồ Chí Minh", "Hà Nội"]

/** "Giao đến" picker: saved addresses for members, or a quick manual form. */
export function AddressDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <AddressForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/** Mounted only while the dialog is open, so the fields start from the current address. */
function AddressForm({ onDone }: { onDone: () => void }) {
  const current = useCart((s) => s.deliveryAddress)
  const setDeliveryAddress = useCart((s) => s.setDeliveryAddress)
  const customer = useCurrentCustomer()
  const stores = useDb((s) => s.stores)
  const [province, setProvince] = useState(current?.province ?? PROVINCES[0])
  const [ward, setWard] = useState(current?.ward ?? "")
  const [line, setLine] = useState(current?.line ?? "")
  const [point, setPoint] = useState<LatLng | null>(
    current?.lat !== undefined && current?.lng !== undefined ? { lat: current.lat, lng: current.lng } : null,
  )
  const [locating, setLocating] = useState(false)

  const store = stores.find((s) => s.id === storeForAddress({ province, ...point }))
  const away = store && point ? distanceKm(point, store) : null
  const tooFar = away !== null && away > DELIVERY_RADIUS_KM
  const canSave = line.trim().length > 3 && ward.trim().length > 1

  const save = (address: { line: string; ward: string; province: string; lat?: number; lng?: number }) => {
    setDeliveryAddress(address)
    onDone()
  }

  /**
   * Sharing the location both picks the closest store and rewrites the three fields, so what is
   * typed and where the shopper actually stands can never disagree.
   */
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
      toast.success("Đã lấy vị trí của bạn", {
        description: "Không đọc được tên đường, sếp kiểm tra lại địa chỉ giúp.",
      })
      return
    }
    const matched = matchProvince(place.province, PROVINCES)
    if (matched) setProvince(matched)
    if (place.ward) setWard(place.ward)
    if (place.line) setLine(place.line)
    toast.success("Đã điền địa chỉ theo vị trí của bạn", {
      description: matched ? undefined : `Khu vực ${place.province} chưa có cửa hàng của 7-Eleven.`,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Địa chỉ giao hàng</DialogTitle>
        <DialogDescription>Chúng tôi chọn cửa hàng gần bạn nhất để giao trong 24 phút.</DialogDescription>
      </DialogHeader>

      {customer?.addresses.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">Địa chỉ đã lưu</p>
          {customer.addresses.map((a) => {
            const active = current?.line === a.line && current?.ward === a.ward
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => save({ line: a.line, ward: a.ward, province: a.province, lat: a.lat, lng: a.lng })}
                className={cn(
                  "flex items-start gap-3 rounded-lg p-3 text-left ring-1 transition hover:bg-accent",
                  active ? "bg-accent ring-brand/40" : "ring-border",
                )}
              >
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-orange" />
                <span className="text-sm">
                  <span className="font-medium">{a.label}</span>
                  <span className="block text-muted-foreground">
                    {a.line}, {a.ward}, {a.province}
                  </span>
                </span>
              </button>
            )
          })}
          <p className="mt-2 text-xs font-medium text-muted-foreground uppercase">Hoặc nhập địa chỉ khác</p>
        </div>
      ) : null}

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel>Tỉnh / thành phố</FieldLabel>
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="addr-ward">Phường / xã</FieldLabel>
          <Input
            id="addr-ward"
            value={ward}
            onChange={(e) => setWard(e.target.value)}
            placeholder="Ví dụ: Phường Sài Gòn"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="addr-line">Số nhà, tên đường</FieldLabel>
          <Input
            id="addr-line"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="Ví dụ: Số 81 Nguyễn Du"
          />
        </Field>
      </FieldGroup>

      <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating} className="w-full">
        {locating ? <Loader2Icon className="size-4 animate-spin" /> : <CrosshairIcon className="size-4" />}
        {point ? "Cập nhật lại vị trí của tôi" : "Dùng vị trí hiện tại để tìm cửa hàng gần nhất"}
      </Button>

      {store ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            tooFar ? "bg-warning-soft/60 text-foreground ring-1 ring-warning/30" : "bg-brand-soft text-brand-dark",
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
                <span className="font-medium">Ngoài vùng giao hàng.</span> Cửa hàng gần nhất {store.code} – {store.name}{" "}
                cách {formatDistance(away)}, xa hơn mức giao trong 24 phút ({DELIVERY_RADIUS_KM} km). Bạn có thể tới mua
                trực tiếp hoặc chọn địa chỉ khác.
              </>
            ) : (
              <>
                Cửa hàng phục vụ: {store.code} – {store.name}
                {away !== null ? <span className="font-medium"> · cách {formatDistance(away)}</span> : null}
                {point ? null : (
                  <span className="block text-xs opacity-80">
                    Chưa có vị trí nên tạm chọn cửa hàng đầu tiên trong {province}.
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button disabled={!canSave} onClick={() => save({ line: line.trim(), ward: ward.trim(), province, ...point })}>
          Giao đến đây
        </Button>
      </DialogFooter>
    </>
  )
}
