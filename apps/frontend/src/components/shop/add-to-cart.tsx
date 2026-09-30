"use client"

import { MinusIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { navigate } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { useCart } from "@/stores/cart"
import type { Product } from "@/types"

import { requireAdult } from "./age-gate"

/** Add a product to the cart, asking for age confirmation first when needed. */
export function addToCart(product: Product, quantity = 1, { silent = false } = {}) {
  const run = () => {
    useCart.getState().add(product.id, quantity)
    if (!silent) {
      toast.success("Đã thêm vào giỏ hàng", {
        description: product.name,
        action: { label: "Xem giỏ", onClick: () => navigate("/gio-hang") },
      })
    }
  }
  if (product.ageRestricted) requireAdult(run)
  else run()
}

/** Quantity of a product currently in the cart. */
export function useCartQuantity(productId: string) {
  return useCart((s) => s.lines.find((l) => l.productId === productId)?.quantity ?? 0)
}

/**
 * The round green "+" from the storefront. Turns into a − qty + stepper once
 * the product is in the cart.
 */
export function QuickAddButton({ product, className }: { product: Product; className?: string }) {
  const quantity = useCartQuantity(product.id)
  const setQuantity = useCart((s) => s.setQuantity)

  if (quantity > 0) {
    return (
      <div
        className={cn(
          "flex h-8 items-center rounded-full bg-fresh-soft p-0.5 text-fresh ring-1 ring-fresh/30",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Bớt 1"
          onClick={() => setQuantity(product.id, quantity - 1)}
          className="flex size-7 items-center justify-center rounded-full hover:bg-white"
        >
          <MinusIcon className="size-4" />
        </button>
        <span className="tabular min-w-6 text-center text-sm font-semibold">{quantity}</span>
        <button
          type="button"
          aria-label="Thêm 1"
          onClick={() => addToCart(product, 1, { silent: true })}
          className="flex size-7 items-center justify-center rounded-full bg-fresh text-white hover:bg-fresh/90"
        >
          <PlusIcon className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      aria-label={`Thêm ${product.name} vào giỏ`}
      onClick={() => addToCart(product)}
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-fresh text-white shadow-sm transition hover:scale-105 hover:bg-fresh/90 active:scale-95",
        className,
      )}
    >
      <PlusIcon className="size-5" strokeWidth={2.5} />
    </button>
  )
}

/** − 1 + stepper used on the product page and in the cart. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "default",
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  size?: "default" | "lg"
}) {
  const big = size === "lg"
  return (
    <div className={cn("inline-flex items-center gap-1", big && "gap-2")}>
      <button
        type="button"
        aria-label="Giảm số lượng"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/70 disabled:opacity-40",
          big ? "size-9" : "size-7",
        )}
      >
        <MinusIcon className="size-4" />
      </button>
      <span className={cn("tabular text-center font-semibold", big ? "min-w-8 text-lg" : "min-w-6 text-sm")}>
        {value}
      </span>
      <button
        type="button"
        aria-label="Tăng số lượng"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cn(
          "flex items-center justify-center rounded-full bg-fresh text-white transition hover:bg-fresh/90 disabled:opacity-40",
          big ? "size-9" : "size-7",
        )}
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
