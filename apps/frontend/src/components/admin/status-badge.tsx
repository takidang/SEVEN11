import type { Tone } from "@/lib/order-status"
import { cn } from "@/lib/utils"

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  brand: "bg-brand-soft text-brand-dark ring-brand/20",
  fresh: "bg-fresh-soft text-[#067a36] ring-fresh/25",
  info: "bg-info-soft text-info ring-info/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-red-soft text-[#b3161f] ring-red/20",
  orange: "bg-orange-soft text-[#b8480c] ring-orange/25",
}

const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  brand: "bg-brand",
  fresh: "bg-fresh",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-red",
  orange: "bg-orange",
}

/**
 * Status pill. Always pass a text label — color never carries meaning alone.
 * Pair with the maps in lib/order-status (ORDER_STATUS, PAYMENT_STATUS, …).
 */
export function StatusBadge({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: Tone
  children: React.ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", DOT_CLASS[tone])} aria-hidden /> : null}
      {children}
    </span>
  )
}
