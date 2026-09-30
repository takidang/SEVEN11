"use client"

import {
  CheckIcon,
  ClockIcon,
  CrosshairIcon,
  Loader2Icon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  SearchIcon,
  SearchXIcon,
  StoreIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatPhone, normalizeText } from "@/lib/format"
import { formatDistance, type LatLng, requestLocation, storesByDistance } from "@/lib/geo"
import { STORE_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useCart } from "@/stores/cart"
import { useDb } from "@/stores/db"
import { useHydrated } from "@/stores/hydration"
import type { Store } from "@/types"

import { EmptyState } from "../../_components/empty-state"

const ALL = "all"

function mapsUrl(store: Store) {
  return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`
}

function hoursLabel(openHours: string) {
  return openHours === "24/7" ? "Mở cửa 24/7" : `Mở cửa ${openHours.replace("-", "–")}`
}

export function StoreDirectory() {
  const stores = useDb((s) => s.stores)
  const hydrated = useHydrated()
  const selectedId = useCart((s) => s.storeId)
  const address = useCart((s) => s.deliveryAddress)
  const [query, setQuery] = useState("")
  const [locating, setLocating] = useState(false)
  /** Set once the shopper picks a province or shares a location; until then we follow their address. */
  const [pickedProvince, setPickedProvince] = useState<string | null>(null)
  const [myPoint, setMyPoint] = useState<LatLng | null>(null)

  // Open on the city the shopper actually orders to, instead of the whole country.
  const province = pickedProvince ?? (hydrated && address ? address.province : ALL)
  const point = useMemo(
    () =>
      myPoint ??
      (address?.lat !== undefined && address?.lng !== undefined ? { lat: address.lat, lng: address.lng } : null),
    [myPoint, address],
  )

  const provinces = useMemo(() => {
    const counts = new Map<string, number>()
    for (const store of stores) counts.set(store.province, (counts.get(store.province) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  }, [stores])

  const filtered = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    const list = stores.filter((store) => {
      if (province !== ALL && store.province !== province) return false
      const haystack = normalizeText(`${store.code} ${store.name} ${store.address} ${store.ward} ${store.province}`)
      return terms.every((t) => haystack.includes(t))
    })
    if (!point) return list.map((store) => ({ ...store, distanceKm: undefined as number | undefined }))
    return storesByDistance(list, point)
  }, [stores, province, query, point])

  const selected = hydrated ? stores.find((s) => s.id === selectedId) : undefined
  const activeCount = stores.filter((s) => s.status === "active").length

  const choose = (store: Store) => {
    useCart.getState().setStoreId(store.id)
    toast.success(`Đã chọn cửa hàng ${store.code} – ${store.name}`, {
      description: "Đơn online của bạn sẽ được chuẩn bị và giao từ cửa hàng này.",
    })
  }

  const reset = () => {
    setPickedProvince(ALL)
    setQuery("")
  }

  const locate = async () => {
    setLocating(true)
    const found = await requestLocation()
    setLocating(false)
    if (!found) {
      toast.error("Không lấy được vị trí", { description: "Bật quyền vị trí cho trình duyệt rồi thử lại." })
      return
    }
    setMyPoint(found)
    toast.success("Đã sắp xếp theo cửa hàng gần bạn nhất")
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Hệ thống cửa hàng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stores.length} cửa hàng tại {provinces.map((p) => p.name).join(" và ")}, {activeCount} cửa hàng đang phục vụ.
          Chọn cửa hàng gần bạn để đơn online được chuẩn bị và giao nhanh trong 24 phút.
        </p>
      </header>

      {selected ? (
        <div className="flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">
          <StoreIcon className="size-5 shrink-0" />
          <p>
            Đơn online đang giao từ cửa hàng{" "}
            <span className="font-semibold">
              {selected.code} – {selected.name}
            </span>
            , {selected.ward}, {selected.province}.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          role="group"
          aria-label="Lọc theo tỉnh thành"
          className="-mx-1 no-scrollbar flex gap-2 overflow-x-auto px-1 py-0.5"
        >
          {[{ name: ALL, count: stores.length }, ...provinces].map((p) => {
            const active = province === p.name
            return (
              <button
                key={p.name}
                type="button"
                aria-pressed={active}
                onClick={() => setPickedProvince(p.name)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap ring-1 transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-brand font-medium text-white ring-brand"
                    : "bg-white text-brand ring-brand/25 hover:bg-brand-soft",
                )}
              >
                {p.name === ALL ? "Tất cả" : p.name}
                <span className={cn("tabular text-xs", active ? "text-white/80" : "text-muted-foreground")}>
                  {p.count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex gap-2 md:w-[26rem]">
          <Button variant="outline" onClick={locate} disabled={locating} className="h-10 shrink-0 bg-white">
            {locating ? <Loader2Icon className="animate-spin" /> : <CrosshairIcon />}
            Gần tôi
          </Button>
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên, địa chỉ hoặc mã cửa hàng"
              aria-label="Tìm cửa hàng"
              className="h-10 bg-white pl-9"
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        Hiển thị <span className="font-semibold text-foreground">{filtered.length}</span> cửa hàng
        {point ? ", gần bạn nhất trước" : null}
      </p>

      {filtered.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((store) => (
            <li key={store.id}>
              <StoreCard
                store={store}
                distance={store.distanceKm}
                selected={selected?.id === store.id}
                onChoose={() => choose(store)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={SearchXIcon}
          title="Không tìm thấy cửa hàng phù hợp"
          description="Thử tìm theo tên đường, phường hoặc mã cửa hàng khác."
          action={
            <Button variant="outline" onClick={reset}>
              Xoá bộ lọc
            </Button>
          }
          className="rounded-xl bg-surface/60"
        />
      )}
    </div>
  )
}

function StoreCard({
  store,
  distance,
  selected,
  onChoose,
}: {
  store: Store
  /** Km from the shopper, when they shared a location. */
  distance?: number
  selected: boolean
  onChoose: () => void
}) {
  const status = STORE_STATUS[store.status]
  const active = store.status === "active"

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl bg-white p-4 ring-1 transition",
        selected
          ? "bg-brand-soft/40 ring-2 ring-brand"
          : "ring-border hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              active ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground",
            )}
          >
            <StoreIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="leading-snug font-bold text-foreground">
              {store.code} – {store.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {store.ward}, {store.province}
              {distance !== undefined ? (
                <span className="font-medium text-brand"> · cách {formatDistance(distance)}</span>
              ) : null}
            </p>
          </div>
        </div>
        <StatusBadge tone={status.tone} className="shrink-0">
          {status.label}
        </StatusBadge>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-foreground/85">
        <li className="flex items-start gap-2.5">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{store.address}</span>
        </li>
        <li className="flex items-center gap-2.5">
          <PhoneIcon className="size-4 shrink-0 text-muted-foreground" />
          <a href={`tel:${store.phone}`} className="tabular font-medium text-brand hover:underline">
            {formatPhone(store.phone)}
          </a>
        </li>
        <li className="flex items-center gap-2.5">
          <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
          <span>{hoursLabel(store.openHours)}</span>
        </li>
      </ul>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button asChild variant="outline" className="h-9 flex-1 bg-white px-3">
          <a href={mapsUrl(store)} target="_blank" rel="noopener noreferrer">
            <NavigationIcon />
            Chỉ đường
          </a>
        </Button>
        {selected ? (
          <Button disabled className="h-9 flex-1 px-3 disabled:opacity-100">
            <CheckIcon />
            Đang giao từ đây
          </Button>
        ) : (
          <Button onClick={onChoose} disabled={!active} className="h-9 flex-1 px-3">
            {active ? "Giao từ cửa hàng này" : "Tạm ngưng nhận đơn"}
          </Button>
        )}
      </div>
    </article>
  )
}
