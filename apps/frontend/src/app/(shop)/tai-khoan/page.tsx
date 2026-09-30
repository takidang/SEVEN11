import type { Metadata } from "next"
import { Suspense } from "react"

import { AccountSkeleton, AccountView } from "./_components/account-view"

export const metadata: Metadata = {
  title: "Tài khoản",
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountView />
    </Suspense>
  )
}
