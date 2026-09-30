import type { Metadata } from "next"
import { Suspense } from "react"

import { OrdersBoard } from "./_components/orders-board"

export const metadata: Metadata = {
  title: "Đơn hàng",
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersBoard />
    </Suspense>
  )
}
