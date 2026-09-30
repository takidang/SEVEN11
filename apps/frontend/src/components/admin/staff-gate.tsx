"use client"

import { ShieldAlertIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { navItemFor } from "@/config/admin-nav"
import { canView, homeFor, type Module, ROLE_LABEL } from "@/lib/permissions"
import { useDbReady, useHydrated } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"

export function FullPageLoader({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface">
      <LogoMark className="size-12" />
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {label}
      </span>
    </div>
  )
}

/**
 * Back-office guard: waits for local data and sends signed-out users to the login page.
 * With `checkModule` (default) it also blocks modules the role can't open; the panel
 * layout turns that off and uses <ModuleGate> inside the shell so the menu stays usable.
 * `module` defaults to the nav item that owns the current path.
 */
export function StaffGate({
  children,
  module,
  checkModule = true,
}: {
  children: React.ReactNode
  module?: Module
  checkModule?: boolean
}) {
  const hydrated = useHydrated()
  const dbReady = useDbReady()
  const staff = useCurrentStaff()
  const pathname = usePathname()
  const router = useRouter()

  const signedOut = hydrated && dbReady && !staff
  useEffect(() => {
    if (signedOut) router.replace(`/quan-ly/dang-nhap?next=${encodeURIComponent(pathname)}`)
  }, [signedOut, pathname, router])

  if (!hydrated || !dbReady || !staff) return <FullPageLoader />
  if (!checkModule) return <>{children}</>
  return <ModuleGate module={module}>{children}</ModuleGate>
}

/** Shows a "no access" state instead of `children` when the signed-in role can't view the module. */
export function ModuleGate({ children, module }: { children: React.ReactNode; module?: Module }) {
  const staff = useCurrentStaff()
  const pathname = usePathname()
  const required = module ?? navItemFor(pathname)?.module

  if (staff && required && !canView(staff.role, required)) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ShieldAlertIcon className="size-6" />
        </span>
        <h1 className="text-lg font-semibold">Bạn không có quyền xem trang này</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Vai trò <b>{ROLE_LABEL[staff.role]}</b> không được truy cập mục này. Liên hệ quản trị chuỗi nếu bạn cần quyền.
        </p>
        <Button asChild className="mt-2">
          <Link href={homeFor(staff.role)}>Về trang của tôi</Link>
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
