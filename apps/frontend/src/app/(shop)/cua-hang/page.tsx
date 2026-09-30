import type { Metadata } from "next"

import { StoreDirectory } from "./_components/store-directory"

export const metadata: Metadata = {
  title: "Danh sách cửa hàng",
  description: "Hệ thống cửa hàng tại TP Hồ Chí Minh và Hà Nội: địa chỉ, số điện thoại, giờ mở cửa và chỉ đường.",
}

export default function StoresPage() {
  return <StoreDirectory />
}
