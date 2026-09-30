/**
 * Customer account flows on /dang-nhap:
 * - Đăng nhập: phone + password (no OTP).
 * - Đăng ký: name, phone, password → OTP to prove the phone is theirs.
 * - Quên mật khẩu: phone → OTP → new password.
 * OTP codes come from the mock service in `stores/otp.ts`; the SMS is shown as a toast.
 */

export type Mode = "sign-in" | "sign-up"

/** Value of `?tab=` for each tab (sign-in is the default, so it has none). */
export const TAB_PARAM: Record<Mode, string | null> = { "sign-in": null, "sign-up": "dang-ky" }

/** What the shopper typed, kept while they move between tabs and steps. */
export interface Draft {
  phone: string
  fullName: string
}

export const DEMO_PHONE = "0901234567"
