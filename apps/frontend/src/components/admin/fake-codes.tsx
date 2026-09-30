import { useMemo } from "react"

import { cn } from "@/lib/utils"

/**
 * Demo-only payment QR and receipt barcode. They look like the real thing but
 * encode nothing: modules/bars are derived deterministically from `value`.
 */

function seededRandom(value: string) {
  // FNV-1a hash → mulberry32 generator
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const QR_SIZE = 29

function qrPath(value: string) {
  const n = QR_SIZE
  const random = seededRandom(value)
  const dark: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false))
  const reserved: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false))

  const finder = (top: number, left: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const r = top + y
        const c = left + x
        if (r < 0 || c < 0 || r >= n || c >= n) continue
        reserved[r][c] = true
        const ring = Math.max(Math.abs(y - 3), Math.abs(x - 3))
        dark[r][c] = ring !== 2 && ring !== 4
      }
    }
  }
  finder(0, 0)
  finder(0, n - 7)
  finder(n - 7, 0)

  // Alignment pattern
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) {
      const r = n - 7 + y
      const c = n - 7 + x
      reserved[r][c] = true
      dark[r][c] = Math.max(Math.abs(x), Math.abs(y)) !== 1
    }
  }
  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    reserved[6][i] = reserved[i][6] = true
    dark[6][i] = dark[i][6] = i % 2 === 0
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!reserved[r][c]) dark[r][c] = random() < 0.5
    }
  }

  let d = ""
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (dark[r][c]) d += `M${c} ${r}h1v1h-1z`
  }
  return d
}

export function FakeQr({ value, size = 180, className }: { value: string; size?: number; className?: string }) {
  const d = useMemo(() => qrPath(value), [value])
  const quiet = 2
  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${QR_SIZE + quiet * 2} ${QR_SIZE + quiet * 2}`}
      width={size}
      height={size}
      role="img"
      aria-label="Mã QR thanh toán"
      shapeRendering="crispEdges"
      className={cn("rounded-lg bg-white text-foreground", className)}
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}

function barcodeBars(value: string) {
  const random = seededRandom(value)
  const bars: { x: number; w: number }[] = []
  let x = 0
  const push = (w: number, gap: number) => {
    bars.push({ x, w })
    x += w + gap
  }
  // start guard
  push(2, 1)
  push(1, 1)
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    for (let k = 0; k < 3; k++) push(1 + ((code >> k) & 1) + (random() < 0.3 ? 1 : 0), 1 + (random() < 0.4 ? 1 : 0))
  }
  // end guard
  push(1, 1)
  push(2, 0)
  return { bars, width: x }
}

export function FakeBarcode({ value, height = 36, className }: { value: string; height?: number; className?: string }) {
  const { bars, width } = useMemo(() => barcodeBars(value), [value])
  return (
    <svg
      viewBox={`0 0 ${width} 40`}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Mã vạch ${value}`}
      shapeRendering="crispEdges"
      className={cn("w-full text-foreground", className)}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="currentColor" />
      ))}
    </svg>
  )
}
