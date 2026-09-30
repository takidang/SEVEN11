"use client"

import { del, get, set } from "idb-keyval"
import { create } from "zustand"
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware"

import { categories, products } from "@/data/catalog"
import { employees } from "@/data/staff"
import { stores } from "@/data/stores"
import { suppliers } from "@/data/suppliers"
import { deliveryMinutes } from "@/lib/delivery"
import { formatVND, toDateKey } from "@/lib/format"
import {
  addTierSpend,
  checkKeepTier,
  memberSpendByMonth,
  monthKey,
  monthStart,
  removeTierSpend,
  shiftMonth,
} from "@/lib/membership"
import { hashPassword } from "@/lib/password"
import { type CartLine, priceCart } from "@/lib/pricing"
import { createSeed, type Database, orderCode, SEED_VERSION } from "@/lib/seed"
import {
  earnStars,
  REWARD_VOUCHER_DAYS,
  STAR_REWARDS,
  STAR_VALID_MONTHS,
  starsToExpire,
  takeBackStars,
} from "@/lib/stars"
import type {
  Address,
  Customer,
  DeliveryInfo,
  Employee,
  InventoryBatch,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  Promotion,
  PromotionStatus,
  PurchaseOrder,
  SalesChannel,
  Shift,
  StarEntry,
  StockLevel,
  Store,
  Supplier,
} from "@/types"

/**
 * The mock backend. Holds every collection in the browser (IndexedDB) so the
 * whole app works end-to-end without a server: an order placed on the
 * storefront shows up in the back office, a POS sale lowers stock, etc.
 *
 * When the real backend exists, replace these actions with API calls — the
 * action names/inputs are the intended endpoints (see docs/architecture.md).
 */

export interface DbMeta {
  version: number
  seededAt: string
  /** True once the user changed anything — stops the daily auto re-seed. */
  dirty: boolean
}

export interface PlaceOrderInput {
  channel: SalesChannel
  storeId: string
  lines: CartLine[]
  paymentMethod: PaymentMethod
  customerId?: string
  employeeId?: string
  promotionCode?: string
  cashReceived?: number
  delivery?: Omit<DeliveryInfo, "eta">
}

export type PlaceOrderResult = { ok: true; order: Order } | { ok: false; error: string }

export type RedeemStarsResult = { ok: true; voucher: Promotion } | { ok: false; error: string }

interface DbActions {
  // Catalog
  saveProduct: (product: Product) => void
  setProductActive: (productId: string, isActive: boolean) => void
  // Inventory
  adjustStock: (storeId: string, productId: string, delta: number) => void
  setStockLevel: (
    storeId: string,
    productId: string,
    patch: Partial<Pick<StockLevel, "quantity" | "minQuantity">>,
  ) => void
  /** Xuất huỷ: remove a batch (expired / damaged) and take it out of stock. */
  discardBatch: (batchId: string) => void
  // Orders
  placeOrder: (input: PlaceOrderInput) => PlaceOrderResult
  updateOrderStatus: (orderId: string, status: OrderStatus, by?: string, note?: string) => void
  // Customers
  /** `password` is omitted for members registered at the counter (they set one later via OTP). */
  registerCustomer: (input: { fullName: string; phone: string; email?: string; password?: string }) => Customer
  /** Sets (or replaces) a member's password — used by "Quên mật khẩu" after the OTP check. */
  setCustomerPassword: (customerId: string, password: string) => void
  updateCustomer: (customerId: string, patch: Partial<Omit<Customer, "id">>) => void
  saveAddress: (customerId: string, address: Address) => void
  removeAddress: (customerId: string, addressId: string) => void
  /** Spends gold stars on a reward: creates a personal voucher. */
  redeemStars: (customerId: string, rewardId: string) => RedeemStarsResult
  /**
   * Monthly membership job (a cron job on the backend): keep-the-tier checks for every finished
   * month not reviewed yet, and star expiry. Safe to run any number of times.
   */
  reviewMemberships: (now: Date) => void
  // Staff
  saveEmployee: (employee: Employee) => void
  saveShift: (shift: Shift) => void
  deleteShift: (shiftId: string) => void
  checkIn: (shiftId: string, openingCash: number) => void
  checkOut: (shiftId: string, closingCash: number, note?: string) => void
  // Purchasing
  saveSupplier: (supplier: Supplier) => void
  /** Create (empty `code`) or update a purchase order. Returns the saved order. */
  savePurchaseOrder: (purchaseOrder: PurchaseOrder) => PurchaseOrder
  receivePurchaseOrder: (purchaseOrderId: string) => void
  cancelPurchaseOrder: (purchaseOrderId: string) => void
  // Promotions
  savePromotion: (promotion: Promotion) => void
  setPromotionStatus: (promotionId: string, status: PromotionStatus) => void
  // Stores
  saveStore: (store: Store) => void
  // Demo
  resetDemoData: () => void
}

export type DbState = Database & DbActions & { meta: DbMeta | null; ready: boolean }

export function newId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${random}`
}

const nowIso = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// IndexedDB storage: structured clone (no JSON) + debounced writes.
// ---------------------------------------------------------------------------

type Persisted = Database & { meta: DbMeta | null }

/** Other tabs of the app listen on this channel and reload the DB after a write. */
const SYNC_CHANNEL = "7eleven-db-sync"
const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random())

let hasPendingWrite = () => false

function createIdbStorage(delay = 400): PersistStorage<Persisted> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { name: string; value: StorageValue<Persisted> } | null = null
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SYNC_CHANNEL) : null
  hasPendingWrite = () => pending !== null
  const flush = async () => {
    if (!pending) return
    const { name, value } = pending
    pending = null
    await set(name, value)
    channel?.postMessage({ from: TAB_ID })
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => void flush())
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush()
    })
  }
  return {
    getItem: async (name) => (await get<StorageValue<Persisted>>(name)) ?? null,
    setItem: (name, value) => {
      pending = { name, value }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void flush(), delay)
    },
    removeItem: async (name) => {
      pending = null
      await del(name)
    },
  }
}

/**
 * Keep open tabs in sync: when another tab saves, reload from IndexedDB (unless this
 * tab has its own unsaved write — then it wins and broadcasts next). Rehydrating does
 * not write back, so tabs can't ping-pong.
 */
export function listenForOtherTabs(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {}
  const channel = new BroadcastChannel(SYNC_CHANNEL)
  channel.onmessage = (event: MessageEvent<{ from: string }>) => {
    if (event.data?.from === TAB_ID || hasPendingWrite()) return
    void Promise.resolve(useDb.persist.rehydrate()).then(() => {
      if (useDb.getState().ready) seedIfNeeded()
    })
  }
  return () => channel.close()
}

const emptyData: Persisted = {
  categories,
  products,
  stores,
  employees,
  suppliers,
  customers: [],
  promotions: [],
  orders: [],
  stock: [],
  batches: [],
  purchaseOrders: [],
  shifts: [],
  starLedger: [],
  customerPasswords: {},
  meta: null,
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const i = items.findIndex((x) => x.id === item.id)
  if (i === -1) return [item, ...items]
  const copy = items.slice()
  copy[i] = item
  return copy
}

export const useDb = create<DbState>()(
  persist(
    (setState, getState) => {
      /** Every mutation goes through here so `meta.dirty` is always set. */
      const mutate = (fn: (s: DbState) => Partial<Persisted>) =>
        setState((s) => ({ ...fn(s), meta: s.meta ? { ...s.meta, dirty: true } : s.meta }))

      /** Take `quantity` out of the store's lots of a product, earliest expiry first (FIFO). */
      const consumeBatches = (batches: InventoryBatch[], storeId: string, productId: string, quantity: number) => {
        let left = quantity
        const lots = batches
          .filter((b) => b.storeId === storeId && b.productId === productId)
          .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
        if (!lots.length) return batches
        const used = new Map<string, number>()
        for (const lot of lots) {
          if (left <= 0) break
          const take = Math.min(lot.quantity, left)
          used.set(lot.id, take)
          left -= take
        }
        return batches
          .map((b) => (used.has(b.id) ? { ...b, quantity: b.quantity - used.get(b.id)! } : b))
          .filter((b) => b.quantity > 0)
      }

      const changeStock = (stock: StockLevel[], storeId: string, productId: string, delta: number) => {
        const i = stock.findIndex((x) => x.storeId === storeId && x.productId === productId)
        const copy = stock.slice()
        if (i === -1) copy.push({ storeId, productId, quantity: Math.max(0, delta), minQuantity: 6 })
        else copy[i] = { ...copy[i], quantity: Math.max(0, copy[i].quantity + delta) }
        return copy
      }

      return {
        ...emptyData,
        ready: false,

        saveProduct: (product) =>
          mutate((s) => {
            const isNew = !s.products.some((p) => p.id === product.id)
            return {
              products: upsert(s.products, product),
              stock: isNew
                ? [
                    ...s.stock,
                    ...s.stores.map((st) => ({ storeId: st.id, productId: product.id, quantity: 0, minQuantity: 6 })),
                  ]
                : s.stock,
            }
          }),

        setProductActive: (productId, isActive) =>
          mutate((s) => ({ products: s.products.map((p) => (p.id === productId ? { ...p, isActive } : p)) })),

        adjustStock: (storeId, productId, delta) =>
          mutate((s) => ({ stock: changeStock(s.stock, storeId, productId, delta) })),

        setStockLevel: (storeId, productId, patch) =>
          mutate((s) => {
            const exists = s.stock.some((x) => x.storeId === storeId && x.productId === productId)
            if (!exists) return { stock: [...s.stock, { storeId, productId, quantity: 0, minQuantity: 6, ...patch }] }
            return {
              stock: s.stock.map((x) => (x.storeId === storeId && x.productId === productId ? { ...x, ...patch } : x)),
            }
          }),

        discardBatch: (batchId) =>
          mutate((s) => {
            const batch = s.batches.find((b) => b.id === batchId)
            if (!batch) return {}
            return {
              batches: s.batches.filter((b) => b.id !== batchId),
              stock: changeStock(s.stock, batch.storeId, batch.productId, -batch.quantity),
            }
          }),

        placeOrder: (input) => {
          const s = getState()
          const now = new Date()
          const customer = input.customerId ? s.customers.find((c) => c.id === input.customerId) : undefined
          const pricing = priceCart({
            lines: input.lines,
            products: s.products,
            promotions: s.promotions,
            channel: input.channel,
            customer,
            code: input.promotionCode,
            delivery: input.channel === "online" && !!input.delivery,
            now,
          })
          if (!pricing.lines.length) return { ok: false, error: "Giỏ hàng đang trống" }
          if (input.promotionCode && pricing.codeError) return { ok: false, error: pricing.codeError }
          if (
            input.paymentMethod === "cash" &&
            input.cashReceived !== undefined &&
            input.cashReceived < pricing.total
          ) {
            return { ok: false, error: "Tiền khách đưa chưa đủ" }
          }

          // Next number after the highest code issued today (codes carry the date, createdAt may not).
          const prefix = orderCode(now, 0).slice(0, 8)
          const seq =
            s.orders.reduce(
              (max, o) => (o.code.startsWith(prefix) ? Math.max(max, Number(o.code.slice(8)) || 0) : max),
              0,
            ) + 1
          const employee = input.employeeId ? s.employees.find((e) => e.id === input.employeeId) : undefined
          const createdAt = now.toISOString()
          const inStore = input.channel === "in-store"
          const order: Order = {
            id: newId("od"),
            code: orderCode(now, seq),
            channel: input.channel,
            storeId: input.storeId,
            customerId: customer?.id,
            employeeId: employee?.id,
            items: pricing.lines.map((l) => ({
              productId: l.productId,
              name: l.product.name,
              image: l.product.image,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              discount: l.lineDiscount,
              lineTotal: l.lineTotal,
            })),
            subtotal: pricing.subtotal,
            discount: pricing.discountTotal,
            shippingFee: pricing.shippingFee,
            total: pricing.total,
            promotionCode: pricing.appliedCode?.code,
            ...(customer
              ? {
                  memberSpend: pricing.eligibleSpend,
                  starsEarned: earnStars(customer.starCarry, pricing.eligibleSpend).stars,
                }
              : {}),
            paymentMethod: input.paymentMethod,
            paymentStatus: inStore || input.paymentMethod !== "cod" ? "paid" : "unpaid",
            status: inStore ? "completed" : "pending",
            cashReceived: input.cashReceived,
            changeGiven: input.cashReceived !== undefined ? input.cashReceived - pricing.total : undefined,
            delivery: input.delivery
              ? bookDelivery(
                  input.delivery,
                  now,
                  s.employees.filter((e) => e.storeId === input.storeId && e.status === "active"),
                )
              : undefined,
            timeline: [{ status: inStore ? "completed" : "pending", at: createdAt, by: employee?.fullName }],
            createdAt,
            updatedAt: createdAt,
          }

          mutate((st) => {
            let stock = st.stock
            let batches = st.batches
            for (const it of order.items) {
              stock = changeStock(stock, order.storeId, it.productId, -it.quantity)
              batches = consumeBatches(batches, order.storeId, it.productId, it.quantity)
            }
            return {
              orders: [order, ...st.orders],
              stock,
              batches,
              customers: customer
                ? st.customers.map((c) => {
                    if (c.id !== customer.id) return c
                    const earned = earnStars(c.starCarry, pricing.eligibleSpend)
                    return {
                      ...c,
                      ...addTierSpend(c, pricing.eligibleSpend, now),
                      stars: c.stars + earned.stars,
                      starCarry: earned.carry,
                      orderCount: c.orderCount + 1,
                      totalSpent: c.totalSpent + order.total,
                    }
                  })
                : st.customers,
              starLedger:
                customer && order.starsEarned
                  ? [
                      {
                        id: newId("st"),
                        customerId: customer.id,
                        at: createdAt,
                        delta: order.starsEarned,
                        kind: "earn" as const,
                        note: `Đơn ${order.code}`,
                        ref: order.code,
                      },
                      ...st.starLedger,
                    ]
                  : st.starLedger,
              promotions: pricing.appliedCode
                ? st.promotions.map((p) =>
                    p.id === pricing.appliedCode!.id ? { ...p, usageCount: p.usageCount + 1 } : p,
                  )
                : st.promotions,
            }
          })
          return { ok: true, order }
        },

        updateOrderStatus: (orderId, status, by, note) =>
          mutate((s) => {
            const order = s.orders.find((o) => o.id === orderId)
            if (!order || order.status === status) return {}
            const at = nowIso()
            const updated: Order = {
              ...order,
              status,
              updatedAt: at,
              timeline: [...order.timeline, { status, at, by, note }],
              paymentStatus:
                status === "completed" && order.paymentStatus === "unpaid"
                  ? "paid"
                  : status === "cancelled" && order.paymentStatus === "paid"
                    ? "refunded"
                    : order.paymentStatus,
            }
            let stock = s.stock
            let customers = s.customers
            let starLedger = s.starLedger
            if (status === "cancelled") {
              for (const it of order.items) stock = changeStock(stock, order.storeId, it.productId, it.quantity)
              if (order.customerId) {
                let taken = 0
                customers = customers.map((c) => {
                  if (c.id !== order.customerId) return c
                  const next = {
                    ...c,
                    orderCount: Math.max(0, c.orderCount - 1),
                    totalSpent: Math.max(0, c.totalSpent - order.total),
                  }
                  if (!order.memberSpend) return next
                  const back = takeBackStars(c.stars, c.starCarry, order.memberSpend, order.starsEarned ?? 0)
                  taken = back.taken
                  return {
                    ...next,
                    ...removeTierSpend(c, order.memberSpend, order.createdAt, new Date(at)),
                    stars: back.stars,
                    starCarry: back.carry,
                  }
                })
                if (taken > 0) {
                  const entry: StarEntry = {
                    id: newId("st"),
                    customerId: order.customerId,
                    at,
                    delta: -taken,
                    kind: "refund",
                    note: `Đơn ${order.code} bị huỷ`,
                    ref: order.code,
                  }
                  starLedger = [entry, ...starLedger]
                }
              }
            }
            return {
              orders: s.orders.map((o) => (o.id === orderId ? updated : o)),
              stock,
              customers,
              starLedger,
            }
          }),

        registerCustomer: ({ fullName, phone, email, password }) => {
          const existing = getState().customers.find((c) => c.phone === phone)
          if (existing) return existing
          const customer: Customer = {
            id: newId("cu"),
            fullName,
            phone,
            email,
            tier: "bronze",
            tierSpend: 0,
            tierSince: nowIso(),
            reviewedMonth: shiftMonth(monthKey(new Date()), -1),
            tierHistory: [],
            stars: 0,
            starCarry: 0,
            totalSpent: 0,
            orderCount: 0,
            joinedAt: nowIso(),
            addresses: [],
          }
          mutate((s) => ({
            customers: [customer, ...s.customers],
            customerPasswords: password
              ? { ...s.customerPasswords, [customer.id]: hashPassword(password) }
              : s.customerPasswords,
          }))
          return customer
        },

        setCustomerPassword: (customerId, password) =>
          mutate((s) => ({ customerPasswords: { ...s.customerPasswords, [customerId]: hashPassword(password) } })),

        updateCustomer: (customerId, patch) =>
          mutate((s) => ({ customers: s.customers.map((c) => (c.id === customerId ? { ...c, ...patch } : c)) })),

        saveAddress: (customerId, address) =>
          mutate((s) => ({
            customers: s.customers.map((c) => {
              if (c.id !== customerId) return c
              let addresses = upsert(c.addresses, address)
              if (address.isDefault || addresses.length === 1) {
                addresses = addresses.map((a) => ({ ...a, isDefault: a.id === address.id }))
              }
              return { ...c, addresses }
            }),
          })),

        removeAddress: (customerId, addressId) =>
          mutate((s) => ({
            customers: s.customers.map((c) => {
              if (c.id !== customerId) return c
              const addresses = c.addresses.filter((a) => a.id !== addressId)
              if (addresses.length && !addresses.some((a) => a.isDefault))
                addresses[0] = { ...addresses[0], isDefault: true }
              return { ...c, addresses }
            }),
          })),

        redeemStars: (customerId, rewardId) => {
          const s = getState()
          const customer = s.customers.find((c) => c.id === customerId)
          const reward = STAR_REWARDS.find((r) => r.id === rewardId)
          if (!customer || !reward) return { ok: false, error: "Không tìm thấy phần quà này" }
          if (customer.stars < reward.stars) {
            return { ok: false, error: `Bạn cần thêm ${reward.stars - customer.stars} sao để đổi voucher này` }
          }
          const now = new Date()
          const taken = new Set(s.promotions.map((p) => p.code))
          let code = ""
          do code = `SAO${Math.random().toString(36).slice(2, 7).toUpperCase()}`
          while (taken.has(code) || code.length < 8)
          const voucher: Promotion = {
            id: newId("pr"),
            code,
            ownerId: customer.id,
            name: `Voucher đổi sao ${formatVND(reward.value)}`,
            description: `Đổi từ ${reward.stars} sao vàng`,
            type: "fixed",
            value: reward.value,
            minOrderValue: reward.minOrderValue,
            productIds: [],
            categoryIds: [],
            tiers: [],
            channels: ["online", "in-store"],
            startsAt: now.toISOString(),
            endsAt: new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() + REWARD_VOUCHER_DAYS,
              23,
              59,
              59,
            ).toISOString(),
            status: "active",
            usageLimit: 1,
            usageCount: 0,
          }
          const entry: StarEntry = {
            id: newId("st"),
            customerId,
            at: now.toISOString(),
            delta: -reward.stars,
            kind: "redeem",
            note: `Đổi voucher ${formatVND(reward.value)}`,
            ref: code,
          }
          mutate((st) => ({
            promotions: [voucher, ...st.promotions],
            customers: st.customers.map((c) => (c.id === customerId ? { ...c, stars: c.stars - reward.stars } : c)),
            starLedger: [entry, ...st.starLedger],
          }))
          return { ok: true, voucher }
        },

        reviewMemberships: (now) => {
          const s = getState()
          const current = monthKey(now)
          const spendByMonth = memberSpendByMonth(s.orders)
          let starLedger = s.starLedger
          let changed = false
          const customers = s.customers.map((c) => {
            let next = c
            for (let month = shiftMonth(c.reviewedMonth, 1); month < current; month = shiftMonth(month, 1)) {
              const spend = spendByMonth.get(c.id)?.get(month) ?? 0
              const drop = checkKeepTier(next, month, spend, monthStart(shiftMonth(month, 1)))
              next = { ...next, ...drop, reviewedMonth: month }
            }
            const due = starsToExpire(
              starLedger.filter((e) => e.customerId === c.id),
              now,
            )
            if (due > 0) {
              next = { ...next, stars: Math.max(0, next.stars - due) }
              starLedger = [
                {
                  id: newId("st"),
                  customerId: c.id,
                  at: now.toISOString(),
                  delta: -due,
                  kind: "expire",
                  note: `Sao nhận quá ${STAR_VALID_MONTHS} tháng đã hết hạn`,
                },
                ...starLedger,
              ]
            }
            if (next !== c) changed = true
            return next
          })
          // Derived from existing data, so it doesn't mark the demo data as edited.
          if (changed) setState({ customers, starLedger })
        },

        saveEmployee: (employee) => mutate((s) => ({ employees: upsert(s.employees, employee) })),

        saveShift: (shift) => mutate((s) => ({ shifts: upsert(s.shifts, shift) })),

        deleteShift: (shiftId) => mutate((s) => ({ shifts: s.shifts.filter((x) => x.id !== shiftId) })),

        checkIn: (shiftId, openingCash) =>
          mutate((s) => ({
            shifts: s.shifts.map((x) =>
              x.id === shiftId ? { ...x, status: "in-progress", checkInAt: nowIso(), openingCash } : x,
            ),
          })),

        checkOut: (shiftId, closingCash, note) =>
          mutate((s) => ({
            shifts: s.shifts.map((x) =>
              x.id === shiftId
                ? { ...x, status: "completed", checkOutAt: nowIso(), closingCash, note: note ?? x.note }
                : x,
            ),
          })),

        saveSupplier: (supplier) => mutate((s) => ({ suppliers: upsert(s.suppliers, supplier) })),

        savePurchaseOrder: (purchaseOrder) => {
          const s = getState()
          const saved: PurchaseOrder = {
            ...purchaseOrder,
            code: purchaseOrder.code || `PN${String(s.purchaseOrders.length + 1).padStart(5, "0")}`,
            total: purchaseOrder.items.reduce((sum, it) => sum + it.quantity * it.costPrice, 0),
          }
          mutate((st) => ({ purchaseOrders: upsert(st.purchaseOrders, saved) })) // new ones go first (newest first)
          return saved
        },

        receivePurchaseOrder: (purchaseOrderId) =>
          mutate((s) => {
            const po = s.purchaseOrders.find((p) => p.id === purchaseOrderId)
            if (!po || po.status === "received" || po.status === "cancelled") return {}
            const now = new Date()
            let stock = s.stock
            const batches: InventoryBatch[] = []
            for (const it of po.items) {
              stock = changeStock(stock, po.storeId, it.productId, it.quantity)
              const product = s.products.find((p) => p.id === it.productId)
              if (product?.shelfLifeDays || it.expiresAt) {
                const expires = it.expiresAt
                  ? new Date(it.expiresAt)
                  : new Date(now.getTime() + (product?.shelfLifeDays ?? 1) * 86_400_000)
                batches.push({
                  id: newId("bt"),
                  storeId: po.storeId,
                  productId: it.productId,
                  lotCode: it.lotCode || `${po.code}-${it.productId}`,
                  quantity: it.quantity,
                  receivedAt: now.toISOString(),
                  expiresAt: expires.toISOString(),
                })
              }
            }
            return {
              stock,
              batches: [...batches, ...s.batches],
              purchaseOrders: s.purchaseOrders.map((p) =>
                p.id === purchaseOrderId ? { ...p, status: "received", receivedAt: now.toISOString() } : p,
              ),
            }
          }),

        cancelPurchaseOrder: (purchaseOrderId) =>
          mutate((s) => ({
            purchaseOrders: s.purchaseOrders.map((p) =>
              p.id === purchaseOrderId && p.status !== "received" ? { ...p, status: "cancelled" } : p,
            ),
          })),

        savePromotion: (promotion) => mutate((s) => ({ promotions: upsert(s.promotions, promotion) })),

        setPromotionStatus: (promotionId, status) =>
          mutate((s) => ({ promotions: s.promotions.map((p) => (p.id === promotionId ? { ...p, status } : p)) })),

        saveStore: (store) =>
          mutate((s) => {
            const isNew = !s.stores.some((st) => st.id === store.id)
            return {
              stores: upsert(s.stores, store),
              // A new store starts with an empty stock row for every product.
              stock: isNew
                ? [
                    ...s.stock,
                    ...s.products.map((p) => ({ storeId: store.id, productId: p.id, quantity: 0, minQuantity: 6 })),
                  ]
                : s.stock,
            }
          }),

        resetDemoData: () => {
          const seeded = createSeed(new Date())
          setState({ ...seeded, meta: { version: SEED_VERSION, seededAt: nowIso(), dirty: false } })
        },
      }
    },
    {
      name: "7eleven-db",
      version: SEED_VERSION,
      /**
       * A new seed version drops the demo data, but keeps what a shopper created (account,
       * password, orders, star history, star vouchers). `initDb` seeds fresh demo data and
       * `keepOwnAccounts` merges these rows back in; rows belonging to the old demo customers
       * are dropped there, because the fresh seed issues the same ids again.
       */
      migrate: (persisted) => {
        const prev = persisted as Partial<Persisted> | undefined
        return {
          ...emptyData,
          customers: prev?.customers ?? [],
          customerPasswords: prev?.customerPasswords ?? {},
          orders: prev?.orders ?? [],
          promotions: prev?.promotions ?? [],
          starLedger: prev?.starLedger ?? [],
        }
      },
      storage: createIdbStorage(),
      skipHydration: true,
      partialize: (s): Persisted => ({
        categories: s.categories,
        products: s.products,
        stores: s.stores,
        employees: s.employees,
        customers: s.customers,
        suppliers: s.suppliers,
        promotions: s.promotions,
        orders: s.orders,
        stock: s.stock,
        batches: s.batches,
        purchaseOrders: s.purchaseOrders,
        shifts: s.shifts,
        starLedger: s.starLedger,
        customerPasswords: s.customerPasswords,
        meta: s.meta,
      }),
    },
  ),
)

/**
 * Accounts shoppers registered themselves (they are not in a fresh seed) survive an automatic
 * re-seed, together with their password, orders, star history and star vouchers — losing a
 * sign-in because the demo data was refreshed would be surprising. "Tạo lại dữ liệu mẫu" in the
 * admin menu still wipes everything.
 */
function keepOwnAccounts(seeded: Database, previous: Database): Database {
  const seededIds = new Set(seeded.customers.map((c) => c.id))
  const mine = previous.customers.filter((c) => !seededIds.has(c.id))
  if (!mine.length) return seeded
  const ids = new Set(mine.map((c) => c.id))

  // Their orders keep their codes unless the fresh seed already issued that code today.
  const usedCodes = new Set(seeded.orders.map((o) => o.code))
  const nextSeq = new Map<string, number>()
  for (const o of seeded.orders) {
    const prefix = o.code.slice(0, 8)
    nextSeq.set(prefix, Math.max(nextSeq.get(prefix) ?? 0, Number(o.code.slice(8)) || 0))
  }
  const orders = previous.orders
    .filter((o) => o.customerId && ids.has(o.customerId))
    .map((o) => {
      if (!usedCodes.has(o.code)) return o
      const prefix = o.code.slice(0, 8)
      const seq = (nextSeq.get(prefix) ?? 0) + 1
      nextSeq.set(prefix, seq)
      return { ...o, code: `${prefix}${String(seq).padStart(4, "0")}` }
    })

  const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt)
  return {
    ...seeded,
    customers: [...mine, ...seeded.customers],
    customerPasswords: {
      ...seeded.customerPasswords,
      ...Object.fromEntries(Object.entries(previous.customerPasswords).filter(([id]) => ids.has(id))),
    },
    orders: [...orders, ...seeded.orders].sort(byNewest),
    promotions: [...previous.promotions.filter((p) => p.ownerId && ids.has(p.ownerId)), ...seeded.promotions],
    starLedger: [...previous.starLedger.filter((e) => ids.has(e.customerId)), ...seeded.starLedger].sort((a, b) =>
      b.at.localeCompare(a.at),
    ),
  }
}

/**
 * Hands the order to a rider. Delivery is done in-house, so the rider is one of the store's own
 * staff — no platform, no per-trip fee, their cost is already in the payroll.
 */
function bookDelivery(delivery: Omit<DeliveryInfo, "eta">, now: Date, staff: Employee[]): DeliveryInfo {
  const rider = staff.length ? staff[Math.floor(Math.random() * staff.length)] : undefined
  return {
    ...delivery,
    eta: new Date(now.getTime() + deliveryMinutes(delivery.distanceKm) * 60_000).toISOString(),
    shipperId: delivery.shipperId ?? rider?.id,
    shipperName: delivery.shipperName ?? rider?.fullName,
    shipperPhone: delivery.shipperPhone ?? rider?.phone,
  }
}

/**
 * Seeds demo data when the store is empty, out of date, from another day — or left broken by a
 * half-finished migration (no stock rows). Runs after every rehydrate, including the ones another
 * tab triggers, so one stale tab cannot leave the others with empty tables.
 */
function seedIfNeeded(): void {
  const state = useDb.getState()
  const today = toDateKey(new Date())
  const broken = state.stock.length === 0
  const stale =
    !state.meta ||
    broken ||
    state.meta.version !== SEED_VERSION ||
    (!state.meta.dirty && toDateKey(state.meta.seededAt) !== today)
  if (!stale) return
  const seeded = keepOwnAccounts(createSeed(new Date()), state)
  useDb.setState({ ...seeded, meta: { version: SEED_VERSION, seededAt: nowIso(), dirty: false } })
}

let initPromise: Promise<void> | null = null

/** Load the database from IndexedDB, seeding (or re-seeding) demo data when needed. Idempotent. */
export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await useDb.persist.rehydrate()
      } catch {
        // Storage unavailable (private mode…): fall through to a fresh in-memory seed.
      }
      seedIfNeeded()
      useDb.getState().reviewMemberships(new Date())
      useDb.setState({ ready: true })
    })()
  }
  return initPromise
}
