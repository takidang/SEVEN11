"use client"

import { ProductImage } from "@/components/shop/product-image"
import { cn } from "@/lib/utils"
import type { Product } from "@/types"

/** Photo + name + codes, the first column of every product-based table in the back office. */
export function ProductCell({
  product,
  meta,
  showBarcode = true,
  size = 40,
  className,
}: {
  product: Product
  /** Replaces the default "SKU · barcode" line. */
  meta?: React.ReactNode
  showBarcode?: boolean
  size?: 32 | 40 | 48
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <ProductImage
        src={product.image}
        alt={product.name}
        size={size}
        className={cn(
          "shrink-0 rounded-lg bg-white ring-1 ring-border",
          size === 32 ? "size-8" : size === 40 ? "size-10" : "size-12",
        )}
      />
      <div className="min-w-0">
        <div className="max-w-[260px] truncate font-medium text-foreground" title={product.name}>
          {product.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {meta ?? (
            <span className="font-mono">
              {product.sku}
              {showBarcode ? ` · ${product.barcode}` : null}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
