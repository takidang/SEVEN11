import { ArrowDownRightIcon, ArrowUpRightIcon, type LucideIcon } from "lucide-react"

import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * KPI tile (dataviz stat-tile contract): label · value · optional delta vs a
 * named period. Values use proportional figures; the delta color follows
 * direction × whether up is good, and always comes with an arrow + text.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel = "so với kỳ trước",
  upIsGood = true,
  hint,
  className,
}: {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  /** Relative change, e.g. 0.12 for +12%. */
  delta?: number | null
  deltaLabel?: string
  upIsGood?: boolean
  hint?: React.ReactNode
  className?: string
}) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta)
  const flat = hasDelta && Math.abs(delta!) < 0.0005
  const up = hasDelta && delta! > 0
  const good = hasDelta && (up ? upIsGood : !upIsGood)

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-border", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      {hasDelta ? (
        <div className="flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              flat ? "text-muted-foreground" : good ? "text-[#067a36]" : "text-[#b3161f]",
            )}
          >
            {flat ? null : up ? <ArrowUpRightIcon className="size-3.5" /> : <ArrowDownRightIcon className="size-3.5" />}
            {up && !flat ? "+" : ""}
            {formatPercent(flat ? 0 : delta!)}
          </span>
          <span className="text-muted-foreground">{deltaLabel}</span>
        </div>
      ) : hint ? (
        <div className="text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  )
}
