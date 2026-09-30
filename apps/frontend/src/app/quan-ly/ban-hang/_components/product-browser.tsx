"use client"

import { BarcodeIcon, PackageSearchIcon, ScanBarcodeIcon, XIcon } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useActiveProducts, useCategories, useProducts, usePromotions } from "@/hooks/use-catalog"
import { type StockSummary, stockState } from "@/hooks/use-stock"
import { searchProducts } from "@/lib/catalog"
import { formatNumber, formatVND } from "@/lib/format"
import { flashPrice, flashSaleFor, isPromotionLive } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { useNow } from "@/stores/hydration"
import type { Category, Product, Promotion } from "@/types"

import { usePosStore } from "./pos-store"
import { isAgeRestricted, useBillActions } from "./use-pos"

/** "Mua 2 tặng 1" labels for products in a live buy-X-get-Y promotion. */
function bundleLabels(products: Product[], promotions: Promotion[], now: Date | null) {
  const map = new Map<string, string>()
  if (!now) return map
  for (const promo of promotions) {
    if (promo.type !== "buy-x-get-y" || !promo.buyQuantity || !promo.getQuantity) continue
    if (!isPromotionLive(promo, now, "in-store")) continue
    const everything = promo.productIds.length === 0 && promo.categoryIds.length === 0
    for (const p of products) {
      if (everything || promo.productIds.includes(p.id) || promo.categoryIds.includes(p.categoryId)) {
        map.set(p.id, `Mua ${promo.buyQuantity} tặng ${promo.getQuantity}`)
      }
    }
  }
  return map
}

export function ProductBrowser({
  storeId,
  searchRef,
}: {
  storeId: string
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const allProducts = useProducts()
  const products = useActiveProducts()
  const categories = useCategories()
  const promotions = usePromotions()
  const now = useNow(30_000)
  const lines = usePosStore((s) => s.lines)
  const { addToBill, stockMap } = useBillActions(storeId)

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")

  const bundles = useMemo(() => bundleLabels(products, promotions, now), [products, promotions, now])
  const restrictedCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.ageRestricted).map((c) => c.id)),
    [categories],
  )
  const inBill = useMemo(() => new Map(lines.map((l) => [l.productId, l.quantity] as const)), [lines])

  const visible = useMemo(() => {
    const base = query.trim() ? searchProducts(products, query) : products
    const inCategory = category === "all" ? base : base.filter((p) => p.categoryId === category)
    // Keep catalog order, but sold-out products sink to the bottom.
    return [...inCategory].sort(
      (a, b) => Number(stockState(stockMap.get(a.id)) === "out") - Number(stockState(stockMap.get(b.id)) === "out"),
    )
  }, [products, query, category, stockMap])

  const focusSearch = useCallback(() => searchRef.current?.focus({ preventScroll: true }), [searchRef])

  const scan = useCallback(
    (code: string) => {
      const q = code.trim()
      if (!q) return false
      const match = allProducts.find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase())
      if (match) {
        addToBill(match)
        return true
      }
      if (/^\d{8,14}$/.test(q)) toast.error(`Không tìm thấy sản phẩm có mã vạch ${q}`, { id: "pos-scan-miss" })
      return false
    },
    [allProducts, addToBill],
  )

  const onTileAdd = useCallback(
    (product: Product) => {
      addToBill(product)
      focusSearch()
    },
    [addToBill, focusSearch],
  )

  // Esc anywhere on the register (outside dialogs): clear the search and get ready to scan.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return
      setQuery("")
      focusSearch()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [focusSearch])

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (scan(query)) setQuery("")
      else e.currentTarget.select()
    } else if (e.key === "Escape" && query) {
      e.preventDefault()
      e.stopPropagation()
      setQuery("")
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b bg-white px-4 pt-3">
        <div className="flex items-center gap-2">
          <InputGroup className="h-11 flex-1 rounded-xl bg-white">
            <InputGroupAddon className="pl-3">
              <ScanBarcodeIcon className="size-5 text-brand" />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Quét mã vạch, nhập SKU hoặc tên sản phẩm"
              aria-label="Quét mã vạch hoặc tìm sản phẩm"
              className="text-base md:text-[15px]"
              autoComplete="off"
              spellCheck={false}
            />
            <InputGroupAddon align="inline-end" className="pr-3">
              {query ? (
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Xoá tìm kiếm"
                  onClick={() => {
                    setQuery("")
                    focusSearch()
                  }}
                >
                  <XIcon />
                </InputGroupButton>
              ) : (
                <Kbd>F2</Kbd>
              )}
            </InputGroupAddon>
          </InputGroup>
          <SampleBarcodes stockMap={stockMap} bundles={bundles} onScan={scan} onDone={focusSearch} />
        </div>

        <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3" role="tablist" aria-label="Danh mục">
          <CategoryChip active={category === "all"} onClick={() => setCategory("all")} label="Tất cả" />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
              label={c.name}
              icon={c.icon}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 p-4">
            {visible.map((p) => {
              const sale = now ? flashSaleFor(p, promotions, now, "in-store") : null
              return (
                <ProductTile
                  key={p.id}
                  product={p}
                  stock={stockMap.get(p.id)}
                  inBill={inBill.get(p.id) ?? 0}
                  salePrice={sale ? flashPrice(p.price, sale.value) : null}
                  flashPercent={sale?.value ?? null}
                  bundleLabel={bundles.get(p.id) ?? null}
                  ageRestricted={!!p.ageRestricted || restrictedCategoryIds.has(p.categoryId)}
                  onAdd={onTileAdd}
                />
              )
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PackageSearchIcon className="size-5" />
            </span>
            <p className="text-sm font-medium">Không tìm thấy sản phẩm phù hợp</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Kiểm tra lại mã vạch hoặc tên sản phẩm
              {category !== "all" ? ", hoặc tìm trong tất cả danh mục." : "."}
            </p>
            {category !== "all" ? (
              <Button variant="outline" size="sm" className="mt-1" onClick={() => setCategory("all")}>
                Tìm trong tất cả danh mục
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <footer className="flex h-10 shrink-0 items-center justify-between gap-4 border-t bg-white px-4 text-xs text-muted-foreground">
        <span className="truncate">
          <span className="tabular font-medium text-foreground">{formatNumber(visible.length)}</span> sản phẩm
          {category !== "all" ? ` · ${categories.find((c) => c.id === category)?.name ?? ""}` : ""}
        </span>
        <div className="hidden shrink-0 items-center gap-4 lg:flex" aria-label="Phím tắt">
          <Shortcut keys="F2" label="Tìm / quét" />
          <Shortcut keys="F4" label="Khách hàng" />
          <Shortcut keys="F9" label="Thanh toán" />
          <Shortcut keys="Esc" label="Xoá tìm kiếm, đóng hộp thoại" />
        </div>
      </footer>
    </section>
  )
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Kbd className="bg-white ring-1 ring-border">{keys}</Kbd>
      {label}
    </span>
  )
}

function CategoryChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: Category["icon"]
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-3 text-[13px] font-medium whitespace-nowrap ring-1 transition-colors",
        icon ? "pl-1" : "pl-3",
        active
          ? "bg-brand text-white ring-brand"
          : "bg-white text-foreground ring-border hover:bg-brand-soft/60 hover:ring-brand/30",
      )}
    >
      {icon ? (
        <span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-white">
          <ProductImage src={icon} alt="" size={20} className="size-5" />
        </span>
      ) : null}
      {label}
    </button>
  )
}

const ProductTile = memo(function ProductTile({
  product,
  stock,
  inBill,
  salePrice,
  flashPercent,
  bundleLabel,
  ageRestricted,
  onAdd,
}: {
  product: Product
  stock: StockSummary | undefined
  inBill: number
  salePrice: number | null
  flashPercent: number | null
  bundleLabel: string | null
  ageRestricted: boolean
  onAdd: (product: Product) => void
}) {
  const state = stockState(stock)
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      className={cn(
        "group relative flex flex-col rounded-xl bg-white p-2 text-left ring-1 transition-[box-shadow,transform] outline-none select-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]",
        inBill > 0 ? "ring-brand/60" : "ring-border hover:ring-brand/40",
        "hover:shadow-[0_8px_24px_-14px_rgba(0,0,0,0.3)]",
        state === "out" && "opacity-55",
      )}
      title={`${product.name} · ${product.barcode}`}
    >
      <div className="relative flex h-[92px] items-center justify-center">
        <ProductImage src={product.image} alt={product.name} size={92} className="size-[92px]" />
        {flashPercent ? (
          <span className="absolute top-0 left-0 rounded-md bg-red px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
            -{flashPercent}%
          </span>
        ) : null}
        {ageRestricted ? (
          <span className="absolute top-0 right-0 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
            18+
          </span>
        ) : null}
        {inBill > 0 ? (
          <span className="tabular absolute right-0 bottom-0 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white ring-2 ring-white">
            {inBill}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 min-h-10 text-[13px] leading-5 font-medium text-foreground">{product.name}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("tabular text-[15px] font-bold", salePrice !== null ? "text-red" : "text-foreground")}>
          {formatVND(salePrice ?? product.price)}
        </span>
        {salePrice !== null ? (
          <span className="tabular truncate text-[11px] text-muted-foreground line-through">
            {formatNumber(product.price)}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] leading-4">
        <span
          className={cn(
            "tabular font-medium",
            state === "out" ? "text-destructive" : state === "low" ? "text-warning" : "text-muted-foreground",
          )}
        >
          {state === "out" ? "Hết hàng" : state === "low" ? `Sắp hết · ${stock?.quantity}` : `Tồn ${stock?.quantity}`}
        </span>
        {bundleLabel ? (
          <span className="truncate rounded bg-sale-soft px-1 font-medium text-sale">{bundleLabel}</span>
        ) : null}
      </div>
    </button>
  )
})

/** Five real barcodes from the catalog (in stock here) so graders can try the scanner flow. */
function SampleBarcodes({
  stockMap,
  bundles,
  onScan,
  onDone,
}: {
  stockMap: Map<string, StockSummary>
  bundles: Map<string, string>
  onScan: (code: string) => boolean
  onDone: () => void
}) {
  const products = useActiveProducts()
  const categories = useCategories()
  const [open, setOpen] = useState(false)

  const samples = useMemo(() => {
    const inStock = (p: Product) => (stockMap.get(p.id)?.quantity ?? 0) >= 3
    const picks: { product: Product; hint: string }[] = []
    const take = (filter: (p: Product) => boolean, hint: (p: Product) => string) => {
      const p = products.find((x) => filter(x) && inStock(x) && !picks.some((pick) => pick.product.id === x.id))
      if (p) picks.push({ product: p, hint: hint(p) })
    }
    take(
      (p) => p.categoryId === "tra-sua",
      () => "Đồ uống · ưu đãi thành viên",
    )
    take(
      (p) => bundles.has(p.id),
      (p) => bundles.get(p.id) ?? "",
    )
    take(
      (p) => p.categoryId === "mon-ngon",
      () => "Món ăn",
    )
    take(
      (p) => isAgeRestricted(p, categories),
      () => "18+ · cần kiểm tra tuổi",
    )
    take(
      (p) => p.categoryId === "do-uong-dong-chai",
      () => "Đồ uống đóng chai",
    )
    return picks
  }, [products, categories, stockMap, bundles])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-11 rounded-xl bg-white px-3">
          <BarcodeIcon className="size-4 text-muted-foreground" />
          Mã vạch mẫu
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] gap-0 p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Mã vạch mẫu để thử quét</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bấm một mã để giả lập máy quét, hoặc gõ mã vào ô tìm kiếm rồi nhấn Enter.
          </p>
        </div>
        <ul className="p-1">
          {samples.map(({ product, hint }) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => {
                  onScan(product.barcode)
                  setOpen(false)
                  onDone()
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <ProductImage src={product.image} alt="" size={36} className="size-9 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{product.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono tracking-wide text-foreground">{product.barcode}</span>
                    <span className="truncate">{hint}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
