"use client"

import { BikeIcon, ShieldCheckIcon, StoreIcon, ZapIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { addToCart, QuantityStepper, useCartQuantity } from "@/components/shop/add-to-cart"
import { Countdown } from "@/components/shop/countdown"
import { Button } from "@/components/ui/button"
import { useDisplayPrice, usePromotions } from "@/hooks/use-catalog"
import { STOCK_STATE, stockState, useStockMap } from "@/hooks/use-stock"
import { discountPercent, formatTime, formatVND } from "@/lib/format"
import { FREE_SHIPPING_FROM, priceCart } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { useCart } from "@/stores/cart"
import { useDb } from "@/stores/db"
import { useDbReady, useHydrated, useNow } from "@/stores/hydration"
import type { Product, Store } from "@/types"

import { Bone } from "../../../_components/skeletons"

const DELIVERY_MINUTES = 24
const DELIVERY_WINDOW_MINUTES = 10

/** Everything the buy box and the mobile buy bar share. */
export function usePurchase(product: Product) {
  const display = useDisplayPrice(product)
  const promotions = usePromotions()
  const now = useNow(30_000)
  const ready = useDbReady()
  const hydrated = useHydrated()
  const storeId = useCart((s) => s.storeId)
  const stores = useDb((s) => s.stores)
  const stock = useStockMap(storeId)
  const inCart = useCartQuantity(product.id)
  const [quantity, setQuantity] = useState(1)

  // Stock and the chosen store are only known once the DB and the cart are loaded.
  const known = ready && hydrated
  const store = stores.find((s) => s.id === storeId) ?? null
  const level = stock.get(product.id)
  const state = stockState(level)
  const available = level?.quantity ?? 0
  const remaining = Math.max(0, available - inCart)
  const max = known ? Math.max(1, Math.min(99, remaining)) : 99
  const qty = Math.min(quantity, max)

  let blocker: string | null = null
  if (!product.isActive) blocker = "Ngừng kinh doanh"
  else if (known && store?.status !== "active") blocker = "Cửa hàng tạm ngưng phục vụ"
  else if (known && state === "out") blocker = "Tạm hết hàng"
  else if (known && remaining <= 0) blocker = "Đã thêm hết số lượng còn hàng"

  // Same engine as the cart: flash sale + buy X get Y for the chosen quantity.
  const { lineTotal, bundleLabel } = useMemo(() => {
    if (!now) return { lineTotal: display.price * qty, bundleLabel: null }
    const priced = priceCart({
      lines: [{ productId: product.id, quantity: qty }],
      products: [product],
      promotions,
      channel: "online",
      now,
    })
    const label = priced.lines[0]?.promoLabel
    return { lineTotal: priced.total, bundleLabel: label?.startsWith("Mua") ? label : null }
  }, [now, display.price, qty, product, promotions])

  return {
    product,
    display,
    now,
    known,
    hydrated,
    store,
    state,
    available,
    inCart,
    qty,
    max,
    setQuantity,
    blocker,
    lineTotal,
    bundleLabel,
    add: () => addToCart(product, qty),
  }
}

export type Purchase = ReturnType<typeof usePurchase>

export function PurchasePanel({ purchase }: { purchase: Purchase }) {
  const { product, display, known, hydrated, inCart } = purchase
  const percent = discountPercent(display.price, display.compareAtPrice)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {display.flashSale && display.flashEndsAt ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-red-soft px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1 font-bold text-red uppercase">
              <ZapIcon className="size-4 fill-current" />
              Flash sale
            </span>
            <span className="font-medium text-foreground">{display.flashSale.name}</span>
            <Countdown endsAt={display.flashEndsAt} prefix="Kết thúc sau" className="text-sm text-muted-foreground" />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-2xl font-bold text-brand">{formatVND(display.price)}</span>
          {display.compareAtPrice && display.compareAtPrice > display.price ? (
            <span className="text-base text-muted-foreground line-through">{formatVND(display.compareAtPrice)}</span>
          ) : null}
          {percent ? (
            <span className="rounded bg-sale-soft px-1.5 py-0.5 text-sm font-semibold text-sale">-{percent}%</span>
          ) : null}
        </div>
      </div>

      <div className="divide-y rounded-xl ring-1 ring-border">
        <DeliveryRow now={purchase.now} />
        <AvailabilityRow purchase={purchase} />
      </div>

      {product.ageRestricted ? (
        <p className="flex items-center gap-3 rounded-xl bg-surface p-3 text-sm ring-1 ring-border">
          <span className="flex h-7 shrink-0 items-center rounded-md bg-foreground/85 px-2 text-xs font-bold text-white">
            18+
          </span>
          Sản phẩm giới hạn độ tuổi. Bạn sẽ được yêu cầu xác nhận đã đủ 18 tuổi khi thêm vào giỏ.
        </p>
      ) : null}

      <div className="hidden items-center gap-4 lg:flex">
        <QuantityStepper value={purchase.qty} onChange={purchase.setQuantity} max={purchase.max} size="lg" />
        <AddButton purchase={purchase} className="h-12 flex-1 text-base" />
      </div>

      <div className="space-y-1.5">
        {purchase.bundleLabel && !purchase.blocker ? (
          <p className="text-sm font-medium text-brand">
            Giá trên đã trừ quà tặng “{purchase.bundleLabel}” cho {purchase.qty} {product.unit}.
          </p>
        ) : null}
        {hydrated && inCart > 0 ? (
          <p className="text-sm text-muted-foreground">
            Đã có <span className="font-semibold text-foreground">{inCart}</span> sản phẩm này trong giỏ ·{" "}
            <Link href="/gio-hang" className="font-medium text-brand hover:underline">
              Xem giỏ hàng
            </Link>
          </p>
        ) : null}
        {known && purchase.state === "low" && !purchase.blocker ? (
          <p className="text-sm text-warning">
            Chỉ còn {purchase.available} {product.unit} tại cửa hàng, đặt sớm để giữ hàng.
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-4 shrink-0 text-brand" />
          Hàng được kiểm tra hạn dùng tại cửa hàng trước khi giao.
        </p>
      </div>
    </div>
  )
}

function DeliveryRow({ now }: { now: Date | null }) {
  const eta = useMemo(() => {
    if (!now) return null
    const start = new Date(now.getTime() + DELIVERY_MINUTES * 60_000)
    const end = new Date(start.getTime() + DELIVERY_WINDOW_MINUTES * 60_000)
    return `${formatTime(start)} – ${formatTime(end)}`
  }, [now])

  return (
    <div className="flex items-start gap-3 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fresh-soft text-fresh">
        <BikeIcon className="size-5" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-bold tracking-wide text-fresh uppercase">Giao nhanh 24 phút</p>
        <div className="mt-0.5 text-muted-foreground">
          {eta ? (
            <>
              Dự kiến giao <span className="tabular font-medium text-foreground">{eta}</span>
            </>
          ) : (
            <Bone className="h-4 w-44" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Miễn phí giao hàng cho đơn từ {formatVND(FREE_SHIPPING_FROM)}
        </p>
      </div>
    </div>
  )
}

function AvailabilityRow({ purchase }: { purchase: Purchase }) {
  const { known, store, state } = purchase

  return (
    <div className="flex items-start gap-3 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <StoreIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {known && store ? (
          <>
            <AvailabilityBadge store={store} state={state} />
            <p className="mt-1 text-muted-foreground">
              tại cửa hàng{" "}
              <span className="font-medium text-foreground">
                {store.code} – {store.name}
              </span>
            </p>
          </>
        ) : (
          <div className="space-y-1.5 py-0.5">
            <Bone className="h-6 w-24 rounded-full" />
            <Bone className="h-4 w-52" />
          </div>
        )}
      </div>
      <Link href="/cua-hang" className="shrink-0 pt-0.5 text-sm font-medium text-brand hover:underline">
        Đổi cửa hàng
      </Link>
    </div>
  )
}

const AVAILABILITY_LABEL = { ok: "Còn hàng", low: "Sắp hết", out: "Tạm hết hàng" } as const

function AvailabilityBadge({ store, state }: { store: Store; state: keyof typeof AVAILABILITY_LABEL }) {
  if (store.status !== "active") return <StatusBadge tone="warning">Cửa hàng tạm ngưng phục vụ</StatusBadge>
  return <StatusBadge tone={STOCK_STATE[state].tone}>{AVAILABILITY_LABEL[state]}</StatusBadge>
}

function AddButton({ purchase, className }: { purchase: Purchase; className?: string }) {
  // Until the cart and stock are loaded, adding could be undone by the cart rehydrating.
  const loading = !purchase.known && !purchase.blocker
  return (
    <Button
      size="lg"
      disabled={!!purchase.blocker || loading}
      aria-busy={loading || undefined}
      onClick={purchase.add}
      className={cn(
        "rounded-xl font-bold",
        purchase.blocker && "disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        loading && "disabled:opacity-80",
        className,
      )}
    >
      {purchase.blocker ?? (
        <>
          Thêm <span aria-hidden>·</span> <span className="tabular">{formatVND(purchase.lineTotal)}</span>
        </>
      )}
    </Button>
  )
}

/** Phones: quantity + add button pinned to the bottom of the screen while the page scrolls. */
export function MobileBuyBar({ purchase }: { purchase: Purchase }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 border-t bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:hidden">
      <div className="flex items-center gap-3">
        <QuantityStepper value={purchase.qty} onChange={purchase.setQuantity} max={purchase.max} size="lg" />
        <AddButton purchase={purchase} className="h-11 flex-1 text-[15px]" />
      </div>
    </div>
  )
}
