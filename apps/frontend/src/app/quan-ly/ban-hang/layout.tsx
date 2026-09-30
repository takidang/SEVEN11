"use client"

import { StaffGate } from "@/components/admin/staff-gate"

/** The POS runs full screen, without the back-office sidebar. */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <StaffGate module="pos">{children}</StaffGate>
}
