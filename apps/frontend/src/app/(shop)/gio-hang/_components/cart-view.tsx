"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronLeftIcon, GiftIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { DELIVERY_RADIUS_KM, distanceKm, formatDistance } from "@/lib/geo"
import { normalizePhone } from "@/lib/phone"
import { AddressDialog } from "@/components/shop/address-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { usePromotions, useProductMap } from "@/hooks/use-catalog"
import { useStockMap } from "@/hooks/use-stock"
import { formatVND } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { priceCart } from "@/lib/pricing"
import { DEFAULT_STORE_ID, useCart } from "@/stores/cart"
import { useDb } from "@/stores/db"
import { useDbReady, useHydrated, useNow } from "@/stores/hydration"
import { useCurrentCustomer, useSession } from "@/stores/session"

import { CartLines } from "./cart-lines"
import { CartSkeleton } from "./cart-skeleton"
import { CartSuggestions } from "./cart-suggestions"
import { type CheckoutPaymentMethod, type RecipientValues, recipientSchema, SIGN_IN_TO_CHECKOUT } from "./checkout-form"
import { DeliverySection } from "./delivery-section"
import { EmptyCart } from "./empty-cart"
import { MobileCheckoutBar, OrderSummary } from "./order-summary"
import { PaymentSection } from "./payment-section"

export function CartView() {
  const hydrated = useHydrated()
  const dbReady = useDbReady()
  const now = useNow(30_000)
  const hasLines = useCart((s) => s.lines.length > 0)
  const customerId = useSession((s) => s.customerId)
  const [placedCode, setPlacedCode] = useState<string | null>(null)

  if (placedCode) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-center">
        <Spinner className="size-6 text-brand" />
        <p className="text-sm font-medium">Đặt hàng thành công, đang mở đơn {placedCode}…</p>
      </div>
    )
  }
  if (!hydrated || !dbReady || !now) return <CartSkeleton />
  if (!hasLines) return <EmptyCart />
  // Remount when the shopper signs in/out elsewhere so the recipient fields prefill again.
  return <Checkout key={customerId ?? "guest"} now={now} onPlaced={setPlacedCode} />
}

function Checkout({ now, onPlaced }: { now: Date; onPlaced: (code: string) => void }) {
  const router = useRouter()
  const lines = useCart((s) => s.lines)
  const storeId = useCart((s) => s.storeId)
  const promoCode = useCart((s) => s.promoCode)
  const note = useCart((s) => s.note)
  const deliveryAddress = useCart((s) => s.deliveryAddress)
  const productMap = useProductMap()
  const promotions = usePromotions()
  const stores = useDb((s) => s.stores)
  const customer = useCurrentCustomer()
  const stockMap = useStockMap(storeId)
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("cod")
  const [addressOpen, setAddressOpen] = useState(false)

  const store = stores.find((s) => s.id === storeId) ?? stores.find((s) => s.id === DEFAULT_STORE_ID)
  // Without coordinates we cannot measure the trip, so price the platforms at a typical 3 km.
  const tripKm =
    store && deliveryAddress?.lat !== undefined && deliveryAddress?.lng !== undefined
      ? distanceKm({ lat: deliveryAddress.lat, lng: deliveryAddress.lng }, store)
      : 3
  const defaultAddress = customer?.addresses.find((a) => a.isDefault) ?? customer?.addresses[0]

  // A member with a saved address never has to type it: use the default one (this also picks the store).
  // The coordinates have to come along, otherwise the order falls back to the first store in the province.
  useEffect(() => {
    if (deliveryAddress || !defaultAddress) return
    const { line, ward, province, lat, lng } = defaultAddress
    useCart.getState().setDeliveryAddress({ line, ward, province, lat, lng })
  }, [deliveryAddress, defaultAddress])

  // Products switched off by staff stay visible but are left out of pricing and the order.
  const orderableLines = useMemo(
    () => lines.filter((l) => !!productMap.get(l.productId)?.isActive),
    [lines, productMap],
  )
  const hasUnavailable = orderableLines.length !== lines.length

  const priceWithCode = useCallback(
    (code: string | undefined, at: Date) =>
      priceCart({
        lines: orderableLines,
        products: productMap,
        promotions,
        channel: "online",
        customer,
        code,
        delivery: true,
        now: at,
      }),
    [orderableLines, productMap, promotions, customer],
  )
  const pricing = useMemo(() => priceWithCode(promoCode || undefined, now), [priceWithCode, promoCode, now])
  const shortLines = pricing.lines.filter((l) => l.quantity > (stockMap.get(l.productId)?.quantity ?? 0))

  const savedAddress = customer?.addresses.find(
    (a) =>
      a.line === deliveryAddress?.line && a.ward === deliveryAddress?.ward && a.province === deliveryAddress?.province,
  )
  const form = useForm<RecipientValues>({
    resolver: zodResolver(recipientSchema),
    // We scroll the section into view ourselves (the sticky header would hide a natively focused field).
    shouldFocusError: false,
    defaultValues: {
      recipient: (savedAddress ?? defaultAddress)?.recipient ?? customer?.fullName ?? "",
      phone: (savedAddress ?? defaultAddress)?.phone ?? customer?.phone ?? "",
    },
  })

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

  const placeOrder = form.handleSubmit(
    (values) => {
      if (!customer) {
        router.push(SIGN_IN_TO_CHECKOUT)
        return
      }
      const address = useCart.getState().deliveryAddress
      if (!address) {
        toast.error("Vui lòng nhập địa chỉ giao hàng")
        setAddressOpen(true)
        return
      }
      if (hasUnavailable) {
        toast.error("Giỏ hàng có sản phẩm đã ngừng bán", { description: "Xoá các sản phẩm đó để tiếp tục đặt hàng." })
        scrollTo("san-pham")
        return
      }
      if (!store || store.status !== "active") {
        toast.error("Cửa hàng phục vụ đang tạm ngưng nhận đơn", {
          description: "Vui lòng chọn địa chỉ giao hàng khác.",
        })
        return
      }
      // Only when the address has coordinates do we know how far it is; typed-only addresses pass.
      if (address.lat !== undefined && address.lng !== undefined) {
        const away = distanceKm({ lat: address.lat, lng: address.lng }, store)
        if (away > DELIVERY_RADIUS_KM) {
          toast.error("Địa chỉ ngoài vùng giao hàng", {
            description: `Cửa hàng gần nhất cách ${formatDistance(away)}, quá ${DELIVERY_RADIUS_KM} km nên không giao trong 24 phút được.`,
          })
          setAddressOpen(true)
          return
        }
      }
      if (shortLines.length) {
        toast.error(`Cửa hàng ${store.code} không đủ hàng cho ${shortLines.length} sản phẩm`, {
          description: "Giảm số lượng hoặc xoá các sản phẩm được đánh dấu.",
        })
        scrollTo("san-pham")
        return
      }
      if (promoCode && pricing.codeError) {
        toast.error(`Chưa dùng được mã ${promoCode}`, { description: `${pricing.codeError}. Gỡ mã để tiếp tục.` })
        return
      }

      const result = useDb.getState().placeOrder({
        channel: "online",
        storeId: store.id,
        lines: orderableLines,
        paymentMethod,
        customerId: customer.id,
        promotionCode: promoCode || undefined,
        delivery: {
          recipient: values.recipient.trim(),
          phone: normalizePhone(values.phone),
          address: `${address.line}, ${address.ward}, ${address.province}`,
          note: note.trim() || undefined,
          distanceKm: Math.round(tripKm * 10) / 10,
        },
      })
      if (!result.ok) {
        toast.error("Chưa đặt được hàng", { description: result.error })
        return
      }
      onPlaced(result.order.code)
      useCart.getState().clear()
      router.push(`/don-hang/${result.order.code}?moi=1`)
    },
    (errors) => {
      toast.error("Vui lòng kiểm tra thông tin người nhận")
      scrollTo("giao-hang")
      const field = errors.recipient ? "checkout-recipient" : "checkout-phone"
      document.getElementById(field)?.focus({ preventScroll: true })
    },
  )
  const submit = () => void placeOrder()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Giỏ hàng</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lines.reduce((sum, l) => sum + l.quantity, 0)} sản phẩm · giao nhanh trong 24 phút
          </p>
        </div>
        <Link href="/" className="hidden items-center text-sm font-medium text-brand hover:underline sm:inline-flex">
          <ChevronLeftIcon className="size-4" /> Tiếp tục mua sắm
        </Link>
      </div>

      {!customer ? (
        <div className="flex flex-col gap-3 rounded-xl bg-orange-soft p-4 sm:flex-row sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-orange">
            <GiftIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Đăng nhập để đặt hàng và nhận ưu đãi thành viên</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Giảm đến {formatVND(TIERS.diamond.drinkVoucher)} mỗi ly đồ uống, lưu địa chỉ giao hàng và theo dõi đơn
              theo thời gian thực.
            </p>
          </div>
          <Button asChild variant="outline" className="h-9 shrink-0 bg-white">
            <Link href={SIGN_IN_TO_CHECKOUT}>Đăng nhập</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <CartLines
            lines={lines}
            pricedLines={pricing.lines}
            productMap={productMap}
            stockMap={stockMap}
            store={store}
          />
          <CartSuggestions lines={lines} />
          <DeliverySection
            form={form}
            store={store}
            address={deliveryAddress}
            now={now}
            onChangeAddress={() => setAddressOpen(true)}
          />
          <PaymentSection value={paymentMethod} onChange={setPaymentMethod} />
        </div>

        <div className="xl:sticky xl:top-20">
          <OrderSummary
            pricing={pricing}
            priceWithCode={(code) => priceWithCode(code, new Date())}
            promotions={promotions}
            customer={customer}
            now={now}
            onPlaceOrder={submit}
          />
        </div>
      </div>

      <MobileCheckoutBar pricing={pricing} customer={customer} onPlaceOrder={submit} />
      <AddressDialog open={addressOpen} onOpenChange={setAddressOpen} />
    </div>
  )
}
