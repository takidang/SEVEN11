import type { Metadata } from "next"
import { Suspense } from "react"

import { OrderSkeleton, OrderView } from "./_components/order-view"

export async function generateMetadata({ params }: PageProps<"/don-hang/[code]">): Promise<Metadata> {
  const { code } = await params
  return { title: `Đơn hàng ${code.toUpperCase()}` }
}

export default function OrderTrackingPage() {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <OrderView />
    </Suspense>
  )
}
