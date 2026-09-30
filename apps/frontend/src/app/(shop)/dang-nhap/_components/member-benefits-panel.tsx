import { ArrowRightIcon, BikeIcon, CakeIcon, CupSodaIcon, type LucideIcon, StarIcon } from "lucide-react"
import Link from "next/link"

import { Wordmark } from "@/components/brand/logo"
import { formatVND } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { STAR_REWARDS, STAR_SPEND } from "@/lib/stars"
import { cn } from "@/lib/utils"

const topReward = STAR_REWARDS[STAR_REWARDS.length - 1]

const PERKS: { icon: LucideIcon; text: string }[] = [
  { icon: CupSodaIcon, text: `Voucher đồ uống mỗi tháng, giảm đến ${formatVND(TIERS.diamond.drinkVoucher)} mỗi ly` },
  {
    icon: StarIcon,
    text: `Cứ ${formatVND(STAR_SPEND)} chi tiêu được 1 sao vàng, đổi voucher tới ${formatVND(topReward.value)}`,
  },
  {
    icon: CakeIcon,
    text: `Tháng sinh nhật giảm đến ${Math.round(TIERS.diamond.birthdayDrinkDiscount * 100)}% đồ uống`,
  },
  { icon: BikeIcon, text: "Giao nhanh 24 phút, lưu địa chỉ và theo dõi đơn theo thời gian thực" },
]

/** Desktop side panel on the sign-in page: why to join. Tier requirements live on /thanh-vien. */
export function MemberBenefitsPanel({ className }: { className?: string }) {
  return (
    <aside className={cn("relative flex-col overflow-hidden rounded-xl bg-brand p-8 text-white", className)}>
      <div className="absolute top-0 right-10 h-full w-3 bg-orange" aria-hidden />
      <div className="absolute top-0 right-5 h-full w-3 bg-red" aria-hidden />

      <div className="relative pr-10">
        <span className="inline-flex rounded-lg bg-white px-3 py-1.5">
          <Wordmark className="text-3xl" />
        </span>
        <h2 className="mt-6 text-[28px] leading-tight font-bold">Mua sắm – nâng hạng, ưu đãi mỗi ngày</h2>
        <p className="mt-2 text-sm leading-6 text-white/85">
          Đăng nhập để nhận ưu đãi thành viên, tích sao vàng đổi voucher và theo dõi đơn hàng.
        </p>
      </div>

      <ul className="relative mt-7 space-y-4 pr-10">
        {PERKS.map((perk) => (
          <li key={perk.text} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <perk.icon className="size-4.5" />
            </span>
            <span className="min-w-0 self-center text-sm leading-6">{perk.text}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-auto pt-8 pr-10">
        <Link
          href="/thanh-vien"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold transition hover:bg-white/25"
        >
          Xem chương trình thành viên <ArrowRightIcon className="size-4" />
        </Link>
        <p className="mt-4 text-xs leading-5 text-white/70">
          Có 4 hạng Đồng, Bạc, Vàng, Kim cương. Chi tiêu tích luỹ đủ mốc là lên hạng ngay.
        </p>
      </div>
    </aside>
  )
}
