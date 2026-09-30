"use client"

import {
  ChevronDownIcon,
  LogOutIcon,
  MapPinIcon,
  MenuIcon,
  PackageIcon,
  SearchIcon,
  ShoppingBagIcon,
  StarIcon,
  UserIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { LogoMark } from "@/components/brand/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { initials } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { cn } from "@/lib/utils"
import { useCart, useCartCount } from "@/stores/cart"
import { useHydrated } from "@/stores/hydration"
import { signOutCustomer, useCurrentCustomer } from "@/stores/session"

import { AddressDialog } from "./address-dialog"
import { CategoryNav } from "./category-nav"
import { StarCount } from "./star-rewards"

const SEARCH_PLACEHOLDER = "Tìm gì cũng có, mở cửa 24 giờ, giao hàng 24 phút"

function DeliverTo({ onClick, className }: { onClick: () => void; className?: string }) {
  const address = useCart((s) => s.deliveryAddress)
  const hydrated = useHydrated()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("group flex min-w-0 flex-col items-start text-left", className)}
    >
      <span className="text-xs font-semibold text-foreground">Giao đến:</span>
      <span className="flex max-w-full min-w-0 items-center gap-1 text-[13px] font-bold text-foreground group-hover:text-brand">
        <MapPinIcon className="size-[18px] shrink-0 text-orange" />
        <span className="truncate">
          {hydrated && address ? `${address.line}, ${address.ward}` : "Nhập địa chỉ giao hàng"}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </span>
    </button>
  )
}

function SearchBox({ className }: { className?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get("q") ?? "")
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        if (q) router.push(`/tim-kiem?q=${encodeURIComponent(q)}`)
      }}
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={SEARCH_PLACEHOLDER}
        aria-label="Tìm sản phẩm"
        className="h-10 w-full rounded-full bg-muted/70 pr-4 pl-12 text-sm text-foreground ring-1 ring-border outline-none placeholder:text-muted-foreground/80 focus:bg-white focus:ring-2 focus:ring-brand/40 md:h-11"
      />
    </form>
  )
}

function CartButton() {
  const count = useCartCount()
  const hydrated = useHydrated()
  return (
    <Link
      href="/gio-hang"
      aria-label={`Giỏ hàng${hydrated && count ? `, ${count} sản phẩm` : ""}`}
      className="relative flex size-10 items-center justify-center rounded-full bg-muted/70 text-foreground transition hover:bg-brand-soft hover:text-brand md:size-11"
    >
      <ShoppingBagIcon className="size-5" />
      {hydrated && count > 0 ? (
        <span className="tabular absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1 text-[11px] font-bold text-white ring-2 ring-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  )
}

function AccountButton() {
  const customer = useCurrentCustomer()
  const hydrated = useHydrated()
  const router = useRouter()

  if (!hydrated || !customer) {
    return (
      <Link
        href="/dang-nhap"
        aria-label="Đăng nhập"
        className="flex size-10 items-center justify-center rounded-full bg-muted/70 text-foreground transition hover:bg-brand-soft hover:text-brand md:size-11"
      >
        <UserIcon className="size-5" />
      </Link>
    )
  }

  const tier = TIERS[customer.tier]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-brand/40 xl:pr-3">
        <Avatar className="size-9 md:size-10">
          <AvatarFallback className="bg-brand text-sm font-semibold text-white">
            {initials(customer.fullName)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start xl:flex">
          <span className="max-w-32 truncate text-sm font-semibold">{customer.fullName}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Hạng {tier.label} · <StarCount value={customer.stars} className="text-amber-700" />
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold">{customer.fullName}</div>
          <div className="text-xs text-muted-foreground">{customer.phone}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/tai-khoan")}>
          <UserIcon /> Tài khoản & hạng thành viên
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/tai-khoan?tab=sao-vang")}>
          <StarIcon /> Sao vàng & đổi voucher
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/tai-khoan?tab=don-hang")}>
          <PackageIcon /> Đơn hàng của tôi
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOutCustomer()}>
          <LogOutIcon /> Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ShopHeader() {
  const [addressOpen, setAddressOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-2 md:flex-row md:items-center md:gap-4 md:py-0 lg:h-16 lg:px-5">
        <div className="flex items-center gap-2.5 md:w-auto lg:w-[252px] lg:shrink-0">
          <Link href="/" aria-label="Trang chủ" className="hidden md:block">
            <LogoMark className="size-10" />
          </Link>
          <DeliverTo onClick={() => setAddressOpen(true)} className="min-w-0 flex-1" />
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              aria-label="Mở danh mục"
              onClick={() => setMenuOpen(true)}
              className="flex size-10 items-center justify-center rounded-full bg-muted/70"
            >
              <MenuIcon className="size-5" />
            </button>
            <CartButton />
            <AccountButton />
          </div>
        </div>

        <Suspense fallback={<div className="h-10 flex-1 rounded-full bg-muted/70 md:h-11" />}>
          <SearchBox className="md:flex-1" />
        </Suspense>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            aria-label="Mở danh mục"
            onClick={() => setMenuOpen(true)}
            className="flex size-11 items-center justify-center rounded-full bg-muted/70 lg:hidden"
          >
            <MenuIcon className="size-5" />
          </button>
          <CartButton />
          <AccountButton />
        </div>
      </div>

      <AddressDialog open={addressOpen} onOpenChange={setAddressOpen} />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[86%] gap-0 overflow-y-auto p-0 sm:max-w-sm">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              <LogoMark className="size-8" /> Danh mục
            </SheetTitle>
          </SheetHeader>
          <Suspense>
            <CategoryNav onNavigate={() => setMenuOpen(false)} />
          </Suspense>
          <div className="border-t px-4 py-4 text-sm">
            <Link href="/quan-ly/dang-nhap" className="font-medium text-brand hover:underline">
              Đăng nhập khu vực nhân viên →
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
