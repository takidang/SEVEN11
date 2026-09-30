import type { Metadata } from "next"
import { Suspense } from "react"

import { SignInSkeleton, SignInView } from "./_components/sign-in-view"

export const metadata: Metadata = {
  title: "Đăng nhập / Đăng ký",
}

export default function CustomerSignInPage() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInView />
    </Suspense>
  )
}
