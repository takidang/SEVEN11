import { Suspense } from "react"

import { AgeGateDialog } from "@/components/shop/age-gate"
import { ShopSidebar } from "@/components/shop/category-nav"
import { ShopFooter } from "@/components/shop/shop-footer"
import { ShopHeader } from "@/components/shop/shop-header"

/** Storefront frame: sticky header, category rail on desktop, content + footer. */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <ShopHeader />
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-16 no-scrollbar hidden h-[calc(100dvh-4rem)] w-[256px] shrink-0 overflow-y-auto border-r border-border/80 lg:block">
          <Suspense>
            <ShopSidebar />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-[70dvh] flex-1 px-4 py-4 lg:px-5">{children}</main>
          <ShopFooter />
        </div>
      </div>
      <AgeGateDialog />
    </div>
  )
}
