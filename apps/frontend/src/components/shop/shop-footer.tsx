import { BikeIcon, MailIcon, PhoneIcon } from "lucide-react"
import Link from "next/link"

import { Wordmark } from "@/components/brand/logo"

const COLUMNS = [
  {
    title: "Danh mục",
    links: [
      { href: "/cua-hang", label: "Danh sách cửa hàng" },
      { href: "/thanh-vien", label: "Chương trình thành viên" },
      { href: "/khuyen-mai", label: "Khuyến mãi & ưu đãi" },
      { href: "/tai-khoan?tab=don-hang", label: "Tra cứu đơn hàng" },
    ],
  },
  {
    title: "Dành cho nhân viên",
    links: [
      { href: "/quan-ly/dang-nhap", label: "Đăng nhập quản lý" },
      { href: "/quan-ly/ban-hang", label: "Bán hàng tại quầy" },
    ],
  },
]

export function ShopFooter() {
  return (
    <footer className="mt-10 border-t bg-surface">
      <div className="grid gap-8 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <div className="sm:col-span-2 lg:col-span-1">
          <Wordmark className="text-4xl" />
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-fresh">
            <BikeIcon className="size-4" /> Mở cửa 24 giờ, giao nhanh trong 24 phút
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-bold text-foreground">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-sm font-bold text-foreground">Liên hệ</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <PhoneIcon className="size-4" /> 1900 0711 (demo)
            </li>
            <li className="flex items-center gap-2">
              <MailIcon className="size-4" /> cskh@7eleven.demo
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t px-4 py-4 text-xs leading-5 text-muted-foreground lg:px-6">
        Đồ án môn học – hệ thống quản lý chuỗi cửa hàng tiện lợi, lấy cảm hứng từ 7-Eleven Việt Nam. Đây không phải
        website chính thức của 7-Eleven; hình ảnh sản phẩm dùng cho mục đích học tập.
      </div>
    </footer>
  )
}
