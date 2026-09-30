import type { Metadata } from "next"

import { MembershipView } from "./_components/membership-view"

export const metadata: Metadata = {
  title: "Chương trình thành viên",
  description:
    "Mua sắm – nâng hạng: 4 hạng Đồng, Bạc, Vàng, Kim cương theo chi tiêu tích luỹ, giữ hạng mỗi tháng, tích sao vàng đổi voucher.",
}

export default function MembershipPage() {
  return <MembershipView />
}
