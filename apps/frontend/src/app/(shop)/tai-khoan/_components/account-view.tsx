"use client"

import {
  CrownIcon,
  LayoutGridIcon,
  type LucideIcon,
  MapPinIcon,
  PackageIcon,
  StarIcon,
  UserRoundIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { StarCount } from "@/components/shop/star-rewards"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate, formatPhone, formatVND, initials } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { useDbReady, useHydrated } from "@/stores/hydration"
import { signOutCustomer, useCurrentCustomer } from "@/stores/session"
import type { Customer } from "@/types"

import { AddressesTab } from "./addresses-tab"
import { MemberCard } from "./member-card"
import { OrdersTab } from "./orders-tab"
import { OverviewTab } from "./overview-tab"
import { ProfileTab } from "./profile-tab"
import { StarsTab } from "./stars-tab"
import { TierTab } from "./tier-tab"

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "tong-quan", label: "Tổng quan", icon: LayoutGridIcon },
  { id: "hang", label: "Hạng thành viên", icon: CrownIcon },
  { id: "sao-vang", label: "Sao vàng", icon: StarIcon },
  { id: "don-hang", label: "Đơn hàng", icon: PackageIcon },
  { id: "dia-chi", label: "Địa chỉ", icon: MapPinIcon },
  { id: "thong-tin", label: "Thông tin", icon: UserRoundIcon },
]

export function AccountSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Đang tải tài khoản">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-60 w-full rounded-xl md:h-48" />
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

export function AccountView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get("tab")
  const tab = TABS.some((t) => t.id === requestedTab) ? requestedTab! : TABS[0].id
  const hydrated = useHydrated()
  const dbReady = useDbReady()
  const customer = useCurrentCustomer()
  const [signingOut, setSigningOut] = useState(false)
  const mustSignIn = hydrated && dbReady && !customer && !signingOut

  useEffect(() => {
    if (!mustSignIn) return
    const back = requestedTab ? `/tai-khoan?tab=${encodeURIComponent(requestedTab)}` : "/tai-khoan"
    router.replace(`/dang-nhap?next=${encodeURIComponent(back)}`)
  }, [mustSignIn, requestedTab, router])

  if (!hydrated || !dbReady || !customer) return <AccountSkeleton />

  // Tabs live in the URL; the History API keeps useSearchParams in sync without a navigation.
  const selectTab = (id: string) => window.history.replaceState(null, "", `/tai-khoan?tab=${id}`)

  const signOut = () => {
    setSigningOut(true)
    signOutCustomer()
    toast.success("Đã đăng xuất khỏi tài khoản")
    router.push("/")
  }

  return (
    <div className="space-y-5">
      <AccountHeader customer={customer} />
      <MemberCard customer={customer} onOpenTab={selectTab} />

      <Tabs value={tab} onValueChange={selectTab} className="gap-4">
        <div className="-mx-4 no-scrollbar overflow-x-auto border-b px-4 lg:mx-0 lg:px-0">
          <TabsList variant="line" className="gap-0 p-0 group-data-horizontal/tabs:h-11">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-11 flex-none px-3 text-[15px] after:bg-brand group-data-horizontal/tabs:after:bottom-0 sm:px-4 data-active:text-brand data-active:hover:text-brand"
              >
                <t.icon className="hidden sm:block" />
                {t.label}
                {t.id === "don-hang" ? <ActiveOrdersCount customerId={customer.id} /> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="tong-quan">
          <OverviewTab customer={customer} onShowOrders={() => selectTab("don-hang")} />
        </TabsContent>
        <TabsContent value="hang">
          <TierTab customer={customer} />
        </TabsContent>
        <TabsContent value="sao-vang">
          <StarsTab customer={customer} />
        </TabsContent>
        <TabsContent value="don-hang">
          <OrdersTab customer={customer} />
        </TabsContent>
        <TabsContent value="dia-chi">
          <AddressesTab customer={customer} />
        </TabsContent>
        <TabsContent value="thong-tin">
          <ProfileTab key={customer.id} customer={customer} onSignOut={signOut} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AccountHeader({ customer }: { customer: Customer }) {
  const tier = TIERS[customer.tier]
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Avatar className="size-14 after:border-0">
          <AvatarFallback className="bg-brand text-lg font-semibold text-white">
            {initials(customer.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-xl font-bold md:text-2xl">{customer.fullName}</h1>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", tier.className)}>{tier.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="tabular whitespace-nowrap">{formatPhone(customer.phone)}</span> ·{" "}
            <span className="whitespace-nowrap">Thành viên từ {formatDate(customer.joinedAt).slice(3)}</span>
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-4 rounded-xl bg-muted/60 px-4 py-3 text-sm whitespace-nowrap sm:flex sm:gap-6 sm:bg-transparent sm:p-0">
        <div>
          <dt className="text-xs text-muted-foreground">Đơn đã mua</dt>
          <dd className="tabular text-lg font-bold">{customer.orderCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tổng chi tiêu</dt>
          <dd className="tabular text-lg font-bold">{formatVND(customer.totalSpent)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sao vàng</dt>
          <dd className="text-lg font-bold">
            <StarCount value={customer.stars} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

/** Small counter of orders still in progress, next to the "Đơn hàng" tab label. */
function ActiveOrdersCount({ customerId }: { customerId: string }) {
  const orders = useDb((s) => s.orders)
  const count = useMemo(
    () =>
      orders.filter((o) => o.customerId === customerId && o.status !== "completed" && o.status !== "cancelled").length,
    [orders, customerId],
  )
  if (!count) return null
  return (
    <span
      className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1.5 text-[11px] font-bold text-white"
      aria-label={`${count} đơn đang xử lý`}
    >
      {count}
    </span>
  )
}
