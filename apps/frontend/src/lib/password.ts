import { z } from "zod"

/**
 * Customer password rules shared by sign-up and password reset.
 * OTP is only used to prove the shopper owns the phone (sign-up, forgot password);
 * day-to-day sign-in is phone + password.
 */
export const PASSWORD_MIN_LENGTH = 6

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
  .max(64, "Mật khẩu tối đa 64 ký tự")

/**
 * Demo stand-in for a password hash, so typed passwords are not kept as plain text in
 * the browser. NOT secure: the backend must hash with bcrypt/argon2 and never send the
 * hash to the client. (cyrb53 — synchronous, works without a secure context.)
 */
export function hashPassword(password: string): string {
  const input = `7eleven-demo:${password}`
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `demo$${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}`
}
