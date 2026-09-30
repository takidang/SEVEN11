"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { registerNavigator } from "@/lib/navigation"
import { hydrateAll } from "@/stores/hydration"

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    registerNavigator((href) => router.push(href))
    hydrateAll()
  }, [router])

  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <Toaster theme="light" position="top-center" richColors closeButton />
    </TooltipProvider>
  )
}
