import type { Metadata, Viewport } from "next"
import { Roboto, Roboto_Mono } from "next/font/google"

import { Providers } from "@/components/providers"

import "./globals.css"

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin", "vietnamese"],
  axes: ["wdth"],
  display: "swap",
})

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin", "vietnamese"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "7-Eleven – Mở cửa 24 giờ, giao hàng 24 phút",
    template: "%s · 7-Eleven",
  },
  description:
    "Đồ án quản lý chuỗi cửa hàng tiện lợi lấy cảm hứng từ 7-Eleven: đặt hàng online, bán tại quầy, tồn kho, khuyến mãi và báo cáo.",
}

export const viewport: Viewport = {
  themeColor: "#007350",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${roboto.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
