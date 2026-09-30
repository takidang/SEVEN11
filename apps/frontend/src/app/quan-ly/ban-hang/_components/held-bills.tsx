"use client"

import { ArchiveRestoreIcon, CirclePauseIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useProductMap, usePromotions } from "@/hooks/use-catalog"
import { formatTime, formatVND } from "@/lib/format"
import { priceCart } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"

import { type HeldBill, usePosStore } from "./pos-store"

/** "Bill đang giữ (n)": parked bills the cashier can bring back. */
export function HeldBillsPopover() {
  const held = usePosStore((s) => s.held)
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CirclePauseIcon />
          Bill đang giữ
          <span
            className={cn(
              "tabular ml-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[11px] font-semibold",
              held.length > 0 ? "bg-orange text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {held.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] gap-0 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Bill đang giữ</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mở lại một bill để tiếp tục thanh toán. Bill đang bán dở sẽ được tạm giữ thay thế.
          </p>
        </div>
        {held.length ? (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {held.map((bill, i) => (
              <HeldBillRow key={bill.id} bill={bill} index={held.length - i} onRestored={() => setOpen(false)} />
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Chưa có bill nào đang giữ.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function HeldBillRow({ bill, index, onRestored }: { bill: HeldBill; index: number; onRestored: () => void }) {
  const productMap = useProductMap()
  const promotions = usePromotions()
  const customer = useDb((s) => (bill.customerId ? s.customers.find((c) => c.id === bill.customerId) : undefined))

  const pricing = useMemo(
    () =>
      priceCart({
        lines: bill.lines,
        products: productMap,
        promotions,
        channel: "in-store",
        customer,
        code: bill.promoCode || undefined,
      }),
    [bill, productMap, promotions, customer],
  )
  const names = pricing.lines.map((l) => l.product.name)

  return (
    <li className="flex gap-3 px-3 py-2.5">
      <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
        #{index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="tabular text-[15px] font-semibold whitespace-nowrap">{formatVND(pricing.total)}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              onClick={() => {
                usePosStore.getState().restoreBill(bill.id)
                toast.success(`Đã mở lại bill #${index}`)
                onRestored()
              }}
            >
              <ArchiveRestoreIcon /> Mở lại
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Xoá bill đang giữ"
              onClick={() => {
                usePosStore.getState().discardHeld(bill.id)
                toast(`Đã xoá bill đang giữ #${index}`)
              }}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {pricing.itemCount} sản phẩm · giữ lúc {formatTime(bill.heldAt)}
          {customer ? ` · ${customer.fullName}` : ""}
        </p>
        <p className="mt-0.5 truncate text-xs text-foreground/80">
          {names.slice(0, 2).join(", ")}
          {names.length > 2 ? ` và ${names.length - 2} sản phẩm khác` : ""}
        </p>
      </div>
    </li>
  )
}
