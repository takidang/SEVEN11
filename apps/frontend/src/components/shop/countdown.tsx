"use client"

import { useNow } from "@/stores/hydration"
import { cn } from "@/lib/utils"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** "02:14:09" until `endsAt`. Renders nothing on the server or once it ends. */
export function Countdown({
  endsAt,
  className,
  prefix = "Còn",
}: {
  endsAt: Date | string | null
  className?: string
  prefix?: string
}) {
  const now = useNow(1000)
  if (!now || !endsAt) return null
  const ms = new Date(endsAt).getTime() - now.getTime()
  if (ms <= 0) return null
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      {prefix ? <span>{prefix}</span> : null}
      <span className="tabular rounded bg-orange px-1.5 py-0.5 font-semibold text-white">
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    </span>
  )
}
