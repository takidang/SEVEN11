"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { DEMO_PASSWORD } from "@/data/staff"
import { hashPassword } from "@/lib/password"
import { normalizePhone } from "@/lib/phone"
import type { Customer, Employee } from "@/types"

import { useDb } from "./db"

/**
 * Mock authentication. Two independent sessions: a shopper on the storefront
 * and a staff member in the back office (they can coexist in one browser).
 */
interface SessionState {
  customerId: string | null
  staffId: string | null
}

export const useSession = create<SessionState>()(
  persist((): SessionState => ({ customerId: null, staffId: null }), {
    name: "7eleven-session",
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  }),
)

export type StaffSignInResult = { ok: true; employee: Employee } | { ok: false; error: string }

export function signInStaff(email: string, password: string): StaffSignInResult {
  const employee = useDb.getState().employees.find((e) => e.email.toLowerCase() === email.trim().toLowerCase())
  if (!employee || password !== DEMO_PASSWORD) return { ok: false, error: "Email hoặc mật khẩu không đúng" }
  if (employee.status === "inactive") return { ok: false, error: "Tài khoản đã bị khoá, liên hệ quản trị chuỗi" }
  useSession.setState({ staffId: employee.id })
  return { ok: true, employee }
}

export function signOutStaff() {
  useSession.setState({ staffId: null })
}

export type CustomerAuthError = "not-registered" | "already-registered" | "no-password" | "wrong-password"

export type CustomerAuthResult =
  { ok: true; customer: Customer } | { ok: false; reason: CustomerAuthError; error: string }

const AUTH_ERROR: Record<CustomerAuthError, string> = {
  "not-registered": "Số điện thoại chưa đăng ký thành viên",
  "already-registered": "Số điện thoại đã đăng ký thành viên",
  "no-password": "Tài khoản chưa có mật khẩu",
  "wrong-password": "Mật khẩu không đúng",
}

const fail = (reason: CustomerAuthError): CustomerAuthResult => ({ ok: false, reason, error: AUTH_ERROR[reason] })

export function findCustomerByPhone(phone: string): Customer | undefined {
  const normalized = normalizePhone(phone)
  return useDb.getState().customers.find((c) => c.phone === normalized)
}

/** Sign-in with phone + password. No OTP here — OTP only proves phone ownership (sign-up, reset). */
export function signInCustomer(phone: string, password: string): CustomerAuthResult {
  const customer = findCustomerByPhone(phone)
  if (!customer) return fail("not-registered")
  const hash = useDb.getState().customerPasswords[customer.id]
  if (!hash) return fail("no-password")
  if (hash !== hashPassword(password)) return fail("wrong-password")
  useSession.setState({ customerId: customer.id })
  return { ok: true, customer }
}

/** Creates a Silver member once the phone passed OTP, then signs them in. */
export function signUpCustomer(input: { phone: string; fullName: string; password: string }): CustomerAuthResult {
  if (findCustomerByPhone(input.phone)) return fail("already-registered")
  const customer = useDb.getState().registerCustomer({
    fullName: input.fullName.trim(),
    phone: normalizePhone(input.phone),
    password: input.password,
  })
  useSession.setState({ customerId: customer.id })
  return { ok: true, customer }
}

/** "Quên mật khẩu": once the phone passed OTP, set a new password and sign in. */
export function resetCustomerPassword(phone: string, password: string): CustomerAuthResult {
  const customer = findCustomerByPhone(phone)
  if (!customer) return fail("not-registered")
  useDb.getState().setCustomerPassword(customer.id, password)
  useSession.setState({ customerId: customer.id })
  return { ok: true, customer }
}

export function signOutCustomer() {
  useSession.setState({ customerId: null })
}

/** The signed-in shopper (null when signed out or before the DB is ready). */
export function useCurrentCustomer(): Customer | null {
  const customerId = useSession((s) => s.customerId)
  return useDb((s) => (customerId ? (s.customers.find((c) => c.id === customerId) ?? null) : null))
}

/** The signed-in staff member (null when signed out). */
export function useCurrentStaff(): Employee | null {
  const staffId = useSession((s) => s.staffId)
  return useDb((s) => (staffId ? (s.employees.find((e) => e.id === staffId) ?? null) : null))
}
