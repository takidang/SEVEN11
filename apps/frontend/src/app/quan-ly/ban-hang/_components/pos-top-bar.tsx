"use client"

import { GlobeIcon, LayoutDashboardIcon, LogOutIcon, StoreIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate, formatWeekday, initials } from "@/lib/format"
import { STORE_STATUS } from "@/lib/order-status"
import { canView, ROLE_LABEL } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { signOutStaff } from "@/stores/session"
import type { Employee, Store } from "@/types"

import { usePosStore } from "./pos-store"
import { ShiftControl } from "./shift-control"

const clockFmt = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

export function PosTopBar({
  staff,
  store,
  canSwitch,
  onStoreChange,
}: {
  staff: Employee
  store: Store | null
  canSwitch: boolean
  onStoreChange: (storeId: string) => void
}) {
  const router = useRouter()
  const orders = useDb((s) => s.orders)
  // Same scope as the orders board the badge links to (admin without a store = whole chain).
  const pendingOnline = useMemo(
    () => orders.filter((o) => o.status === "pending" && (!store || o.storeId === store.id)).length,
    [orders, store],
  )

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-3">
      <div className="flex items-center gap-2.5">
        <LogoMark className="size-9" />
        <div className="hidden leading-tight sm:block">
          <p className="text-[15px] font-bold">Bán tại quầy</p>
          <p className="text-[11px] text-muted-foreground">7-Eleven POS</p>
        </div>
      </div>
      <Separator orientation="vertical" className="mx-1 h-7 self-center" />

      {canSwitch ? (
        <StorePicker value={store?.id ?? null} onChange={onStoreChange} />
      ) : store ? (
        <span className="flex h-9 items-center gap-2 rounded-lg bg-muted px-3 text-sm">
          <StoreIcon className="size-4 text-brand" />
          <span className="tabular font-semibold">{store.code}</span>
          <span className="max-w-44 truncate text-muted-foreground">{store.name}</span>
        </span>
      ) : null}

      {store ? <ShiftControl staff={staff} store={store} /> : null}

      <div className="ml-auto flex items-center gap-2">
        <Clock />
        <Button asChild variant="outline" className="h-9 gap-2">
          <Link href="/quan-ly/don-hang?trang-thai=pending">
            <GlobeIcon />
            Đơn online
            <span
              className={cn(
                "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                pendingOnline > 0 ? "bg-orange text-white" : "bg-muted text-muted-foreground",
              )}
              aria-label={`${pendingOnline} đơn chờ xác nhận`}
            >
              {pendingOnline}
            </span>
          </Link>
        </Button>
        {canView(staff.role, "dashboard") ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/quan-ly">
              <LayoutDashboardIcon /> Quản lý
            </Link>
          </Button>
        ) : null}
        <Separator orientation="vertical" className="mx-1 h-7 self-center" />
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {initials(staff.fullName)}
          </span>
          <div className="hidden max-w-40 leading-tight xl:block">
            <p className="truncate text-sm font-semibold">{staff.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[staff.role]}</p>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Đăng xuất"
              onClick={() => {
                usePosStore.getState().clearBill()
                signOutStaff()
                router.replace("/quan-ly/dang-nhap")
              }}
            >
              <LogOutIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Đăng xuất</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

function Clock() {
  const now = useNow(1_000)
  return (
    <div className="hidden min-w-[92px] flex-col items-end pr-1 leading-tight lg:flex" aria-live="off">
      <span className="tabular text-[15px] font-semibold">{now ? clockFmt.format(now) : "--:--:--"}</span>
      <span className="tabular text-[11px] text-muted-foreground">
        {now ? `${formatWeekday(now)}, ${formatDate(now)}` : " "}
      </span>
    </div>
  )
}

/** Admin: the register must sell for one concrete store. */
export function StorePicker({ value, onChange }: { value: string | null; onChange: (storeId: string) => void }) {
  const stores = useDb((s) => s.stores)
  const provinces = [...new Set(stores.map((s) => s.province))]
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-9 w-[250px] bg-white data-[size=default]:h-9",
          !value && "border-orange/60 ring-3 ring-orange/15",
        )}
        aria-label="Cửa hàng bán hàng"
      >
        <StoreIcon className="size-4 text-brand" />
        <SelectValue placeholder="Chọn cửa hàng để bán" />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-96">
        {provinces.map((province) => (
          <SelectGroup key={province}>
            <SelectLabel>{province}</SelectLabel>
            {stores
              .filter((s) => s.province === province)
              .map((s) => (
                <SelectItem key={s.id} value={s.id} disabled={s.status !== "active"}>
                  <span className="tabular font-medium">{s.code}</span> – {s.name}
                  {s.status !== "active" ? (
                    <span className="text-xs text-muted-foreground">({STORE_STATUS[s.status].label})</span>
                  ) : null}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
