"use client"

import { useEffect, useState } from "react"
import { create } from "zustand"

import { useAdminUi } from "./admin-ui"
import { useCart } from "./cart"
import { initDb, listenForOtherTabs, useDb } from "./db"
import { useSession } from "./session"

/**
 * Persisted stores skip automatic hydration so the server render and the first
 * client render match. <Providers> calls `hydrateAll()` once on mount.
 */
const useHydration = create<{ hydrated: boolean }>(() => ({ hydrated: false }))

let started = false

export function hydrateAll() {
  if (started) return
  started = true
  void Promise.all([
    useSession.persist.rehydrate(),
    useCart.persist.rehydrate(),
    useAdminUi.persist.rehydrate(),
  ]).finally(() => useHydration.setState({ hydrated: true }))
  void initDb().then(() => listenForOtherTabs())

  // Session / cart / admin preferences changed in another tab (localStorage "storage" event).
  const byKey: Record<string, { persist: { rehydrate: () => unknown } }> = {
    "7eleven-session": useSession,
    "7eleven-cart": useCart,
    "7eleven-admin-ui": useAdminUi,
  }
  window.addEventListener("storage", (event) => {
    if (event.key && byKey[event.key]) void byKey[event.key].persist.rehydrate()
  })
}

/** Session, cart and admin preferences are loaded from localStorage. */
export function useHydrated() {
  return useHydration((s) => s.hydrated)
}

/** The mock database is loaded (or seeded) and safe to read. */
export function useDbReady() {
  return useDb((s) => s.ready)
}

/** Current time, refreshed every `intervalMs`. `null` during SSR / first render. */
export function useNow(intervalMs = 30_000): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [intervalMs])
  return now
}
