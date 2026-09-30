import type {
  EmployeeStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PromotionStatus,
  PurchaseOrderStatus,
  SalesChannel,
  ShiftStatus,
  ShiftType,
  StoreStatus,
} from "@/types"

/**
 * Labels + badge tones for every status enum. Use with <StatusBadge tone=…>.
 * Tones map to design tokens: neutral · brand · fresh · info · warning · danger · orange.
 */
export type Tone = "neutral" | "brand" | "fresh" | "info" | "warning" | "danger" | "orange"

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending: { label: "Chờ xác nhận", tone: "warning" },
  confirmed: { label: "Đã xác nhận", tone: "info" },
  preparing: { label: "Đang chuẩn bị", tone: "orange" },
  delivering: { label: "Đang giao", tone: "info" },
  completed: { label: "Hoàn thành", tone: "fresh" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
}

/** Online order flow. In-store orders are created as `completed`. */
export const ORDER_FLOW: OrderStatus[] = ["pending", "confirmed", "preparing", "delivering", "completed"]

/** Next status an online order can move to (null when finished). */
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(status)
  if (i === -1 || i === ORDER_FLOW.length - 1) return null
  return ORDER_FLOW[i + 1]
}

/** Label for the button that advances an order to its next status. */
export const ORDER_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "Xác nhận đơn",
  preparing: "Bắt đầu chuẩn bị",
  delivering: "Giao cho shipper",
  completed: "Đã giao thành công",
}

export function canCancelOrder(status: OrderStatus) {
  return status === "pending" || status === "confirmed" || status === "preparing"
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  card: "Thẻ ngân hàng",
  ewallet: "Ví điện tử",
  "bank-transfer": "Chuyển khoản QR",
  cod: "Thanh toán khi nhận hàng",
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  unpaid: { label: "Chưa thanh toán", tone: "warning" },
  paid: { label: "Đã thanh toán", tone: "fresh" },
  refunded: { label: "Đã hoàn tiền", tone: "neutral" },
}

export const CHANNEL: Record<SalesChannel, string> = {
  "in-store": "Tại quầy",
  online: "Online",
}

export const PROMOTION_STATUS: Record<PromotionStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Sắp diễn ra", tone: "info" },
  active: { label: "Đang chạy", tone: "fresh" },
  paused: { label: "Tạm dừng", tone: "warning" },
  ended: { label: "Đã kết thúc", tone: "neutral" },
}

export const PURCHASE_STATUS: Record<PurchaseOrderStatus, { label: string; tone: Tone }> = {
  draft: { label: "Nháp", tone: "neutral" },
  ordered: { label: "Đã đặt hàng", tone: "info" },
  received: { label: "Đã nhập kho", tone: "fresh" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
}

export const STORE_STATUS: Record<StoreStatus, { label: string; tone: Tone }> = {
  active: { label: "Đang hoạt động", tone: "fresh" },
  maintenance: { label: "Bảo trì", tone: "warning" },
  closed: { label: "Đã đóng", tone: "neutral" },
}

export const SHIFT_TYPE: Record<ShiftType, { label: string; time: string; start: number; end: number }> = {
  morning: { label: "Ca sáng", time: "06:00 – 14:00", start: 6, end: 14 },
  afternoon: { label: "Ca chiều", time: "14:00 – 22:00", start: 14, end: 22 },
  night: { label: "Ca đêm", time: "22:00 – 06:00", start: 22, end: 30 },
}

export const SHIFT_STATUS: Record<ShiftStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Đã xếp lịch", tone: "neutral" },
  "in-progress": { label: "Đang làm", tone: "fresh" },
  completed: { label: "Đã xong", tone: "info" },
  absent: { label: "Vắng", tone: "danger" },
}

export const EMPLOYEE_STATUS: Record<EmployeeStatus, { label: string; tone: Tone }> = {
  active: { label: "Đang làm", tone: "fresh" },
  "on-leave": { label: "Nghỉ phép", tone: "warning" },
  inactive: { label: "Đã nghỉ", tone: "neutral" },
}
