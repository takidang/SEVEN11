"use client"

import { ScanBarcodeIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { navItemFor } from "@/config/admin-nav"
import { canView } from "@/lib/permissions"
import { useCurrentStaff } from "@/stores/session"

import { StoreSwitcher } from "./store-switcher"

export function AdminHeader() {
  const pathname = usePathname()
  const staff = useCurrentStaff()
  const item = navItemFor(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-white/95 px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <span className="truncate text-sm font-medium text-muted-foreground">{item?.title ?? "Quản lý"}</span>
      <div className="ml-auto flex items-center gap-2">
        <StoreSwitcher />
        {staff && canView(staff.role, "pos") ? (
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/quan-ly/ban-hang">
              <ScanBarcodeIcon /> Bán hàng
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  )
}
