import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Stat card placeholders in the same grid as the real row. */
export function StatRowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-[118px] flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
      ))}
    </div>
  )
}

/** A white panel with a title bar and a grey block where its content will be. */
export function PanelSkeleton({ height, className }: { height: number; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-card ring-1 ring-border", className)}>
      <div className="flex flex-col gap-1.5 border-b px-4 py-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-60" />
      </div>
      <div className="p-4">
        <Skeleton className="w-full" style={{ height }} />
      </div>
    </div>
  )
}
