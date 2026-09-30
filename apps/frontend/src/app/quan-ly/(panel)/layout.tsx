"use client"

import { AdminHeader } from "@/components/admin/admin-header"
import { AppSidebar } from "@/components/admin/app-sidebar"
import { ModuleGate, StaffGate } from "@/components/admin/staff-gate"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/** Back-office frame: collapsible sidebar + header, grey canvas for white panels. */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGate checkModule={false}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-surface">
          <AdminHeader />
          <div className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">
            <ModuleGate>{children}</ModuleGate>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </StaffGate>
  )
}
