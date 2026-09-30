"use client"

import { StoreIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"

/** Admin: pick a store or the whole chain. Manager/cashier: shows their store. */
export function StoreSwitcher() {
  const { storeId, canSwitch, setStoreScope } = useStoreScope()
  const stores = useDb((s) => s.stores)
  const current = stores.find((s) => s.id === storeId)

  if (!canSwitch) {
    return current ? (
      <span className="flex h-8 items-center gap-2 rounded-lg bg-muted px-2.5 text-sm">
        <StoreIcon className="size-4 text-brand" />
        <span className="font-medium">{current.code}</span>
        <span className="hidden text-muted-foreground sm:inline">{current.name}</span>
      </span>
    ) : null
  }

  const provinces = [...new Set(stores.map((s) => s.province))]
  return (
    <Select value={storeId ?? "all"} onValueChange={setStoreScope}>
      <SelectTrigger size="sm" className="w-[250px] bg-white" aria-label="Chọn cửa hàng">
        <StoreIcon className="size-4 text-brand" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all">Toàn chuỗi ({stores.length} cửa hàng)</SelectItem>
        {provinces.map((province) => (
          <SelectGroup key={province}>
            <SelectSeparator />
            <SelectLabel>{province}</SelectLabel>
            {stores
              .filter((s) => s.province === province)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code} – {s.name}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
