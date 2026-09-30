"use client"

import { ChevronsUpDownIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useProductMap, useProducts } from "@/hooks/use-catalog"
import { searchProducts } from "@/lib/catalog"
import { formatNumber, formatVND } from "@/lib/format"
import type { Product } from "@/types"

const MAX_RESULTS = 60

/** Searchable multi-select of catalog products with photos; selected products show as removable chips. */
export function ProductPicker({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string
  value: string[]
  onChange: (productIds: string[]) => void
  invalid?: boolean
}) {
  const products = useProducts()
  const productMap = useProductMap()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const active = useMemo(() => products.filter((p) => p.isActive), [products])
  const matches = useMemo(() => (query.trim() ? searchProducts(active, query) : active), [active, query])
  const selected = value.map((pid) => productMap.get(pid)).filter((p): p is Product => !!p)
  const chosen = new Set(value)

  const toggle = (productId: string) =>
    onChange(chosen.has(productId) ? value.filter((x) => x !== productId) : [...value, productId])

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            className="w-full justify-between font-normal"
          >
            <span className={value.length ? "text-foreground" : "text-muted-foreground"}>
              {value.length ? `Đã chọn ${formatNumber(value.length)} sản phẩm` : "Tìm và chọn sản phẩm"}
            </span>
            <ChevronsUpDownIcon className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Tên, thương hiệu, SKU hoặc mã vạch" />
            <CommandList className="max-h-80">
              <CommandEmpty>Không tìm thấy sản phẩm phù hợp</CommandEmpty>
              {matches.length ? (
                <CommandGroup
                  heading={
                    matches.length > MAX_RESULTS
                      ? `${MAX_RESULTS} / ${formatNumber(matches.length)} sản phẩm – gõ để lọc thêm`
                      : `${formatNumber(matches.length)} sản phẩm`
                  }
                >
                  {matches.slice(0, MAX_RESULTS).map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => toggle(p.id)}
                      data-checked={chosen.has(p.id)}
                      className="gap-2.5"
                    >
                      <ProductImage
                        src={p.image}
                        alt={p.name}
                        size={36}
                        className="size-9 shrink-0 rounded-md bg-white ring-1 ring-border"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1">{p.name}</span>
                        <span className="tabular text-xs text-muted-foreground">
                          {formatVND(p.price)} · {p.sku}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Sản phẩm đã chọn">
          {selected.map((p) => (
            <li
              key={p.id}
              className="flex max-w-full items-center gap-1.5 rounded-full bg-muted py-0.5 pr-1 pl-0.5 text-xs"
            >
              <ProductImage src={p.image} alt="" size={22} className="size-5.5 shrink-0 rounded-full bg-white" />
              <span className="max-w-44 truncate">{p.name}</span>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-label={`Bỏ chọn ${p.name}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
          {selected.length > 1 ? (
            <li>
              <button
                type="button"
                onClick={() => onChange([])}
                className="h-6 rounded-full px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Bỏ chọn tất cả
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
