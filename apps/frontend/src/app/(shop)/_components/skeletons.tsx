import { ProductCardSkeleton } from "@/components/shop/product-card"
import { ProductGrid } from "@/components/shop/product-rail"
import { cn } from "@/lib/utils"

/** Placeholder with the footprint of <ProductRail>. */
export function ProductRailSkeleton({ count = 7, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("-mx-1 flex gap-3 overflow-hidden px-1 pb-1", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[46%] shrink-0 sm:w-[180px]">
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  )
}

/** Placeholder with the footprint of a <ProductGrid>. */
export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ProductGrid>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </ProductGrid>
  )
}

/** Grey bar used inside skeleton layouts. */
export function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden />
}
