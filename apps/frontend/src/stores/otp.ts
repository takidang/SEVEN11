"use client"

/**
 * Mock OTP service (part of the in-browser backend). Codes are real one-time codes with
 * an expiry and an attempt limit; only the SMS is simulated: `requestOtp` returns the code
 * as `devCode` so the page can show it as an incoming text. A real server sends the SMS and
 * never returns the code (see docs/architecture.md).
 */

export type OtpPurpose = "sign-up" | "reset"

export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 5
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_SECONDS = 60

interface Challenge {
  code: string
  sentAt: number
  expiresAt: number
  attemptsLeft: number
}

/** Kept in memory only: a reload starts the flow over, like an expired session. */
const challenges = new Map<string, Challenge>()

const keyOf = (purpose: OtpPurpose, phone: string) => `${purpose}:${phone}`

function randomCode() {
  const n =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 2 ** 32)
  return String(n % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0")
}

export interface OtpRequestResult {
  sentAt: number
  expiresAt: number
  /** Demo only — stands in for the SMS. */
  devCode: string
}

/**
 * Sends a code for this phone and purpose. Within the resend wait a still-usable code is
 * returned again instead of a new one (no new SMS).
 */
export function requestOtp(phone: string, purpose: OtpPurpose): OtpRequestResult {
  const key = keyOf(purpose, phone)
  const now = Date.now()
  const current = challenges.get(key)
  if (
    current &&
    current.attemptsLeft > 0 &&
    now < current.expiresAt &&
    now - current.sentAt < OTP_RESEND_SECONDS * 1000
  ) {
    return { sentAt: current.sentAt, expiresAt: current.expiresAt, devCode: current.code }
  }
  const challenge: Challenge = {
    code: randomCode(),
    sentAt: now,
    expiresAt: now + OTP_TTL_MINUTES * 60_000,
    attemptsLeft: OTP_MAX_ATTEMPTS,
  }
  challenges.set(key, challenge)
  return { sentAt: challenge.sentAt, expiresAt: challenge.expiresAt, devCode: challenge.code }
}

export type OtpVerifyResult =
  { ok: true } | { ok: false; reason: "wrong" | "expired" | "locked" | "missing"; error: string }

/** Checks a code. A correct code works once; wrong codes use up attempts. */
export function verifyOtp(phone: string, purpose: OtpPurpose, code: string): OtpVerifyResult {
  const key = keyOf(purpose, phone)
  const current = challenges.get(key)
  if (!current) return { ok: false, reason: "missing", error: "Mã OTP không còn hiệu lực, bấm Gửi lại mã" }
  if (Date.now() > current.expiresAt) {
    return {
      ok: false,
      reason: "expired",
      error: `Mã OTP đã quá ${OTP_TTL_MINUTES} phút, bấm Gửi lại mã để nhận mã mới`,
    }
  }
  if (current.attemptsLeft <= 0) {
    return { ok: false, reason: "locked", error: `Đã nhập sai ${OTP_MAX_ATTEMPTS} lần, bấm Gửi lại mã để nhận mã mới` }
  }
  if (code !== current.code) {
    const attemptsLeft = current.attemptsLeft - 1
    challenges.set(key, { ...current, attemptsLeft })
    return attemptsLeft > 0
      ? { ok: false, reason: "wrong", error: `Mã OTP không đúng, còn ${attemptsLeft} lần thử` }
      : { ok: false, reason: "locked", error: `Đã nhập sai ${OTP_MAX_ATTEMPTS} lần, bấm Gửi lại mã để nhận mã mới` }
  }
  challenges.delete(key)
  return { ok: true }
}
