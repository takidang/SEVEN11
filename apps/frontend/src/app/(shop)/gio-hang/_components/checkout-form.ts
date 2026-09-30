import { z } from "zod"

import { phoneSchema } from "@/lib/phone"
import type { PaymentMethod } from "@/types"

export const recipientSchema = z.object({
  recipient: z.string().trim().min(2, "Nhập họ tên người nhận").max(60, "Họ tên tối đa 60 ký tự"),
  phone: phoneSchema,
})

export type RecipientValues = z.infer<typeof recipientSchema>

/** Payment methods offered for online orders. */
export type CheckoutPaymentMethod = Extract<PaymentMethod, "cod" | "ewallet" | "card">

export const SIGN_IN_TO_CHECKOUT = "/dang-nhap?next=/gio-hang"

/** Delivery window shown before ordering; the order's `eta` (placed + 24 min) is its end. */
export function deliveryWindow(now: Date) {
  return { from: new Date(now.getTime() + 14 * 60_000), to: new Date(now.getTime() + 24 * 60_000) }
}
