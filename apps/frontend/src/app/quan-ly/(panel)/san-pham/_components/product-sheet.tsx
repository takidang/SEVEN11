"use client"

import { ProductImage } from "@/components/shop/product-image"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { Category, Product } from "@/types"

import { ProductDetails } from "./product-details"
import { ProductForm } from "./product-form"

/**
 * Right sheet for one product: edit form for admins, read-only details otherwise.
 * `product = null` with `open` = create a new product (admins only).
 */
export function ProductSheet({
  open,
  onOpenChange,
  product,
  canEdit,
  categories,
  scopeStoreId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  canEdit: boolean
  categories: Category[]
  scopeStoreId: string | null
  onSaved?: (product: Product) => void
}) {
  const creating = !product

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          // Editing an existing product: don't jump into (and select) the first field.
          if (!product) return
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        <SheetHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-12">
          {product ? (
            <ProductImage
              src={product.image}
              alt={product.name}
              size={48}
              className="size-12 shrink-0 rounded-lg bg-white ring-1 ring-border"
            />
          ) : null}
          <div className="min-w-0">
            <SheetTitle className="truncate text-base font-semibold">
              {product ? product.name : "Thêm sản phẩm"}
            </SheetTitle>
            <SheetDescription className="truncate">
              {product ? (
                <span className="font-mono text-xs">
                  {product.sku} · {product.barcode}
                </span>
              ) : (
                "Sản phẩm mới được thêm vào danh mục của toàn chuỗi, tồn kho ban đầu bằng 0."
              )}
            </SheetDescription>
          </div>
        </SheetHeader>

        {canEdit ? (
          <ProductForm
            key={product?.id ?? "new"}
            product={product}
            categories={categories}
            scopeStoreId={scopeStoreId}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved?.(saved)
              onOpenChange(false)
            }}
          />
        ) : !creating ? (
          <ProductDetails product={product} categories={categories} scopeStoreId={scopeStoreId} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
