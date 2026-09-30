"use client"

import { StoreIcon } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"

/** Shown to an admin looking at the whole chain: shifts are planned per store. */
export function StoreRequired({ what }: { what: string }) {
  const stores = useDb((s) => s.stores)
  const { setStoreScope } = useStoreScope()

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-4 py-14 text-center ring-1 ring-border">
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
        <StoreIcon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">Chọn một cửa hàng để xem {what}</p>
        <p className="max-w-md text-xs text-balance text-muted-foreground">
          Lịch ca và chốt ca được quản lý theo từng cửa hàng. Chọn cửa hàng ở ô “Toàn chuỗi” trên thanh đầu trang, hoặc
          chọn nhanh tại đây.
        </p>
      </div>
      <Select onValueChange={setStoreScope}>
        <SelectTrigger className="w-64" aria-label="Chọn cửa hàng">
          <SelectValue placeholder="Chọn cửa hàng" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.code} – {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
