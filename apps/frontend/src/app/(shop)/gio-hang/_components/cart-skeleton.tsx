import { Skeleton } from "@/components/ui/skeleton"

/** Same footprint as the checkout layout while the cart and the mock DB load. */
export function CartSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Đang tải giỏ hàng">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <div className="rounded-xl ring-1 ring-border">
            <div className="border-b px-4 py-3">
              <Skeleton className="h-5 w-32" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 border-b p-4 last:border-b-0">
                <Skeleton className="size-20 rounded-lg sm:size-24" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                  <div className="flex justify-between pt-3">
                    <Skeleton className="h-7 w-24 rounded-full" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-xl p-4 ring-1 ring-border">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-xl p-4 ring-1 ring-border">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-1/2 justify-self-end" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
