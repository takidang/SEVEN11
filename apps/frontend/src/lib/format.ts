/**
 * Formatting helpers. All user-facing numbers and dates go through here so the
 * whole app reads the same way (vi-VN).
 */

const vnd = new Intl.NumberFormat("vi-VN")
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 })

/** 35000 -> "35.000 ₫" */
export function formatVND(value: number): string {
  return `${vnd.format(Math.round(value))} ₫`
}

/** 35000 -> "35.000" (no currency sign, for dense tables and inputs). */
export function formatNumber(value: number): string {
  return vnd.format(Math.round(value))
}

/** 12900000 -> "12,9 Tr" ; 4200000000 -> "4,2 Tỷ" */
export function formatCompactVND(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${trimZero(value / 1_000_000_000)} tỷ`
  if (abs >= 1_000_000) return `${trimZero(value / 1_000_000)} tr`
  if (abs >= 1_000) return `${trimZero(value / 1_000)}k`
  return compact.format(value)
}

function trimZero(n: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(n)
}

/** 0.1234 -> "12,3%" */
export function formatPercent(ratio: number, digits = 1): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(ratio)
}

/** Discount label for a sale price: 49000 -> 43000 gives "-13%". */
export function discountPercent(price: number, compareAtPrice?: number): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
}

const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})
const timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" })

/** "16/09/2026" */
export function formatDate(value: string | Date): string {
  return dateFmt.format(new Date(value))
}

/** "16/09/2026 08:30" */
export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(new Date(value)).replace(",", "")
}

/** "08:30" */
export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value))
}

/** "16/09" */
export function formatDayMonth(value: string | Date): string {
  // Built by hand: Intl "vi-VN" with only day + month renders "16-09".
  const d = new Date(value)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** "T4" (Chủ nhật = "CN"). Built by hand: Intl "vi-VN" short weekday renders "Thứ 4". */
export function formatWeekday(value: string | Date): string {
  const day = new Date(value).getDay()
  return day === 0 ? "CN" : `T${day + 1}`
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước", or the date. */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(value).getTime()) / 1000
  if (diff < 60) return "vừa xong"
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`
  return formatDate(value)
}

/** "0901234567" -> "0901 234 567" */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "")
  // Landlines: 024 / 028 + 8 digits ("028 7300 1006"); other provinces 02xx + 7 digits ("0274 390 0102").
  if (d.length === 11 && (d.startsWith("024") || d.startsWith("028")))
    return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`
  if (d.length === 11 && d.startsWith("02")) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  // Mobiles: "0901 234 567"
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return phone
}

/** Initials for avatars: "Nguyễn Minh Quân" -> "MQ" (punctuation and digits ignored). */
export function initials(fullName: string): string {
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Strip Vietnamese diacritics and lowercase — for search matching. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim()
}

/** yyyy-MM-dd in local time. */
export function toDateKey(value: string | Date): string {
  const d = new Date(value)
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}
