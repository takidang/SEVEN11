import {
  BadgePercentIcon,
  BarChart3Icon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PackageIcon,
  ScanBarcodeIcon,
  StoreIcon,
  TruckIcon,
  UserRoundCogIcon,
  UsersIcon,
  WarehouseIcon,
} from "lucide-react"

import type { Module } from "@/lib/permissions"

export interface AdminNavItem {
  title: string
  href: string
  icon: LucideIcon
  module: Module
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

/** Back-office navigation. Items a role can't view are hidden (see lib/permissions). */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Tổng quan",
    items: [{ title: "Tổng quan", href: "/quan-ly", icon: LayoutDashboardIcon, module: "dashboard" }],
  },
  {
    label: "Bán hàng",
    items: [
      { title: "Bán tại quầy", href: "/quan-ly/ban-hang", icon: ScanBarcodeIcon, module: "pos" },
      { title: "Đơn hàng", href: "/quan-ly/don-hang", icon: ClipboardListIcon, module: "orders" },
    ],
  },
  {
    label: "Hàng hoá",
    items: [
      { title: "Sản phẩm", href: "/quan-ly/san-pham", icon: PackageIcon, module: "products" },
      { title: "Tồn kho", href: "/quan-ly/kho", icon: WarehouseIcon, module: "inventory" },
      { title: "Nhập hàng", href: "/quan-ly/nhap-hang", icon: TruckIcon, module: "purchasing" },
      { title: "Nhà cung cấp", href: "/quan-ly/nha-cung-cap", icon: StoreIcon, module: "suppliers" },
    ],
  },
  {
    label: "Khách hàng",
    items: [
      { title: "Khách hàng", href: "/quan-ly/khach-hang", icon: UsersIcon, module: "customers" },
      { title: "Khuyến mãi", href: "/quan-ly/khuyen-mai", icon: BadgePercentIcon, module: "promotions" },
    ],
  },
  {
    label: "Vận hành",
    items: [
      { title: "Nhân viên & ca", href: "/quan-ly/nhan-vien", icon: UserRoundCogIcon, module: "employees" },
      { title: "Cửa hàng", href: "/quan-ly/cua-hang", icon: StoreIcon, module: "stores" },
      { title: "Báo cáo", href: "/quan-ly/bao-cao", icon: BarChart3Icon, module: "reports" },
    ],
  },
]

const ALL_ITEMS = ADMIN_NAV.flatMap((g) => g.items)

/** The nav item a pathname belongs to (longest matching prefix). */
export function navItemFor(pathname: string): AdminNavItem | null {
  let best: AdminNavItem | null = null
  for (const item of ALL_ITEMS) {
    const match =
      item.href === "/quan-ly"
        ? pathname === "/quan-ly"
        : pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (match && (!best || item.href.length > best.href.length)) best = item
  }
  return best
}
