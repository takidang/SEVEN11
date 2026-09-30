import { z } from "zod"

/**
 * Phone rules shared by the storefront forms (sign-in, checkout recipient,
 * saved addresses): Vietnamese mobile numbers, 10 digits.
 */
export const VN_MOBILE = /^0[35789]\d{8}$/

/** "0901 234 567" / "+84 901 234 567" → "0901234567". */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits.startsWith("84") && digits.length === 11 ? `0${digits.slice(2)}` : digits
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Nhập số điện thoại")
  .refine(
    (value) => /^[\d\s.+-]+$/.test(value) && VN_MOBILE.test(normalizePhone(value)),
    "Số điện thoại gồm 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09",
  )

/** Only same-site paths are allowed as a post-login destination. */
export function safeNextPath(value: string | null, fallback = "/tai-khoan") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback
  if (value.startsWith("/dang-nhap")) return fallback
  return value
}
