import { categories as seedCategories, products as seedProducts } from "@/data/catalog"
import { DEMO_PASSWORD, employees as seedEmployees } from "@/data/staff"
import { stores as seedStores } from "@/data/stores"
import { suppliers as seedSuppliers } from "@/data/suppliers"
import type {
  Address,
  Category,
  Customer,
  Employee,
  InventoryBatch,
  MemberTier,
  Order,
  OrderEvent,
  OrderStatus,
  PaymentMethod,
  Product,
  Promotion,
  PurchaseOrder,
  Shift,
  ShiftType,
  StarEntry,
  StockLevel,
  Store,
  Supplier,
} from "@/types"

import { deliveryMinutes } from "./delivery"
import { toDateKey } from "./format"
import {
  addTierSpend,
  checkKeepTier,
  memberSpendByMonth,
  monthKey,
  monthStart,
  shiftMonth,
  TIER_ORDER,
  TIERS,
  tierForSpend,
} from "./membership"
import { SHIFT_TYPE } from "./order-status"
import { hashPassword } from "./password"
import { type CartLine, priceCart } from "./pricing"
import { createRandom, type Random } from "./random"
import { earnStars, REWARD_VOUCHER_DAYS, STAR_REWARDS } from "./stars"

/**
 * Everything the mock backend holds. Generated deterministically relative to
 * "now" so the dashboard always has a believable today / last 7 / last 30 days.
 */
export interface Database {
  categories: Category[]
  products: Product[]
  stores: Store[]
  employees: Employee[]
  customers: Customer[]
  suppliers: Supplier[]
  promotions: Promotion[]
  orders: Order[]
  stock: StockLevel[]
  batches: InventoryBatch[]
  purchaseOrders: PurchaseOrder[]
  shifts: Shift[]
  /** Gold star movements, newest first. */
  starLedger: StarEntry[]
  /**
   * customerId → password hash (see `lib/password`). Kept apart from `Customer` because the
   * backend never returns credentials. Members registered at the counter have no entry
   * until they set a password through "Quên mật khẩu".
   */
  customerPasswords: Record<string, string>
}

export const SEED_VERSION = 15
const DAYS_OF_HISTORY = 35
const DAY = 86_400_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * DAY)
}

function iso(d: Date) {
  return d.toISOString()
}

/** "DH" + yyMMdd + 4-digit sequence. */
export function orderCode(date: Date, seq: number) {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `DH${yy}${mm}${dd}${String(seq).padStart(4, "0")}`
}

/** Day 0 of the two-week shift rota: Monday of last week. */
function rotaStart(now: Date) {
  const today = startOfDay(now)
  const monday = addDays(today, -((today.getDay() + 6) % 7))
  return addDays(monday, -7)
}

/** Which shift a moment belongs to. 00:00–05:59 is the previous day's night shift. */
function shiftAt(at: Date): { date: Date; typeIndex: number } {
  const h = at.getHours()
  if (h < 6) return { date: startOfDay(new Date(at.getTime() - DAY)), typeIndex: 2 }
  if (h < 14) return { date: startOfDay(at), typeIndex: 0 }
  if (h < 22) return { date: startOfDay(at), typeIndex: 1 }
  return { date: startOfDay(at), typeIndex: 2 }
}

/**
 * Deterministic rota shared by orders and shifts, so the cashier on an order is the
 * one on duty and shift cash-ups add up.
 */
function onDuty(staff: Employee[], day0: Date, date: Date, typeIndex: number): Employee | undefined {
  if (!staff.length) return undefined
  const d = Math.round((startOfDay(date).getTime() - day0.getTime()) / DAY)
  return staff[(((d + typeIndex) % staff.length) + staff.length) % staff.length]
}

const LAST_NAMES = [
  "Nguyễn",
  "Trần",
  "Lê",
  "Phạm",
  "Hoàng",
  "Huỳnh",
  "Phan",
  "Vũ",
  "Võ",
  "Đặng",
  "Bùi",
  "Đỗ",
  "Hồ",
  "Ngô",
  "Dương",
  "Lý",
]
const MIDDLE_NAMES = ["Thị", "Văn", "Minh", "Ngọc", "Thanh", "Hoàng", "Gia", "Khánh", "Phương", "Quốc", "Bảo", "Thu"]
const FIRST_NAMES = [
  "An",
  "Bình",
  "Châu",
  "Dũng",
  "Giang",
  "Hà",
  "Hải",
  "Hạnh",
  "Hiếu",
  "Hòa",
  "Huy",
  "Khang",
  "Khoa",
  "Lan",
  "Linh",
  "Long",
  "Mai",
  "Nam",
  "Nga",
  "Nhi",
  "Phong",
  "Phúc",
  "Quang",
  "Quyên",
  "Sơn",
  "Tâm",
  "Thảo",
  "Thịnh",
  "Trang",
  "Trí",
  "Trinh",
  "Tú",
  "Uyên",
  "Việt",
  "Vy",
  "Xuân",
  "Yến",
]

const STREETS_HCM = [
  ["Số 18 Nguyễn Trãi", "Phường Bến Thành"],
  ["Số 102 Lê Lai", "Phường Bến Thành"],
  ["Số 7 Pasteur", "Phường Sài Gòn"],
  ["Số 55 Võ Thị Sáu", "Phường Xuân Hòa"],
  ["Số 230 Nguyễn Văn Linh", "Phường Tân Mỹ"],
  ["Số 14 Hoa Lan", "Phường Cầu Kiệu"],
  ["Số 9 Quốc Hương", "Phường An Khánh"],
  ["Số 41 Tô Hiến Thành", "Phường Diên Hồng"],
]
const STREETS_HN = [
  ["Số 12 Hàng Bài", "Phường Hoàn Kiếm"],
  ["Số 88 Kim Mã", "Phường Ngọc Hà"],
  ["Số 25 Tạ Quang Bửu", "Phường Bạch Mai"],
]

/** Hour-of-day demand curve for a convenience store (0-23). */
const HOUR_WEIGHTS: [number, number][] = [
  [0, 1.2],
  [1, 0.8],
  [2, 0.5],
  [3, 0.3],
  [4, 0.3],
  [5, 0.8],
  [6, 2.4],
  [7, 4.2],
  [8, 3.6],
  [9, 2.2],
  [10, 2],
  [11, 3.4],
  [12, 3.8],
  [13, 2.4],
  [14, 2],
  [15, 2.4],
  [16, 2.8],
  [17, 3.6],
  [18, 4],
  [19, 3.8],
  [20, 3.2],
  [21, 2.8],
  [22, 2.2],
  [23, 1.6],
]

const CATEGORY_WEIGHTS: Record<string, number> = {
  "tra-sua": 5,
  "mon-ngon": 6,
  "cac-loai-banh": 4,
  "do-uong-dong-chai": 6,
  "do-an-vat": 4,
  "san-pham-tu-sua": 3,
  "do-dong-lanh": 2,
  "do-uong-co-con": 2,
  "do-kho-ngu-coc": 2,
  "rau-cu-trai-cay": 1,
  "thit-nguoi": 1,
  "cham-soc-ca-nhan": 1,
  "cham-soc-nha-cua": 1,
  "van-phong-pham": 0.6,
  "phu-kien-dien-tu": 0.5,
}

// ---------------------------------------------------------------------------
// Promotions (dates relative to now)
// ---------------------------------------------------------------------------

function pickIds(r: Random, products: Product[], filter: (p: Product) => boolean, n: number) {
  return r
    .shuffle(products.filter(filter))
    .slice(0, n)
    .map((p) => p.id)
}

function createPromotions(r: Random, products: Product[], now: Date): Promotion[] {
  const today = startOfDay(now)
  const sub = (p: Product, ...keys: string[]) => keys.some((k) => p.subcategoryId.includes(k))
  return [
    {
      id: "pr-fs-sang",
      name: "Buổi sáng năng động",
      description: "Giảm 15% bánh mì, sandwich, sữa chua và cà phê từ 6h đến 10h mỗi ngày.",
      type: "flash-sale",
      value: 15,
      productIds: pickIds(
        r,
        products,
        (p) => sub(p, "banh-mi-que", "sandwich", "burrito", "sua-chua", "ca-phe-viet-nam"),
        12,
      ),
      categoryIds: [],
      tiers: [],
      channels: ["online", "in-store"],
      dailyStart: "06:00",
      dailyEnd: "10:00",
      startsAt: iso(addDays(today, -21)),
      endsAt: iso(addDays(today, 24)),
      status: "active",
      usageCount: 0,
    },
    {
      id: "pr-fs-xe",
      name: "Ăn xế",
      description: "Giảm 20% snack, trà sữa và kem từ 14h đến 17h mỗi ngày.",
      type: "flash-sale",
      value: 20,
      productIds: pickIds(r, products, (p) => sub(p, "snacks", "tra-sua-7-eleven", "tra-trai-cay", "kem"), 12),
      categoryIds: [],
      tiers: [],
      channels: ["online", "in-store"],
      dailyStart: "14:00",
      dailyEnd: "17:00",
      startsAt: iso(addDays(today, -21)),
      endsAt: iso(addDays(today, 24)),
      status: "active",
      usageCount: 0,
    },
    {
      id: "pr-fs-toi",
      name: "Ăn tối",
      description: "Giảm 10% món ăn no, cơm nắm và món hấp từ 17h đến 21h mỗi ngày.",
      type: "flash-sale",
      value: 10,
      productIds: pickIds(r, products, (p) => sub(p, "mon-an-no", "com-nam", "mon-hap", "combo-tiet-kiem"), 12),
      categoryIds: [],
      tiers: [],
      channels: ["online", "in-store"],
      dailyStart: "17:00",
      dailyEnd: "21:00",
      startsAt: iso(addDays(today, -21)),
      endsAt: iso(addDays(today, 24)),
      status: "active",
      usageCount: 0,
    },
    {
      id: "pr-member-drink",
      name: "Ưu đãi đồ uống thành viên",
      description:
        "Giảm 2.000 ₫ / 3.000 ₫ / 6.000 ₫ / 9.000 ₫ mỗi ly (tối đa 3 ly/đơn) theo hạng Đồng / Bạc / Vàng / Kim cương.",
      type: "member-voucher",
      value: 0,
      productIds: [],
      categoryIds: ["tra-sua"],
      tiers: ["bronze", "silver", "gold", "diamond"],
      channels: ["online", "in-store"],
      startsAt: iso(new Date(now.getFullYear(), 0, 1)),
      endsAt: iso(new Date(now.getFullYear(), 11, 31, 23, 59)),
      status: "active",
      usageCount: 0,
    },
    {
      id: "pr-chaoban",
      code: "CHAOBAN",
      name: "Chào bạn mới",
      description: "Giảm 20.000 ₫ cho đơn online từ 150.000 ₫.",
      type: "fixed",
      value: 20_000,
      // 20.000 ₫ + phí giao 15.000 ₫ chỉ có lãi từ đơn khoảng 130.000 ₫ trở lên.
      minOrderValue: 150_000,
      productIds: [],
      categoryIds: [],
      tiers: [],
      channels: ["online"],
      startsAt: iso(addDays(today, -60)),
      endsAt: iso(addDays(today, 45)),
      status: "active",
      usageLimit: 5_000,
      usageCount: 0,
    },
    {
      id: "pr-giam10",
      code: "GIAM10",
      name: "Thành viên Vàng & Kim cương giảm 10%",
      description: "Giảm 10% tối đa 30.000 ₫ cho đơn từ 150.000 ₫, dành cho hạng Vàng và Kim cương.",
      type: "percent",
      value: 10,
      maxDiscount: 30_000,
      minOrderValue: 150_000,
      productIds: [],
      categoryIds: [],
      tiers: ["gold", "diamond"],
      channels: ["online", "in-store"],
      startsAt: iso(addDays(today, -30)),
      endsAt: iso(addDays(today, 30)),
      status: "active",
      usageCount: 0,
    },
    {
      id: "pr-snack-21",
      name: "Snack mua 3 tặng 1",
      // Mua 2 tặng 1 là giảm 33%, vượt biên lợi nhuận 27% của snack; mua 3 tặng 1 chỉ giảm 25%.
      description: "Mua 3 gói snack áp dụng, tặng thêm 1 gói cùng loại.",
      type: "buy-x-get-y",
      value: 0,
      buyQuantity: 3,
      getQuantity: 1,
      // Bánh quy chỉ lãi 24% nên không nằm trong khuyến mãi này; kẹo và hạt sấy lãi 28%.
      productIds: pickIds(r, products, (p) => sub(p, "snacks", "cac-loai-keo", "hat-trai-cay-say"), 6),
      categoryIds: [],
      tiers: [],
      channels: ["online", "in-store"],
      startsAt: iso(addDays(today, -10)),
      endsAt: iso(addDays(today, 20)),
      status: "active",
      usageCount: 0,
    },
    {
      id: "pr-trungthu",
      code: "TRUNGTHU",
      name: "Vui Trung thu",
      description: "Giảm 15% các loại bánh ngọt dịp Trung thu.",
      type: "percent",
      value: 15,
      maxDiscount: 50_000,
      productIds: [],
      categoryIds: ["cac-loai-banh"],
      tiers: [],
      channels: ["online", "in-store"],
      startsAt: iso(addDays(today, 4)),
      endsAt: iso(addDays(today, 14)),
      status: "scheduled",
      usageCount: 0,
    },
    {
      id: "pr-bia-51",
      name: "Bia lạnh mua 5 tặng 1",
      description: "Mua 5 lon bia áp dụng, tặng 1 lon. Do nhà cung cấp tài trợ — biên lợi nhuận bia chỉ 10%.",
      type: "buy-x-get-y",
      value: 0,
      buyQuantity: 5,
      getQuantity: 1,
      productIds: pickIds(r, products, (p) => p.subcategoryId === "do-uong-co-con--bia", 4),
      categoryIds: [],
      tiers: [],
      channels: ["in-store"],
      startsAt: iso(addDays(today, -15)),
      endsAt: iso(addDays(today, 15)),
      status: "paused",
      usageCount: 0,
    },
    {
      id: "pr-he",
      code: "HESOIDONG",
      name: "Hè sôi động",
      description: "Giảm 12% đồ uống đóng chai, tối đa 20.000 ₫.",
      type: "percent",
      value: 12,
      maxDiscount: 20_000,
      productIds: [],
      categoryIds: ["do-uong-dong-chai"],
      tiers: [],
      channels: ["online", "in-store"],
      startsAt: iso(addDays(today, -100)),
      endsAt: iso(addDays(today, -40)),
      status: "active",
      usageCount: 1_284,
    },
  ]
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/** Accumulated spend a member of this tier had before the seeded history starts. */
function openingTierSpend(r: Random, tier: MemberTier) {
  if (tier === "diamond") return TIERS.diamond.minSpend + r.int(0, 60) * 100_000
  if (tier === "gold") return TIERS.gold.minSpend + r.int(0, 30) * 100_000
  if (tier === "silver") return TIERS.silver.minSpend + r.int(0, 12) * 100_000
  return r.int(0, 8) * 100_000
}

function makeAddress(
  r: Random,
  id: string,
  recipient: string,
  phone: string,
  hanoi: boolean,
  label: string,
  isDefault: boolean,
): Address {
  const [line, ward] = r.pick(hanoi ? STREETS_HN : STREETS_HCM)
  return { id, label, recipient, phone, line, ward, province: hanoi ? "Hà Nội" : "TP Hồ Chí Minh", isDefault }
}

function createCustomers(r: Random, now: Date): Customer[] {
  const fixed: { name: string; phone: string; tier: MemberTier; birthday: string; email: string }[] = [
    {
      name: "Trần Thu Hà",
      phone: "0901234567",
      tier: "gold",
      birthday: `1998-${String(now.getMonth() + 1).padStart(2, "0")}-24`,
      email: "thuha@khachhang.demo",
    },
    {
      name: "Lê Minh Tuấn",
      phone: "0912345678",
      tier: "diamond",
      birthday: "1990-03-12",
      email: "minhtuan@khachhang.demo",
    },
    {
      name: "Phạm Khánh Linh",
      phone: "0987654321",
      tier: "silver",
      birthday: "2003-11-02",
      email: "khanhlinh@khachhang.demo",
    },
  ]
  const customers: Customer[] = []
  const historyStart = addDays(startOfDay(now), -DAYS_OF_HISTORY)
  for (let i = 0; i < 120; i++) {
    const f = fixed[i]
    const fullName = f?.name ?? `${r.pick(LAST_NAMES)} ${r.pick(MIDDLE_NAMES)} ${r.pick(FIRST_NAMES)}`
    const joinedRecently = i > 2 && r.chance(0.1)
    const tier: MemberTier = joinedRecently
      ? "bronze"
      : (f?.tier ??
        r.weighted([
          ["bronze", 4],
          ["silver", 4],
          ["gold", 2],
          ["diamond", 1],
        ] as const))
    const phone =
      f?.phone ??
      `0${r.pick(["90", "91", "93", "94", "96", "97", "98", "38", "39", "70", "77", "81", "83", "85"])}${String(r.int(1_000_000, 9_999_999))}`
    const tierSpend = joinedRecently ? 0 : openingTierSpend(r, tier)
    const hanoi = i > 2 && r.chance(0.25)
    const id = `cu-${String(i + 1).padStart(4, "0")}`
    const addresses: Address[] = [makeAddress(r, `${id}-a1`, fullName, phone, hanoi, "Nhà riêng", true)]
    if (r.chance(0.35) || f) addresses.push(makeAddress(r, `${id}-a2`, fullName, phone, hanoi, "Công ty", false))
    const joined = addDays(historyStart, joinedRecently ? r.int(8, 30) : -r.int(40, 900))
    // Opening state when the seeded history starts; createSeed replays the orders on top.
    const tierSince = joinedRecently ? joined : addDays(historyStart, -r.int(5, 35))
    customers.push({
      id,
      fullName,
      phone,
      email: f?.email,
      birthday:
        f?.birthday ??
        (r.chance(0.7)
          ? `${r.int(1975, 2006)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`
          : undefined),
      tier,
      tierSpend,
      tierSince: iso(tierSince < joined ? joined : tierSince),
      reviewedMonth: shiftMonth(monthKey(joinedRecently ? joined : historyStart), -1),
      tierHistory: [],
      stars: joinedRecently ? 0 : r.int(0, 20),
      starCarry: joinedRecently ? 0 : r.int(0, 44) * 1_000,
      totalSpent: tierSpend + r.int(0, 40) * 250_000,
      orderCount: r.int(3, 40),
      joinedAt: iso(joined),
      addresses,
    })
  }
  return customers
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function pickProducts(r: Random, byCategory: Map<string, Product[]>, hour: number): CartLine[] {
  const count = r.weighted([
    [1, 5],
    [2, 4],
    [3, 2],
    [4, 1],
  ] as const)
  const lines = new Map<string, number>()
  const weights = Object.entries(CATEGORY_WEIGHTS).map(([cat, w]) => {
    let weight = w
    if (cat === "do-uong-co-con") weight = hour >= 17 || hour < 2 ? 4 : 0.3
    if (cat === "cac-loai-banh" || cat === "san-pham-tu-sua") weight = hour >= 6 && hour <= 9 ? w * 2 : w
    if (cat === "mon-ngon") weight = (hour >= 11 && hour <= 13) || (hour >= 17 && hour <= 20) ? w * 1.8 : w
    return [cat, weight] as const
  })
  for (let i = 0; i < count; i++) {
    const cat = r.weighted(weights)
    const pool = byCategory.get(cat)
    if (!pool?.length) continue
    const product = r.pick(pool)
    lines.set(
      product.id,
      (lines.get(product.id) ?? 0) +
        r.weighted([
          [1, 8],
          [2, 3],
          [3, 1],
        ] as const),
    )
  }
  return [...lines].map(([productId, quantity]) => ({ productId, quantity }))
}

function roundCash(total: number, r: Random) {
  const steps = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000]
  const candidates = steps.map((s) => Math.ceil(total / s) * s)
  return r.chance(0.3) ? total : r.pick(candidates.filter((c) => c >= total))
}

function onlineProgress(ageMinutes: number, r: Random): OrderStatus {
  if (ageMinutes > 120) return r.chance(0.05) ? "cancelled" : "completed"
  if (ageMinutes < 6) return "pending"
  if (ageMinutes < 12) return "confirmed"
  if (ageMinutes < 22) return "preparing"
  if (ageMinutes < 45) return "delivering"
  return "completed"
}

function buildTimeline(status: OrderStatus, createdAt: Date, cashierName: string | undefined): OrderEvent[] {
  const steps: [OrderStatus, number][] = [
    ["pending", 0],
    ["confirmed", 4],
    ["preparing", 9],
    ["delivering", 18],
    ["completed", 38],
  ]
  if (status === "cancelled") {
    return [
      { status: "pending", at: iso(createdAt) },
      {
        status: "cancelled",
        at: iso(new Date(createdAt.getTime() + 7 * 60_000)),
        by: cashierName,
        note: "Khách yêu cầu huỷ",
      },
    ]
  }
  const events: OrderEvent[] = []
  for (const [s, minutes] of steps) {
    events.push({
      status: s,
      at: iso(new Date(createdAt.getTime() + minutes * 60_000)),
      by: s === "pending" ? undefined : cashierName,
    })
    if (s === status) break
  }
  return events
}

function createOrders(
  r: Random,
  now: Date,
  products: Product[],
  customers: Customer[],
  promotions: Promotion[],
  employees: Employee[],
  stores: Store[],
): Order[] {
  const active = products.filter((p) => p.isActive)
  const byCategory = new Map<string, Product[]>()
  for (const p of active) byCategory.set(p.categoryId, [...(byCategory.get(p.categoryId) ?? []), p])
  const productMap = new Map(products.map((p) => [p.id, p] as const))
  const cashiersByStore = new Map<string, Employee[]>()
  for (const e of employees) {
    if (e.role !== "cashier" || !e.storeId || e.status !== "active") continue
    cashiersByStore.set(e.storeId, [...(cashiersByStore.get(e.storeId) ?? []), e])
  }
  const day0 = rotaStart(now)
  const cashierAt = (storeId: string, at: Date) => {
    const { date, typeIndex } = shiftAt(at)
    return onDuty(cashiersByStore.get(storeId) ?? [], day0, date, typeIndex)
  }
  const hanoiCustomers = customers.filter((c) => c.addresses[0]?.province === "Hà Nội")
  const hcmCustomers = customers.filter((c) => c.addresses[0]?.province !== "Hà Nội")
  // How often each member shops: a few regulars place most member orders, many shop now and
  // then, and some stopped this month (they show up as at risk of dropping a tier).
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const activity = new Map(
    customers.map((c, i) => [
      c.id,
      {
        // Demo accounts (Vàng, Kim cương, Bạc) shop at a pace that fits their documented tier.
        weight:
          i < 3
            ? [4, 5, 1.5][i]
            : r.weighted([
                [10, 1],
                [4, 3],
                [1.2, 4],
                [0.3, 3],
              ] as const),
        lapsed: i >= 3 && r.chance(0.12),
      },
    ]),
  )
  const pickMember = (pool: Customer[], at: Date) =>
    r.weighted(
      pool.map((c) => {
        const a = activity.get(c.id)!
        return [c, a.lapsed && at >= thisMonth ? 0 : a.weight] as const
      }),
    )
  const orders: Order[] = []
  const today = startOfDay(now)

  for (let dayOffset = DAYS_OF_HISTORY - 1; dayOffset >= 0; dayOffset--) {
    const day = addDays(today, -dayOffset)
    const weekend = day.getDay() === 0 || day.getDay() === 6
    const dayOrders: Omit<Order, "code">[] = []

    for (const store of stores) {
      // The store under maintenance stopped trading 5 days ago.
      if (store.status === "maintenance" && dayOffset < 5) continue
      if (store.status === "closed") continue
      const opened = new Date(store.openedAt)
      if (opened > day) continue
      const busy = store.province === "TP Hồ Chí Minh" ? 1 : 0.8
      // A real convenience store serves a few hundred customers a day. These numbers land at
      // roughly 12 triệu ₫ per store per day, enough to cover the payroll and rent in the budget.
      const inStore = Math.round(r.int(62, 88) * busy * (weekend ? 1.25 : 1))
      const online = Math.round(r.int(14, 22) * busy * (weekend ? 1.2 : 1))
      const localCustomers = store.province === "Hà Nội" ? hanoiCustomers : hcmCustomers

      for (let k = 0; k < inStore + online; k++) {
        const channel = k < inStore ? "in-store" : "online"
        const hour = r.weighted(HOUR_WEIGHTS)
        const createdAt = new Date(day)
        createdAt.setHours(hour, r.int(0, 59), r.int(0, 59), 0)
        if (createdAt > now) continue
        if (store.openHours !== "24/7" && (hour < 6 || hour >= 24)) continue

        const lines = pickProducts(r, byCategory, hour)
        if (!lines.length) continue
        const member = channel === "online" || r.chance(0.35) ? pickMember(localCustomers, createdAt) : undefined
        const code = r.chance(0.08) ? r.pick(["CHAOBAN", "GIAM10"]) : undefined
        const pricing = priceCart({
          lines,
          products: productMap,
          promotions,
          channel,
          customer: member,
          code,
          delivery: channel === "online",
          now: createdAt,
        })
        if (!pricing.lines.length) continue
        const cashier = cashierAt(store.id, createdAt)
        const ageMinutes = (now.getTime() - createdAt.getTime()) / 60_000

        let paymentMethod: PaymentMethod
        let status: OrderStatus
        if (channel === "in-store") {
          paymentMethod = r.weighted([
            ["cash", 45],
            ["ewallet", 30],
            ["card", 15],
            ["bank-transfer", 10],
          ] as const)
          status = "completed"
        } else {
          paymentMethod = r.weighted([
            ["cod", 40],
            ["ewallet", 40],
            ["card", 20],
          ] as const)
          status = onlineProgress(ageMinutes, r)
        }
        const paid = channel === "in-store" || paymentMethod !== "cod" || status === "completed"
        const cashReceived = paymentMethod === "cash" ? roundCash(pricing.total, r) : undefined
        const address = member?.addresses.find((a) => a.isDefault) ?? member?.addresses[0]
        const timeline =
          channel === "in-store"
            ? [{ status: "completed" as const, at: iso(createdAt), by: cashier?.fullName }]
            : buildTimeline(status, createdAt, cashier?.fullName)

        dayOrders.push({
          id: `od-${orders.length + dayOrders.length + 1}`,
          channel,
          storeId: store.id,
          customerId: member?.id,
          employeeId: cashier?.id,
          items: pricing.lines.map((l) => ({
            productId: l.productId,
            name: l.product.name,
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
          memberSpend: member ? pricing.eligibleSpend : undefined,
          paymentMethod,
          paymentStatus:
            status === "cancelled" ? (paymentMethod === "cod" ? "unpaid" : "refunded") : paid ? "paid" : "unpaid",
          status,
          cashReceived,
          changeGiven: cashReceived !== undefined ? cashReceived - pricing.total : undefined,
          delivery:
            channel === "online" && member && address
              ? (() => {
                  // The store delivers with its own staff, so the rider is one of them.
                  const tripKm = Math.round((1 + r.next() * 3.5) * 10) / 10
                  const riders = employees.filter((e) => e.storeId === store.id && e.status === "active")
                  const rider = riders.length ? r.pick(riders) : undefined
                  return {
                    recipient: address.recipient,
                    phone: address.phone,
                    address: `${address.line}, ${address.ward}, ${address.province}`,
                    eta: iso(new Date(createdAt.getTime() + deliveryMinutes(tripKm) * 60_000)),
                    note: r.chance(0.2)
                      ? r.pick(["Gọi trước khi giao", "Để ở quầy lễ tân", "Không lấy ống hút", "Giao cổng sau"])
                      : undefined,
                    distanceKm: tripKm,
                    shipperId: rider?.id,
                    shipperName: rider?.fullName,
                    shipperPhone: rider?.phone,
                  }
                })()
              : undefined,
          timeline,
          createdAt: iso(createdAt),
          updatedAt: timeline[timeline.length - 1].at,
        })
      }
    }

    if (dayOffset === 0) dayOrders.push(...liveOnlineOrders())
    dayOrders.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    dayOrders.forEach((o, i) =>
      orders.push({ ...o, id: `od-${toDateKey(day).replaceAll("-", "")}-${i + 1}`, code: orderCode(day, i + 1) }),
    )
  }
  // Stored newest first, like the real API would return them.
  return orders.reverse()

  /** A handful of online orders placed minutes ago, so the order board always has work in progress. */
  function liveOnlineOrders(): Omit<Order, "code">[] {
    const result: Omit<Order, "code">[] = []
    const agesAndStatus: [number, OrderStatus][] = [
      [2, "pending"],
      [5, "pending"],
      [9, "confirmed"],
      [16, "preparing"],
      [21, "preparing"],
      [33, "delivering"],
    ]
    const liveStores = stores.filter((s) => s.status === "active" && s.province === "TP Hồ Chí Minh")
    agesAndStatus.forEach(([minutes, status], i) => {
      const store = liveStores[i % liveStores.length]
      const createdAt = new Date(now.getTime() - minutes * 60_000)
      if (createdAt < today) return // just after midnight: don't give yesterday's order today's code
      const member = pickMember(hcmCustomers, createdAt)
      const lines = pickProducts(r, byCategory, createdAt.getHours())
      const pricing = priceCart({
        lines,
        products: productMap,
        promotions,
        channel: "online",
        customer: member,
        delivery: true,
        now: createdAt,
      })
      if (!pricing.lines.length) return
      const cashier = cashierAt(store.id, createdAt)
      const paymentMethod: PaymentMethod = r.pick(["cod", "ewallet", "card"] as const)
      const address = member.addresses.find((a) => a.isDefault) ?? member.addresses[0]
      const timeline = buildTimeline(status, createdAt, cashier?.fullName)
      result.push({
        id: `live-${i}`,
        channel: "online",
        storeId: store.id,
        customerId: member.id,
        employeeId: status === "pending" ? undefined : cashier?.id,
        items: pricing.lines.map((l) => ({
          productId: l.productId,
          name: l.product.name,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          discount: l.lineDiscount,
          lineTotal: l.lineTotal,
        })),
        subtotal: pricing.subtotal,
        discount: pricing.discountTotal,
        shippingFee: pricing.shippingFee,
        total: pricing.total,
        memberSpend: pricing.eligibleSpend,
        paymentMethod,
        paymentStatus: paymentMethod === "cod" ? "unpaid" : "paid",
        status,
        delivery: {
          recipient: address.recipient,
          phone: address.phone,
          address: `${address.line}, ${address.ward}, ${address.province}`,
          eta: iso(new Date(createdAt.getTime() + 24 * 60_000)),
        },
        timeline,
        createdAt: iso(createdAt),
        updatedAt: timeline[timeline.length - 1].at,
      })
    })
    return result
  }
}

// ---------------------------------------------------------------------------
// Inventory, purchasing, shifts
// ---------------------------------------------------------------------------

function createStock(r: Random, products: Product[], stores: Store[]): StockLevel[] {
  const stock: StockLevel[] = []
  for (const store of stores) {
    for (const p of products) {
      const fresh = (p.shelfLifeDays ?? 99) <= 3
      const minQuantity = fresh ? 4 : r.pick([6, 8, 10, 12])
      // Shelves hold about three weeks of sales — a convenience store turns its stock over fast.
      let quantity = fresh ? r.int(4, 12) : r.int(8, 26)
      const roll = r.next()
      if (roll < 0.02) quantity = 0
      else if (roll < 0.07) quantity = r.int(1, minQuantity)
      stock.push({ storeId: store.id, productId: p.id, quantity, minQuantity })
    }
  }
  return stock
}

function createBatches(
  r: Random,
  products: Product[],
  stores: Store[],
  stock: StockLevel[],
  now: Date,
): InventoryBatch[] {
  const batches: InventoryBatch[] = []
  const qty = new Map(stock.map((s) => [`${s.storeId}:${s.productId}`, s.quantity] as const))
  for (const store of stores) {
    for (const p of products) {
      if (!p.shelfLifeDays || p.categoryId === "tra-sua") continue
      const total = qty.get(`${store.id}:${p.id}`) ?? 0
      if (total <= 0) continue
      const split = total > 6 && r.chance(0.35) ? [Math.ceil(total / 2), Math.floor(total / 2)] : [total]
      split.forEach((quantity, i) => {
        // Oldest lot: ~25% expire today, ~3% are already past expiry, the rest later.
        const shelf = p.shelfLifeDays!
        const ageDays =
          i === 0 ? (r.chance(0.03) ? shelf + 1 : r.chance(0.25) ? shelf : r.int(0, Math.max(0, shelf - 1))) : 0
        const receivedAt = addDays(startOfDay(now), -ageDays)
        receivedAt.setHours(5, 30, 0, 0)
        const expiresAt = addDays(receivedAt, p.shelfLifeDays!)
        expiresAt.setHours(23, 59, 0, 0)
        batches.push({
          id: `bt-${store.code}-${p.id}-${i + 1}`,
          storeId: store.id,
          productId: p.id,
          lotCode: `L${toDateKey(receivedAt).slice(2).replaceAll("-", "")}${String.fromCharCode(65 + i)}`,
          quantity,
          receivedAt: iso(receivedAt),
          expiresAt: iso(expiresAt),
        })
      })
    }
  }
  return batches
}

function createPurchaseOrders(
  r: Random,
  now: Date,
  products: Product[],
  suppliers: Supplier[],
  stores: Store[],
  employees: Employee[],
): PurchaseOrder[] {
  const orders: PurchaseOrder[] = []
  const activeSuppliers = suppliers.filter((s) => s.status === "active")
  for (let i = 0; i < 46; i++) {
    const supplier = r.pick(activeSuppliers)
    const store = r.pick(stores.filter((s) => s.status !== "closed"))
    const manager = employees.find((e) => e.id === store.managerId)
    const pool = products.filter((p) => supplier.categoryIds.includes(p.categoryId))
    const items = r
      .shuffle(pool)
      .slice(0, r.int(4, 9))
      .map((p) => ({
        productId: p.id,
        quantity: r.pick([12, 24, 24, 36, 48]),
        costPrice: p.costPrice,
        lotCode: p.shelfLifeDays ? `L${r.int(100, 999)}` : undefined,
      }))
    const createdAt = new Date(now.getTime() - r.int(0, DAYS_OF_HISTORY * 24) * 3_600_000)
    const ageHours = (now.getTime() - createdAt.getTime()) / 3_600_000
    let status: PurchaseOrder["status"] =
      ageHours > 72 ? "received" : ageHours > 30 ? (r.chance(0.5) ? "received" : "ordered") : "ordered"
    if (i === 3 || i === 17) status = "draft"
    if (i === 9) status = "cancelled"
    orders.push({
      id: `po-${String(i + 1).padStart(3, "0")}`,
      code: "",
      supplierId: supplier.id,
      storeId: store.id,
      items,
      total: items.reduce((s, it) => s + it.quantity * it.costPrice, 0),
      status,
      note: r.chance(0.2)
        ? r.pick(["Giao trước 6h sáng", "Kiểm tra hạn sử dụng khi nhận", "Bổ sung hàng cuối tuần"])
        : undefined,
      createdBy: manager?.id ?? "em-admin",
      createdAt: iso(createdAt),
      expectedAt: iso(new Date(createdAt.getTime() + 24 * 3_600_000)),
      receivedAt: status === "received" ? iso(new Date(createdAt.getTime() + r.int(14, 30) * 3_600_000)) : undefined,
    })
  }
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  // Keep a few recent orders waiting for delivery so the "chờ nhận hàng" flow always has work.
  for (const o of orders.slice(-4)) {
    if (o.status === "received") {
      o.status = "ordered"
      o.receivedAt = undefined
    }
  }
  return orders.map((o, i) => ({ ...o, code: `PN${String(i + 1).padStart(5, "0")}` })).reverse()
}

function createShifts(r: Random, now: Date, stores: Store[], employees: Employee[], orders: Order[]): Shift[] {
  const shifts: Shift[] = []
  const today = startOfDay(now)
  const start = rotaStart(now)
  const types: ShiftType[] = ["morning", "afternoon", "night"]

  for (const store of stores) {
    if (store.status === "closed") continue
    const staff = employees.filter((e) => e.storeId === store.id && e.role === "cashier" && e.status === "active")
    const cashByHour = new Map<string, number>()
    for (const o of orders) {
      if (o.storeId !== store.id || o.channel !== "in-store" || o.paymentMethod !== "cash") continue
      const k = o.createdAt.slice(0, 13)
      cashByHour.set(k, (cashByHour.get(k) ?? 0) + o.total)
    }
    for (let d = 0; d < 14; d++) {
      const date = addDays(start, d)
      types.forEach((type, t) => {
        if (store.openHours !== "24/7" && type === "night") return
        const worker = onDuty(staff, start, date, t)
        if (!worker) return
        const { start: h0, end: h1 } = SHIFT_TYPE[type]
        const from = new Date(date)
        from.setHours(h0, 0, 0, 0)
        const to = new Date(date)
        to.setHours(h1, 0, 0, 0)
        let status: Shift["status"] = "scheduled"
        if (store.status === "maintenance" && from > addDays(today, -5)) return
        if (to <= now) status = r.chance(0.03) ? "absent" : "completed"
        else if (from <= now) status = "in-progress"
        const openingCash = 2_000_000
        let cash = 0
        for (let h = h0; h < h1; h++) {
          const at = new Date(from)
          at.setHours(h, 0, 0, 0)
          cash += cashByHour.get(at.toISOString().slice(0, 13)) ?? 0
        }
        shifts.push({
          id: `sh-${store.code}-${toDateKey(date)}-${type}`,
          storeId: store.id,
          employeeId: worker.id,
          date: toDateKey(date),
          type,
          status,
          checkInAt:
            status === "completed" || status === "in-progress"
              ? iso(new Date(from.getTime() + r.int(-8, 6) * 60_000))
              : undefined,
          checkOutAt: status === "completed" ? iso(new Date(to.getTime() + r.int(0, 12) * 60_000)) : undefined,
          openingCash: status === "completed" || status === "in-progress" ? openingCash : undefined,
          closingCash:
            status === "completed" ? openingCash + cash + (r.chance(0.1) ? -r.int(1, 5) * 10_000 : 0) : undefined,
        })
      })
    }
  }
  return shifts
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Membership (tiers, gold stars)
// ---------------------------------------------------------------------------

/** Demo accounts documented in docs/tai-khoan-demo.md: accumulated spend to end the history on. */
const DEMO_MEMBERS: Record<string, { tier: MemberTier; tierSpend: number; redeem?: string }> = {
  "0901234567": { tier: "gold", tierSpend: 4_600_000, redeem: "sao-20" },
  "0912345678": { tier: "diamond", tierSpend: 7_200_000, redeem: "sao-50" },
  "0987654321": { tier: "silver", tierSpend: 1_900_000 },
}

/**
 * Replays the seeded member orders on each member's opening state, the way the live app
 * does it: spend → upgrades and gold stars, and on the 1st of each month the keep-the-tier
 * check for the month before. Demo accounts end on their documented tier.
 */
function replayMembership(r: Random, opening: Customer[], orders: Order[], now: Date) {
  const historyStart = addDays(startOfDay(now), -DAYS_OF_HISTORY)
  const ledger: StarEntry[] = []
  const vouchers: Promotion[] = []
  const members = new Map<string, Customer>(opening.map((c) => [c.id, { ...c }]))
  const counted = orders
    .filter((o) => o.customerId && o.memberSpend !== undefined && o.status !== "cancelled")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // Demo accounts: start low enough that the history lands them on their documented tier.
  for (const c of members.values()) {
    const demo = DEMO_MEMBERS[c.phone]
    if (!demo) continue
    const spend = counted.filter((o) => o.customerId === c.id).reduce((sum, o) => sum + (o.memberSpend ?? 0), 0)
    c.tierSpend = Math.max(0, demo.tierSpend - spend)
    c.tier = tierForSpend(c.tierSpend)
  }

  for (const c of members.values()) {
    if (c.stars > 0) {
      ledger.push({
        id: `st-open-${c.id}`,
        customerId: c.id,
        at: iso(historyStart),
        delta: c.stars,
        kind: "earn",
        note: "Sao tích luỹ trước đó",
      })
    }
  }

  const spendByMonth = memberSpendByMonth(orders)
  const review = (c: Customer, before: string): Customer => {
    let next = c
    for (let month = shiftMonth(c.reviewedMonth, 1); month < before; month = shiftMonth(month, 1)) {
      const drop = checkKeepTier(next, month, spendByMonth.get(c.id)?.get(month) ?? 0, monthStart(shiftMonth(month, 1)))
      next = { ...next, ...drop, reviewedMonth: month }
    }
    return next
  }

  for (const o of counted) {
    const at = new Date(o.createdAt)
    const before = members.get(o.customerId!)
    if (!before) continue
    const c = review(before, monthKey(at))
    const earned = earnStars(c.starCarry, o.memberSpend!)
    o.starsEarned = earned.stars
    members.set(c.id, {
      ...c,
      ...addTierSpend(c, o.memberSpend!, at),
      stars: c.stars + earned.stars,
      starCarry: earned.carry,
    })
    if (earned.stars) {
      ledger.push({
        id: `st-${o.id}`,
        customerId: c.id,
        at: o.createdAt,
        delta: earned.stars,
        kind: "earn",
        note: `Đơn ${o.code}`,
        ref: o.code,
      })
    }
  }

  const customers = opening.map((o) => {
    let c = review(members.get(o.id)!, monthKey(now))
    const demo = DEMO_MEMBERS[c.phone]
    if (demo && c.tier !== demo.tier) {
      // Safety net if the random history overshoots: land on the documented tier consistently.
      const rank = TIER_ORDER.indexOf(demo.tier)
      const ceiling = TIER_ORDER[rank + 1] ? TIERS[TIER_ORDER[rank + 1]].minSpend - 1 : Infinity
      const tierHistory = c.tierHistory.filter((h) => TIER_ORDER.indexOf(h.to) <= rank)
      c = {
        ...c,
        tier: demo.tier,
        tierSpend: Math.min(Math.max(c.tierSpend, TIERS[demo.tier].minSpend), ceiling),
        tierHistory,
        tierSince: tierHistory[0]?.at ?? c.tierSince,
        graceMonth: tierHistory[0] ? monthKey(new Date(tierHistory[0].at)) : undefined,
      }
    }
    const reward = demo?.redeem ? STAR_REWARDS.find((w) => w.id === demo.redeem) : undefined
    if (reward && c.stars >= reward.stars) {
      const redeemedAt = addDays(now, -r.int(2, 6))
      const code = `SAO${String(r.int(10_000, 99_999))}`
      vouchers.push({
        id: `pr-sao-${c.id}`,
        code,
        ownerId: c.id,
        name: `Voucher đổi sao ${reward.value.toLocaleString("vi-VN")} ₫`,
        description: `Đổi từ ${reward.stars} sao vàng`,
        type: "fixed",
        value: reward.value,
        minOrderValue: reward.minOrderValue,
        productIds: [],
        categoryIds: [],
        tiers: [],
        channels: ["online", "in-store"],
        startsAt: iso(redeemedAt),
        endsAt: iso(addDays(startOfDay(redeemedAt), REWARD_VOUCHER_DAYS + 1)),
        status: "active",
        usageLimit: 1,
        usageCount: 0,
      })
      ledger.push({
        id: `st-redeem-${c.id}`,
        customerId: c.id,
        at: iso(redeemedAt),
        delta: -reward.stars,
        kind: "redeem",
        note: `Đổi voucher ${reward.value.toLocaleString("vi-VN")} ₫`,
        ref: code,
      })
      c = { ...c, stars: c.stars - reward.stars }
    }
    return c
  })

  ledger.sort((a, b) => b.at.localeCompare(a.at))
  return { customers, ledger, vouchers }
}

export function createSeed(now: Date = new Date()): Database {
  const r = createRandom(20260916)
  const products = seedProducts.map((p) => ({ ...p }))
  const stores = seedStores.map((s) => ({ ...s }))
  const employees = seedEmployees.map((e) => ({ ...e }))
  const suppliers = seedSuppliers.map((s) => ({ ...s }))
  const promotions = createPromotions(r, products, now)
  const customers = createCustomers(r, now)
  const orders = createOrders(r, now, products, customers, promotions, employees, stores)

  // Customer stats from the seeded orders; promotion usage from codes.
  const byCustomer = new Map(customers.map((c) => [c.id, c] as const))
  for (const o of orders) {
    if (o.promotionCode) {
      const promo = promotions.find((p) => p.code === o.promotionCode)
      if (promo) promo.usageCount++
    }
    if (!o.customerId || o.status === "cancelled") continue
    const c = byCustomer.get(o.customerId)
    if (!c) continue
    c.orderCount++
    c.totalSpent += o.total
  }
  const members = replayMembership(r, customers, orders, now)
  promotions.push(...members.vouchers)
  for (const p of promotions) {
    if (p.type === "flash-sale" || p.type === "member-voucher" || p.type === "buy-x-get-y") {
      p.usageCount = orders.filter((o) =>
        o.items.some((it) => it.discount > 0 && (p.productIds.includes(it.productId) || p.type === "member-voucher")),
      ).length
    }
  }

  const stock = createStock(r, products, stores)
  const batches = createBatches(r, products, stores, stock, now)
  const purchaseOrders = createPurchaseOrders(r, now, products, suppliers, stores, employees)
  const shifts = createShifts(r, now, stores, employees, orders)

  return {
    categories: seedCategories,
    products,
    stores,
    employees,
    customers: members.customers,
    suppliers,
    promotions,
    orders,
    stock,
    batches,
    purchaseOrders,
    shifts,
    starLedger: members.ledger,
    // Every sample member signs in with the shared demo password.
    customerPasswords: Object.fromEntries(customers.map((c) => [c.id, hashPassword(DEMO_PASSWORD)])),
  }
}
