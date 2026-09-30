import type { Metadata } from "next"

import { PromotionsView } from "./_components/promotions-view"

export const metadata: Metadata = {
  title: "Flash sale & khuyến mãi",
  description: "Khung giờ flash sale hôm nay, mã giảm giá cho đơn online, ưu đãi mua kèm và voucher thành viên.",
}

export default function PromotionsPage() {
  return <PromotionsView />
}
