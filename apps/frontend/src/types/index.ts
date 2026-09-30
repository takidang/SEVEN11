/**
 * Domain model for the 7-Eleven store-management project.
 *
 * These types are the contract between the frontend and the (future) backend.
 * Money is always an integer number of VND. Dates are ISO-8601 strings.
 */

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Subcategory {
  id: string
  slug: string
  name: string
  categoryId: string
}

export interface Category {
  id: string
  slug: string
  name: string
  /** Source image URL (see `imageUrl()` in lib/images for resizing). */
  icon: string
  sortOrder: number
  isHot?: boolean
  /** Alcohol etc. — needs an age confirmation before adding to cart / selling. */
  ageRestricted?: boolean
  subcategories: Subcategory[]
}

export type ProductUnit =
  "cái" | "ly" | "lon" | "chai" | "hộp" | "gói" | "túi" | "lốc" | "thùng" | "vỉ" | "combo" | "phần"

export interface Product {
  id: string
  sku: string
  /** EAN-13 / UPC printed on the package — what the POS scanner reads. */
  barcode: string
  slug: string
  name: string
  categoryId: string
  subcategoryId: string
  brand: string
  unit: ProductUnit
  origin: string
  /** Source image URL (see `imageUrl()` in lib/images for resizing). */
  image: string
  /** Selling price. */
  price: number
  /** Original price when the product is discounted (shown struck through). */
  compareAtPrice?: number
  /** Purchase (cost) price — used for gross profit. */
  costPrice: number
  /** Fresh food: days before expiry after receiving. Undefined = long shelf life. */
  shelfLifeDays?: number
  isNew?: boolean
  ageRestricted?: boolean
  isActive: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Stores, staff, shifts
// ---------------------------------------------------------------------------

export type StoreStatus = "active" | "maintenance" | "closed"

export interface Store {
  id: string
  /** Short numeric code, e.g. "1006". */
  code: string
  /** Short display name, e.g. "81 Nguyễn Du". */
  name: string
  address: string
  ward: string
  province: string
  phone: string
  email: string
  openHours: string
  status: StoreStatus
  managerId?: string
  openedAt: string
  lat: number
  lng: number
}

export type Role = "admin" | "manager" | "cashier"

export type EmployeeStatus = "active" | "on-leave" | "inactive"

export interface Employee {
  id: string
  code: string
  fullName: string
  phone: string
  email: string
  role: Role
  /** null = works for the whole chain (admin). */
  storeId: string | null
  status: EmployeeStatus
  hiredAt: string
}

export type ShiftType = "morning" | "afternoon" | "night"

export type ShiftStatus = "scheduled" | "in-progress" | "completed" | "absent"

export interface Shift {
  id: string
  storeId: string
  employeeId: string
  /** yyyy-MM-dd */
  date: string
  type: ShiftType
  status: ShiftStatus
  checkInAt?: string
  checkOutAt?: string
  openingCash?: number
  closingCash?: number
  note?: string
}

// ---------------------------------------------------------------------------
// Customers & membership
// ---------------------------------------------------------------------------

/** Đồng → Bạc → Vàng → Kim cương (rules in lib/membership). */
export type MemberTier = "bronze" | "silver" | "gold" | "diamond"

export interface TierChange {
  at: string
  from: MemberTier
  to: MemberTier
  /** Why, in words shown to the member, e.g. "Tháng 08/2026 chi 320.000 ₫, cần 350.000 ₫". */
  reason: string
}

export type StarEntryKind = "earn" | "redeem" | "expire" | "refund"

/** One movement of a member's gold stars (newest first in the database). */
export interface StarEntry {
  id: string
  customerId: string
  at: string
  /** Positive when stars were earned, negative when redeemed, expired or taken back. */
  delta: number
  kind: StarEntryKind
  note: string
  /** Order code or voucher code it came from. */
  ref?: string
}

export interface Address {
  id: string
  label: string
  recipient: string
  phone: string
  line: string
  ward: string
  province: string
  isDefault: boolean
  /** Set when the shopper shared their location; used to pick the nearest store. */
  lat?: number
  lng?: number
}

export interface Customer {
  id: string
  fullName: string
  phone: string
  email?: string
  /** yyyy-MM-dd */
  birthday?: string
  tier: MemberTier
  /**
   * Net spend counted toward tiers (after discounts, alcohol excluded). Reaching a tier's
   * threshold upgrades at once; dropping a tier resets it to that tier's threshold.
   */
  tierSpend: number
  /** When the current tier started. */
  tierSince: string
  /** Month the member levelled up in ("yyyy-MM"): that month is not checked for keeping the tier. */
  graceMonth?: string
  /** Last month whose keep-the-tier check has run ("yyyy-MM"). */
  reviewedMonth: string
  /** Tier changes, newest first. */
  tierHistory: TierChange[]
  /** Gold stars ready to redeem. */
  stars: number
  /** Spend carried toward the next star (below STAR_SPEND). */
  starCarry: number
  totalSpent: number
  orderCount: number
  joinedAt: string
  addresses: Address[]
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export type PromotionType =
  | "percent" // giảm %
  | "fixed" // giảm số tiền
  | "flash-sale" // giá sốc theo khung giờ
  | "buy-x-get-y" // mua X tặng Y
  | "member-voucher" // voucher theo hạng thành viên

export type PromotionStatus = "scheduled" | "active" | "paused" | "ended"

export type SalesChannel = "online" | "in-store"

export interface Promotion {
  id: string
  /** Code customers type in. Flash sales have no code. */
  code?: string
  /** Personal voucher (e.g. redeemed with gold stars): only this customer can use it. */
  ownerId?: string
  name: string
  description: string
  type: PromotionType
  /** percent: 0-100; fixed / member-voucher: VND off. */
  value: number
  maxDiscount?: number
  minOrderValue?: number
  buyQuantity?: number
  getQuantity?: number
  /** Empty = every product. */
  productIds: string[]
  categoryIds: string[]
  /** Empty = every member tier (and guests). */
  tiers: MemberTier[]
  channels: SalesChannel[]
  /** Flash sale daily window, "HH:mm". */
  dailyStart?: string
  dailyEnd?: string
  startsAt: string
  endsAt: string
  status: PromotionStatus
  usageLimit?: number
  usageCount: number
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "pending" // chờ xác nhận (online)
  | "confirmed" // đã xác nhận
  | "preparing" // đang chuẩn bị
  | "delivering" // đang giao
  | "completed" // hoàn thành
  | "cancelled" // đã huỷ

export type PaymentMethod = "cash" | "card" | "ewallet" | "bank-transfer" | "cod"

export type PaymentStatus = "unpaid" | "paid" | "refunded"

export interface OrderItem {
  productId: string
  name: string
  /** Snapshot of the product image; seed orders omit it (look up the product). */
  image?: string
  unitPrice: number
  quantity: number
  /** Discount applied to this line (VND, whole line). */
  discount: number
  lineTotal: number
}

export interface DeliveryInfo {
  recipient: string
  phone: string
  address: string
  note?: string
  /** Promised delivery time. */
  eta: string
  /** Straight-line distance store → shopper, km. */
  distanceKm?: number
  /** Store employee riding the order out. */
  shipperId?: string
  shipperName?: string
  shipperPhone?: string
}

export interface OrderEvent {
  status: OrderStatus
  at: string
  by?: string
  note?: string
}

export interface Order {
  id: string
  /** Human code, e.g. "DH2609160001". */
  code: string
  channel: SalesChannel
  storeId: string
  customerId?: string
  /** Cashier who rang it up (in-store) or confirmed it (online). */
  employeeId?: string
  items: OrderItem[]
  subtotal: number
  discount: number
  shippingFee: number
  total: number
  promotionCode?: string
  /** Member orders: net spend this order added toward tiers and stars. */
  memberSpend?: number
  /** Member orders: gold stars this order earned. */
  starsEarned?: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: OrderStatus
  cashReceived?: number
  changeGiven?: number
  delivery?: DeliveryInfo
  timeline: OrderEvent[]
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Inventory & purchasing
// ---------------------------------------------------------------------------

export interface StockLevel {
  storeId: string
  productId: string
  quantity: number
  /** Re-order point: at or below this the product is "sắp hết". */
  minQuantity: number
}

/** A received lot of a product with an expiry date (fresh food, dairy…). */
export interface InventoryBatch {
  id: string
  storeId: string
  productId: string
  lotCode: string
  quantity: number
  receivedAt: string
  expiresAt: string
}

export type SupplierStatus = "active" | "inactive"

export interface Supplier {
  id: string
  code: string
  name: string
  contactName: string
  phone: string
  email: string
  address: string
  taxCode: string
  categoryIds: string[]
  status: SupplierStatus
}

export type PurchaseOrderStatus = "draft" | "ordered" | "received" | "cancelled"

export interface PurchaseOrderItem {
  productId: string
  quantity: number
  costPrice: number
  lotCode?: string
  expiresAt?: string
}

/** Phiếu nhập hàng. */
export interface PurchaseOrder {
  id: string
  code: string
  supplierId: string
  storeId: string
  items: PurchaseOrderItem[]
  total: number
  status: PurchaseOrderStatus
  note?: string
  createdBy: string
  createdAt: string
  expectedAt?: string
  receivedAt?: string
}
