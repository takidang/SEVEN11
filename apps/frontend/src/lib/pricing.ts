import type { Customer, Product, Promotion, PromotionStatus, SalesChannel } from "@/types"

import { formatVND } from "./format"
import { DRINK_CATEGORY_IDS, MAX_DRINK_VOUCHERS_PER_ORDER, NON_ELIGIBLE_CATEGORY_IDS, TIERS } from "./membership"

/**
 * The one pricing engine. The storefront checkout, the POS and the order
 * generator all price through `priceCart`, so a total can never disagree
 * between screens. The backend should port these rules 1:1.
 */

export const SHIPPING_FEE = 15_000
/**
 * Above this the shop pays the 15.000 ₫ delivery itself, so the threshold has to cover it:
 * at a 27% gross margin an order only earns the fee back from about 55.000 ₫.
 */
export const FREE_SHIPPING_FROM = 100_000

export interface CartLine {
  productId: string
  quantity: number
}

export interface PricedLine {
  productId: string
  product: Product
  quantity: number
  /** List selling price per unit. */
  unitPrice: number
  /** Price per unit after a flash sale (= unitPrice when none). */
  salePrice: number
  /** unitPrice × quantity */
  lineSubtotal: number
  /** Discount on this line from flash sale + buy-X-get-Y. */
  lineDiscount: number
  lineTotal: number
  /** Short label of the line-level promotion, e.g. "Flash sale -15%". */
  promoLabel?: string
}

export type DiscountKind = "flash-sale" | "buy-x-get-y" | "member" | "code"

export interface AppliedDiscount {
  kind: DiscountKind
  promotionId: string
  label: string
  amount: number
}

export interface PricingInput {
  lines: CartLine[]
  products: Product[] | Map<string, Product>
  promotions: Promotion[]
  channel: SalesChannel
  customer?: Customer | null
  code?: string
  /** Online delivery adds the shipping fee. */
  delivery?: boolean
  now?: Date
}

export interface PricingResult {
  lines: PricedLine[]
  itemCount: number
  /** Σ unitPrice × quantity */
  subtotal: number
  discounts: AppliedDiscount[]
  discountTotal: number
  shippingFee: number
  freeShipping: boolean
  total: number
  /** Promotion matched by `code`, when valid. */
  appliedCode?: Promotion
  /** Why `code` was rejected (Vietnamese, user-facing). */
  codeError?: string
  /** Spend that counts toward membership (excludes alcohol). */
  eligibleSpend: number
}

// ---------------------------------------------------------------------------
// Promotion status & time windows
// ---------------------------------------------------------------------------

/** Status derived from dates; `paused` is the only manual override. */
export function effectiveStatus(promotion: Promotion, now: Date = new Date()): PromotionStatus {
  if (promotion.status === "paused") return "paused"
  if (now < new Date(promotion.startsAt)) return "scheduled"
  if (now > new Date(promotion.endsAt)) return "ended"
  return "active"
}

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/** True when a promotion applies right now on this channel (incl. daily window). */
export function isPromotionLive(promotion: Promotion, now: Date, channel?: SalesChannel): boolean {
  if (effectiveStatus(promotion, now) !== "active") return false
  if (channel && !promotion.channels.includes(channel)) return false
  if (promotion.dailyStart && promotion.dailyEnd) {
    const m = now.getHours() * 60 + now.getMinutes()
    if (m < minutesOf(promotion.dailyStart) || m >= minutesOf(promotion.dailyEnd)) return false
  }
  if (promotion.usageLimit !== undefined && promotion.usageCount >= promotion.usageLimit) return false
  return true
}

/** When today's window of a daily promotion closes (for countdowns). */
export function windowEndsAt(promotion: Promotion, now: Date): Date | null {
  if (!promotion.dailyEnd) return new Date(promotion.endsAt)
  const end = new Date(now)
  const minutes = minutesOf(promotion.dailyEnd)
  end.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return end
}

function appliesToProduct(promotion: Promotion, product: Product) {
  if (promotion.productIds.length === 0 && promotion.categoryIds.length === 0) return true
  return promotion.productIds.includes(product.id) || promotion.categoryIds.includes(product.categoryId)
}

/** Flash-sale price for one unit (rounded to 1.000 ₫). */
export function flashPrice(price: number, percent: number) {
  const off = Math.max(1_000, Math.round((price * percent) / 100 / 1_000) * 1_000)
  return Math.max(0, price - off)
}

/** Best live flash sale for a product, if any. */
export function flashSaleFor(
  product: Product,
  promotions: Promotion[],
  now: Date,
  channel?: SalesChannel,
): Promotion | null {
  let best: Promotion | null = null
  for (const p of promotions) {
    if (p.type !== "flash-sale" || !appliesToProduct(p, product) || !isPromotionLive(p, now, channel)) continue
    if (!best || p.value > best.value) best = p
  }
  return best
}

/**
 * What a shopper sees on a product card right now: the selling price, the
 * struck-through price and the live flash sale (if any).
 */
export function displayPrice(product: Product, promotions: Promotion[], now: Date | null) {
  const sale = now ? flashSaleFor(product, promotions, now, "online") : null
  if (sale && now) {
    return {
      price: flashPrice(product.price, sale.value),
      compareAtPrice: product.compareAtPrice ?? product.price,
      flashSale: sale,
      flashEndsAt: windowEndsAt(sale, now),
    }
  }
  return { price: product.price, compareAtPrice: product.compareAtPrice, flashSale: null, flashEndsAt: null }
}

// ---------------------------------------------------------------------------
// Cart pricing
// ---------------------------------------------------------------------------

export function priceCart(input: PricingInput): PricingResult {
  const now = input.now ?? new Date()
  const byId = input.products instanceof Map ? input.products : new Map(input.products.map((p) => [p.id, p] as const))
  const promotions = input.promotions
  const discounts: AppliedDiscount[] = []

  // 1. Lines + flash sale + buy X get Y (line-level)
  const lines: PricedLine[] = []
  for (const line of input.lines) {
    const product = byId.get(line.productId)
    if (!product || line.quantity <= 0) continue
    const unitPrice = product.price
    const sale = flashSaleFor(product, promotions, now, input.channel)
    const salePrice = sale ? flashPrice(unitPrice, sale.value) : unitPrice
    const lineSubtotal = unitPrice * line.quantity
    let lineDiscount = (unitPrice - salePrice) * line.quantity
    let promoLabel: string | undefined
    if (sale) {
      promoLabel = `Flash sale -${sale.value}%`
      discounts.push({ kind: "flash-sale", promotionId: sale.id, label: sale.name, amount: lineDiscount })
    }
    const bxgy = promotions.find(
      (p) =>
        p.type === "buy-x-get-y" &&
        p.buyQuantity &&
        p.getQuantity &&
        appliesToProduct(p, product) &&
        isPromotionLive(p, now, input.channel),
    )
    if (bxgy && bxgy.buyQuantity && bxgy.getQuantity) {
      const free = Math.floor(line.quantity / (bxgy.buyQuantity + bxgy.getQuantity)) * bxgy.getQuantity
      if (free > 0) {
        const amount = free * salePrice
        lineDiscount += amount
        promoLabel = `Mua ${bxgy.buyQuantity} tặng ${bxgy.getQuantity}`
        discounts.push({ kind: "buy-x-get-y", promotionId: bxgy.id, label: bxgy.name, amount })
      }
    }
    lines.push({
      productId: product.id,
      product,
      quantity: line.quantity,
      unitPrice,
      salePrice,
      lineSubtotal,
      lineDiscount,
      lineTotal: lineSubtotal - lineDiscount,
      promoLabel,
    })
  }

  const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0)
  const afterLines = lines.reduce((s, l) => s + l.lineTotal, 0)
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0)

  // 2. Member drink vouchers
  let memberDiscount = 0
  const customer = input.customer
  if (customer) {
    const memberPromo = promotions.find(
      (p) => p.type === "member-voucher" && isPromotionLive(p, now, input.channel) && p.tiers.includes(customer.tier),
    )
    if (memberPromo) {
      const tier = TIERS[customer.tier]
      let cups = MAX_DRINK_VOUCHERS_PER_ORDER
      const drinkLines = lines
        .filter((l) => DRINK_CATEGORY_IDS.includes(l.product.categoryId))
        .sort((a, b) => b.salePrice - a.salePrice)
      for (const l of drinkLines) {
        if (cups <= 0) break
        const use = Math.min(cups, l.quantity)
        memberDiscount += Math.min(tier.drinkVoucher, l.salePrice) * use
        cups -= use
      }
      if (memberDiscount > 0) {
        discounts.push({
          kind: "member",
          promotionId: memberPromo.id,
          label: `Ưu đãi thành viên ${tier.label} (-${formatVND(tier.drinkVoucher)}/ly)`,
          amount: memberDiscount,
        })
      }
    }
  }

  // 3. Promotion code
  let codeDiscount = 0
  let appliedCode: Promotion | undefined
  let codeError: string | undefined
  const code = input.code?.trim().toUpperCase()
  if (code) {
    const promo = promotions.find((p) => p.code?.toUpperCase() === code)
    const base = afterLines - memberDiscount
    if (!promo) codeError = "Mã khuyến mãi không tồn tại"
    else if (promo.ownerId && promo.ownerId !== customer?.id)
      codeError = customer ? "Voucher này thuộc tài khoản khác" : "Voucher riêng của thành viên, vui lòng đăng nhập"
    else if (effectiveStatus(promo, now) === "scheduled") codeError = "Mã chưa đến thời gian áp dụng"
    else if (effectiveStatus(promo, now) === "ended") codeError = "Mã đã hết hạn"
    else if (effectiveStatus(promo, now) === "paused") codeError = "Mã đang tạm dừng"
    else if (!promo.channels.includes(input.channel))
      codeError = input.channel === "online" ? "Mã chỉ dùng khi mua tại cửa hàng" : "Mã chỉ dùng khi đặt online"
    else if (promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit)
      codeError = "Mã đã hết lượt sử dụng"
    else if (promo.tiers.length > 0 && !customer) codeError = "Mã chỉ dành cho thành viên, vui lòng đăng nhập"
    else if (promo.tiers.length > 0 && customer && !promo.tiers.includes(customer.tier))
      codeError = `Mã chỉ dành cho hạng ${promo.tiers.map((t) => TIERS[t].label).join(", ")}`
    else if (promo.minOrderValue && base < promo.minOrderValue)
      codeError = `Đơn tối thiểu ${formatVND(promo.minOrderValue)} để dùng mã này`
    else {
      const eligible = lines.filter((l) => appliesToProduct(promo, l.product)).reduce((s, l) => s + l.lineTotal, 0)
      if (eligible <= 0) codeError = "Giỏ hàng không có sản phẩm áp dụng mã này"
      else {
        if (promo.type === "percent") {
          codeDiscount = Math.round((eligible * promo.value) / 100)
          if (promo.maxDiscount) codeDiscount = Math.min(codeDiscount, promo.maxDiscount)
        } else {
          codeDiscount = Math.min(promo.value, eligible)
        }
        codeDiscount = Math.min(codeDiscount, Math.max(0, base))
        appliedCode = promo
        discounts.push({ kind: "code", promotionId: promo.id, label: `Mã ${promo.code}`, amount: codeDiscount })
      }
    }
  }

  // Merge line discounts of the same promotion (one row per promotion in summaries)
  const merged = new Map<string, AppliedDiscount>()
  for (const d of discounts) {
    const key = `${d.kind}:${d.promotionId}`
    const prev = merged.get(key)
    merged.set(key, prev ? { ...prev, amount: prev.amount + d.amount } : { ...d })
  }
  const mergedDiscounts = [...merged.values()].filter((d) => d.amount > 0)
  const discountTotal = mergedDiscounts.reduce((s, d) => s + d.amount, 0)

  // 4. Shipping
  const payable = Math.max(0, subtotal - discountTotal)
  const freeShipping = !!input.delivery && payable >= FREE_SHIPPING_FROM
  const shippingFee = input.delivery && itemCount > 0 && !freeShipping ? SHIPPING_FEE : 0

  const eligibleSpend = lines
    .filter((l) => !NON_ELIGIBLE_CATEGORY_IDS.includes(l.product.categoryId))
    .reduce((s, l) => s + l.lineTotal, 0)

  return {
    lines,
    itemCount,
    subtotal,
    discounts: mergedDiscounts,
    discountTotal,
    shippingFee,
    freeShipping,
    total: payable + shippingFee,
    appliedCode,
    codeError,
    eligibleSpend: Math.max(0, eligibleSpend - memberDiscount - codeDiscount),
  }
}
