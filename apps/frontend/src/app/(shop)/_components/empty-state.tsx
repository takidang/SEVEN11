import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Storefront empty state: icon in a muted circle, one line of explanation, one action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <div className="max-w-md">
        <p className="text-base font-semibold text-balance text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-balance text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
