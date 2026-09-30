import type { Role } from "@/types"

/**
 * Role-based access for the back office. The backend must enforce the same
 * rules — the frontend only hides what a role can't use.
 */
export type Module =
  | "dashboard"
  | "pos"
  | "orders"
  | "products"
  | "inventory"
  | "purchasing"
  | "suppliers"
  | "customers"
  | "promotions"
  | "employees"
  | "stores"
  | "reports"

export type Access = "manage" | "view"

/** Sort order for staff lists: admins first, then managers, then cashiers. */
export const ROLE_ORDER: Record<Role, number> = { admin: 0, manager: 1, cashier: 2 }

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Quản trị chuỗi",
  manager: "Quản lý cửa hàng",
  cashier: "Thu ngân",
}

const MATRIX: Record<Role, Partial<Record<Module, Access>>> = {
  admin: {
    dashboard: "manage",
    pos: "manage",
    orders: "manage",
    products: "manage",
    inventory: "manage",
    purchasing: "manage",
    suppliers: "manage",
    customers: "manage",
    promotions: "manage",
    employees: "manage",
    stores: "manage",
    reports: "manage",
  },
  manager: {
    dashboard: "view",
    pos: "manage",
    orders: "manage",
    products: "view",
    inventory: "manage",
    purchasing: "manage",
    suppliers: "view",
    customers: "view",
    promotions: "view",
    employees: "manage",
    stores: "view",
    reports: "view",
  },
  cashier: {
    pos: "manage",
    orders: "manage",
    customers: "view",
  },
}

/** Access level for a module, or null if the role can't open it. */
export function accessOf(role: Role, module: Module): Access | null {
  return MATRIX[role][module] ?? null
}

export function canView(role: Role, module: Module): boolean {
  return accessOf(role, module) !== null
}

export function canManage(role: Role, module: Module): boolean {
  return accessOf(role, module) === "manage"
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  return role === "cashier" ? "/quan-ly/ban-hang" : "/quan-ly"
}
