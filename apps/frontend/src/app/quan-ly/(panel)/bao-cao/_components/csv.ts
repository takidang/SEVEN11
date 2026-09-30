/**
 * Client-side CSV export. Files are UTF-8 with a BOM (so Excel shows Vietnamese correctly),
 * comma-separated, CRLF line endings, RFC 4180 quoting. Money and counts stay plain integers so
 * spreadsheets can sum them; percentages are exported as formatted text ("12,3%").
 */

export type CsvCell = string | number | null | undefined

/** One block of the file: an optional title line, a header row, then data rows. */
export interface CsvSection {
  title?: string
  header: string[]
  rows: CsvCell[][]
}

const PLAIN_NUMBER = /^-?[\d.,]+%?$/

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return ""
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return ""
    return Number.isInteger(cell) ? String(cell) : String(Math.round(cell * 10_000) / 10_000)
  }
  let text = cell
  // Formula injection guard: text starting like a formula is prefixed so Excel keeps it as text.
  if (/^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(sections: CsvSection[], meta: [string, string][] = []): string {
  const lines: string[] = meta.map((pair) => pair.map(escapeCell).join(","))
  sections.forEach((section) => {
    if (lines.length) lines.push("")
    if (section.title) lines.push(escapeCell(section.title))
    lines.push(section.header.map(escapeCell).join(","))
    for (const row of section.rows) lines.push(row.map(escapeCell).join(","))
  })
  return lines.join("\r\n") + "\r\n"
}

/** Save `content` as a file (call from an event handler). */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
