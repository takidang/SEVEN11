"use client"

import { CircleAlertIcon, PackageXIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Panel } from "@/components/admin/page-header"
import { QuantityStepper } from "@/components/shop/add-to-cart"
import { ProductImage } from "@/components/shop/product-image"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { StockSummary } from "@/hooks/use-stock"
import { discountPercent, formatVND } from "@/lib/format"
import type { CartLine, PricedLine } from "@/lib/pricing"
import { useCart } from "@/stores/cart"
import type { Product, Store } from "@/types"

function removeLine(productId: string, name: string, quantity: number) {
  useCart.getState().remove(productId)
  toast("Đã xoá khỏi giỏ hàng", {
    description: name,
    action: { label: "Hoàn tác", onClick: () => useCart.getState().add(productId, quantity) },
  })
}

/** Cart lines in cart order: priced lines, plus products that can no longer be sold. */
export function CartLines({
  lines,
  pricedLines,
  productMap,
  stockMap,
  store,
}: {
  lines: CartLine[]
  pricedLines: PricedLine[]
  productMap: Map<string, Product>
  stockMap: Map<string, StockSummary>
  store: Store | undefined
}) {
  const priced = new Map(pricedLines.map((l) => [l.productId, l] as const))
  const units = lines.reduce((sum, l) => sum + l.quantity, 0)

  return (
    <div id="san-pham" className="scroll-mt-32 lg:scroll-mt-20">
      <Panel
        title={
          <>
            Sản phẩm <span className="font-normal text-muted-foreground">({units})</span>
          </>
        }
        actions={<ClearCartButton units={units} />}
        bodyClassName="p-0"
      >
        <ul className="divide-y">
          {lines.map((line) => {
            const pricedLine = priced.get(line.productId)
            return pricedLine ? (
              <CartLineRow
                key={line.productId}
                line={pricedLine}
                available={stockMap.get(line.productId)?.quantity ?? 0}
                storeCode={store?.code}
              />
            ) : (
              <UnavailableLineRow key={line.productId} line={line} product={productMap.get(line.productId)} />
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}

function CartLineRow({ line, available, storeCode }: { line: PricedLine; available: number; storeCode?: string }) {
  const setQuantity = useCart((s) => s.setQuantity)
  const { product } = line
  const href = `/san-pham/${product.slug}`
  const flashPercent = line.salePrice < line.unitPrice ? discountPercent(line.salePrice, line.unitPrice) : null
  const compareAt =
    line.salePrice < line.unitPrice
      ? line.unitPrice
      : product.compareAtPrice && product.compareAtPrice > line.unitPrice
        ? product.compareAtPrice
        : undefined
  const buyXGetY = line.promoLabel?.startsWith("Mua") ? line.promoLabel : null

  return (
    <li className="flex gap-3 p-4">
      <Link
        href={href}
        className="relative shrink-0 self-start overflow-hidden rounded-lg bg-white ring-1 ring-border/70"
        tabIndex={-1}
        aria-hidden
      >
        <ProductImage src={product.image} alt={product.name} size={96} className="size-20 sm:size-24" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <Link href={href} className="line-clamp-2 flex-1 text-sm leading-5 font-medium hover:text-brand">
            {product.name}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Xoá ${product.name} khỏi giỏ`}
            onClick={() => removeLine(product.id, product.name, line.quantity)}
            className="-mt-1 -mr-1 text-muted-foreground hover:bg-red-soft hover:text-red"
          >
            <Trash2Icon />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-semibold text-foreground">{formatVND(line.salePrice)}</span>
          {compareAt ? <span className="text-muted-foreground line-through">{formatVND(compareAt)}</span> : null}
          <span className="text-muted-foreground">/ {product.unit}</span>
          {flashPercent ? (
            <span className="rounded bg-red px-1.5 py-px text-[11px] font-bold text-white uppercase">
              Flash sale -{flashPercent}%
            </span>
          ) : null}
          {buyXGetY ? (
            <span className="rounded bg-sale-soft px-1.5 py-px text-[11px] font-semibold text-sale">{buyXGetY}</span>
          ) : null}
          {product.ageRestricted ? (
            <span className="rounded bg-foreground/85 px-1.5 py-px text-[11px] font-bold text-white">18+</span>
          ) : null}
        </div>

        {available <= 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-red">
            <span className="inline-flex items-center gap-1">
              <CircleAlertIcon className="size-3.5" /> Cửa hàng {storeCode} đã hết sản phẩm này
            </span>
            <button
              type="button"
              onClick={() => removeLine(product.id, product.name, line.quantity)}
              className="font-semibold underline underline-offset-2 hover:no-underline"
            >
              Xoá khỏi giỏ
            </button>
          </p>
        ) : line.quantity > available ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-warning">
            <span className="inline-flex items-center gap-1">
              <TriangleAlertIcon className="size-3.5" /> Cửa hàng {storeCode} chỉ còn {available} {product.unit}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(product.id, available)}
              className="font-semibold underline underline-offset-2 hover:no-underline"
            >
              Chỉ lấy {available}
            </button>
          </p>
        ) : null}

        {product.ageRestricted ? (
          <p className="text-xs leading-5 text-muted-foreground">
            Chỉ giao cho người từ đủ 18 tuổi – vui lòng chuẩn bị giấy tờ tuỳ thân khi nhận hàng.
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <QuantityStepper
            value={line.quantity}
            max={Math.max(1, Math.min(99, available))}
            onChange={(quantity) => setQuantity(product.id, quantity)}
          />
          <div className="text-right">
            {line.lineDiscount > 0 ? (
              <div className="tabular text-xs text-muted-foreground line-through">{formatVND(line.lineSubtotal)}</div>
            ) : null}
            <div className="tabular text-[15px] font-bold">{formatVND(line.lineTotal)}</div>
          </div>
        </div>
      </div>
    </li>
  )
}

function UnavailableLineRow({ line, product }: { line: CartLine; product: Product | undefined }) {
  const name = product?.name ?? "Sản phẩm không còn tồn tại"
  return (
    <li className="flex items-center gap-3 bg-muted/40 p-4">
      {product ? (
        <ProductImage
          src={product.image}
          alt={product.name}
          size={64}
          className="size-16 shrink-0 rounded-lg bg-white opacity-60 grayscale"
        />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <PackageXIcon className="size-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-muted-foreground">{name}</p>
        <p className="mt-0.5 text-xs font-medium text-red">Sản phẩm đã ngừng bán, không thể đặt</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => removeLine(line.productId, name, line.quantity)}>
        Xoá
      </Button>
    </li>
  )
}

function ClearCartButton({ units }: { units: number }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-red-soft hover:text-red">
          <Trash2Icon /> Xoá tất cả
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá toàn bộ giỏ hàng?</AlertDialogTitle>
          <AlertDialogDescription>
            {units} sản phẩm, mã khuyến mãi và ghi chú đang có trong giỏ sẽ bị xoá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Giữ lại</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => useCart.getState().clear()}>
            Xoá giỏ hàng
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
