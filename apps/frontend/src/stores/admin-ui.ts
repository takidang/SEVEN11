"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { useCurrentStaff } from "./session"

interface AdminUiState {
  /** Admin's store filter: a store id, or "all" for the whole chain. */
  storeScope: string
  setStoreScope: (storeScope: string) => void
}

export const useAdminUi = create<AdminUiState>()(
  persist(
    (set) => ({
      storeScope: "all",
      setStoreScope: (storeScope) => set({ storeScope }),
    }),
    {
      name: "7eleven-admin-ui",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
)

/**
 * The store the back office is looking at.
 * - admin: whatever the header switcher says (`null` = whole chain)
 * - manager / cashier: always their own store
 */
export function useStoreScope(): { storeId: string | null; canSwitch: boolean; setStoreScope: (id: string) => void } {
  const staff = useCurrentStaff()
  const storeScope = useAdminUi((s) => s.storeScope)
  const setStoreScope = useAdminUi((s) => s.setStoreScope)
  if (!staff || staff.role !== "admin") {
    return { storeId: staff?.storeId ?? null, canSwitch: false, setStoreScope }
  }
  return { storeId: storeScope === "all" ? null : storeScope, canSwitch: true, setStoreScope }
}
