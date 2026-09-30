"use client"

import { ChevronsUpDownIcon, ExternalLinkIcon, LogOutIcon, RotateCcwIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"

import { LogoMark, Wordmark } from "@/components/brand/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ADMIN_NAV, navItemFor } from "@/config/admin-nav"
import { initials } from "@/lib/format"
import { canView, ROLE_LABEL } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { signOutStaff, useCurrentStaff } from "@/stores/session"

function PendingOrdersBadge() {
  const { storeId } = useStoreScope()
  const count = useDb(
    (s) => s.orders.filter((o) => o.status === "pending" && (!storeId || o.storeId === storeId)).length,
  )
  if (!count) return null
  return <SidebarMenuBadge className="bg-orange text-white">{count}</SidebarMenuBadge>
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const staff = useCurrentStaff()
  const resetDemoData = useDb((s) => s.resetDemoData)
  const active = navItemFor(pathname)
  if (!staff) return null

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <Link href="/quan-ly" className="flex items-center gap-2.5 overflow-hidden">
          <LogoMark className="size-8" />
          <span className="flex flex-col group-data-[collapsible=icon]:hidden">
            <Wordmark className="text-2xl" />
            <span className="text-[11px] font-medium text-muted-foreground">Hệ thống quản lý</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="py-1">
        {ADMIN_NAV.map((group) => {
          const items = group.items.filter((item) => canView(staff.role, item.module))
          if (!items.length) return null
          return (
            <SidebarGroup key={group.label} className="py-1">
              {group.label !== "Tổng quan" ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active?.href === item.href} tooltip={item.title}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.module === "orders" ? <PendingOrdersBadge /> : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-brand text-xs font-semibold text-white">
                      {initials(staff.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">{staff.fullName}</span>
                    <span className="truncate text-xs text-muted-foreground">{ROLE_LABEL[staff.role]}</span>
                  </span>
                  <ChevronsUpDownIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-semibold">{staff.fullName}</div>
                  <div className="text-xs text-muted-foreground">{staff.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/" target="_blank">
                    <ExternalLinkIcon /> Xem cửa hàng online
                  </Link>
                </DropdownMenuItem>
                {staff.role === "admin" ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      resetDemoData()
                      toast.success("Đã tạo lại dữ liệu mẫu")
                    }}
                  >
                    <RotateCcwIcon /> Tạo lại dữ liệu mẫu
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    signOutStaff()
                    router.replace("/quan-ly/dang-nhap")
                  }}
                >
                  <LogOutIcon /> Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
