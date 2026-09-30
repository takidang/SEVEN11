"use client"

import {
  CakeIcon,
  CupSodaIcon,
  GiftIcon,
  HourglassIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  StarIcon,
  TicketPercentIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { StarRewardGrid } from "@/components/shop/star-rewards"
import { MembershipRules, TierLadder } from "@/components/shop/tier-ladder"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { useCategories } from "@/hooks/use-catalog"
import { formatCompactVND, formatNumber, formatVND } from "@/lib/format"
import { DRINK_CATEGORY_IDS, MAX_DRINK_VOUCHERS_PER_ORDER, TIER_ORDER, TIERS } from "@/lib/membership"
import { earnStars, REWARD_VOUCHER_DAYS, STAR_SPEND, STAR_VALID_MONTHS } from "@/lib/stars"
import { cn } from "@/lib/utils"
import { useDbReady, useHydrated } from "@/stores/hydration"
import { useCurrentCustomer } from "@/stores/session"
import type { Customer } from "@/types"

import { Headline } from "../../_components/headline"
import { MemberStatus, SIGN_UP_HREF, STARS_TAB_HREF, TIER_TAB_HREF } from "./member-status"

const tiers = TIER_ORDER.map((id) => TIERS[id])
const [LOWEST, HIGHEST] = [tiers[0], tiers[tiers.length - 1]]
const BEST_BIRTHDAY = Math.max(...tiers.map((t) => t.birthdayDrinkDiscount))

export function MembershipView() {
  const hydrated = useHydrated()
  const ready = useDbReady()
  const customer = useCurrentCustomer()
  const member = hydrated && ready ? customer : null

  return (
    <div className="space-y-10">
      <MembershipHero />
      <MemberStatus />
      <TiersSection member={member} />
      <RulesSection />
      <StarsSection signedIn={!!member} />
      <Faq />
      <BottomCta signedIn={!!member} />
    </div>
  )
}

function MembershipHero() {
  const highlights: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: CupSodaIcon, label: "Voucher đồ uống đến", value: `-${formatNumber(HIGHEST.drinkVoucher)} ₫/ly` },
    { icon: CakeIcon, label: "Tháng sinh nhật giảm đến", value: `${Math.round(BEST_BIRTHDAY * 100)}%` },
    { icon: GiftIcon, label: "Quà khách mới", value: "3 ly miễn phí" },
    { icon: StarIcon, label: "Tích sao vàng", value: `${formatCompactVND(STAR_SPEND)} = 1 sao` },
  ]

  return (
    <header className="relative isolate overflow-hidden rounded-2xl bg-orange px-5 py-7 text-white sm:px-8 sm:py-9">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 10%, rgb(255 255 255 / 0.35), transparent 40%), radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--red) 40%, transparent), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-20 -right-16 -z-10 size-80 rounded-full border-[18px] border-white/10"
      />

      <p className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold tracking-wide text-foreground uppercase">
        {tiers.length} hạng thành viên · Tích sao vàng
      </p>
      <Headline
        as="h1"
        className="mt-4 text-5xl drop-shadow-[0_3px_0_color-mix(in_srgb,var(--red)_55%,transparent)] sm:text-6xl"
      >
        Mua sắm – nâng hạng
      </Headline>
      <p className="mt-3 max-w-3xl text-sm text-white/95 sm:text-base">
        Chi tiêu đến đâu, lên hạng đến đó: {tiers.map((t) => t.label).join(", ")} với voucher đồ uống mỗi tháng, ưu đãi
        tháng sinh nhật và ly nước miễn phí. Cứ {formatVND(STAR_SPEND)} chi tiêu lại được 1 sao vàng để đổi voucher.
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {highlights.map((h) => (
          <li key={h.label} className="flex flex-col items-start gap-2 rounded-xl bg-white p-3 text-foreground sm:p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
              <h.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-muted-foreground">{h.label}</span>
              <Headline as="span" className="block text-xl text-brand sm:text-3xl">
                {h.value}
              </Headline>
            </span>
          </li>
        ))}
      </ul>
    </header>
  )
}

function TiersSection({ member }: { member: Customer | null }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Hạng thành viên và quyền lợi</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Chi tiêu tích luỹ đạt mốc là lên hạng ngay. Từ hạng {TIERS.silver.label}, mỗi hạng cần một mức chi tối thiểu
          mỗi tháng để giữ hạng.
        </p>
      </div>
      <TierLadder current={member?.tier} tierSpend={member?.tierSpend} />
    </section>
  )
}

function RulesSection() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Thể lệ chương trình</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Áp dụng cho đơn đặt online và đơn mua tại cửa hàng khi bạn đăng nhập hoặc đọc số điện thoại cho thu ngân.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <MembershipRules className="rounded-xl p-4 ring-1 ring-border sm:p-5" />
        <KeepExample />
      </div>
    </section>
  )
}

/** A worked example of upgrading, keeping and dropping a tier (numbers come from TIERS). */
function KeepExample() {
  const { gold, silver } = TIERS
  const steps: { icon: LucideIcon; tone: string; month: string; text: string }[] = [
    {
      icon: TrendingUpIcon,
      tone: "bg-brand-soft text-brand",
      month: "Tháng 3",
      text: `chi tiêu tích luỹ đạt ${formatVND(gold.minSpend)}, lên hạng ${gold.label} ngay. Tháng này không bị xét giữ hạng.`,
    },
    {
      icon: ShieldCheckIcon,
      tone: "bg-fresh-soft text-fresh",
      month: "Tháng 4",
      text: `chi ${formatVND(gold.keepPerMonth + 50_000)}, đủ mức ${formatVND(gold.keepPerMonth)} nên ngày 01/05 vẫn giữ hạng ${gold.label}.`,
    },
    {
      icon: TrendingDownIcon,
      tone: "bg-warning-soft text-warning",
      month: "Tháng 5",
      text: `chỉ chi ${formatVND(gold.keepPerMonth - 50_000)} nên ngày 01/06 xuống hạng ${silver.label}, chi tiêu tích luỹ về ${formatVND(silver.minSpend)}. Chi thêm ${formatVND(gold.minSpend - silver.minSpend)} là lên lại ${gold.label}.`,
    },
  ]

  return (
    <div className="rounded-xl bg-surface/70 p-4 sm:p-5">
      <h3 className="text-[15px] font-semibold text-foreground">Ví dụ với hạng {gold.label}</h3>
      <ol className="mt-3 space-y-3">
        {steps.map((step) => (
          <li key={step.month} className="flex gap-3">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", step.tone)}>
              <step.icon className="size-4" />
            </span>
            <p className="min-w-0 pt-1 text-sm leading-6 text-foreground/85">
              <span className="font-semibold text-foreground">{step.month}:</span> {step.text}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StarsSection({ signedIn }: { signedIn: boolean }) {
  const sample = 100_000
  const earned = earnStars(0, sample)
  const facts: { icon: LucideIcon; title: string; text: string }[] = [
    {
      icon: ReceiptTextIcon,
      title: `${formatVND(STAR_SPEND)} = 1 sao`,
      text: `Phần lẻ được cộng dồn sang đơn sau. Ví dụ đơn ${formatVND(sample)} được ${earned.stars} sao, ${formatVND(earned.carry)} còn lại tính tiếp cho đơn kế.`,
    },
    {
      icon: HourglassIcon,
      title: `Sao có hạn ${STAR_VALID_MONTHS} tháng`,
      text: "Tính từ ngày nhận, sao nhận trước được dùng trước. Đơn bị huỷ sẽ bị trừ lại số sao đã cộng.",
    },
    {
      icon: TicketPercentIcon,
      title: "Đổi sao lấy voucher",
      text: `Voucher dùng trong ${REWARD_VOUCHER_DAYS} ngày, cho đơn online và tại cửa hàng. Đổi sao không làm giảm chi tiêu xét hạng.`,
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <StarIcon className="size-5 fill-amber-400 text-amber-500" />
            Sao vàng
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mua sắm là có sao: chi tiêu càng nhiều, sao càng nhiều, dùng sao đổi voucher giảm giá cho đơn sau.
          </p>
        </div>
        {signedIn ? (
          <Link href={STARS_TAB_HREF} className="text-sm font-medium text-brand hover:underline">
            Đổi sao của bạn
          </Link>
        ) : null}
      </div>

      <ul className="grid gap-3 md:grid-cols-3">
        {facts.map((fact) => (
          <li key={fact.title} className="flex gap-3 rounded-xl bg-surface/70 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
              <fact.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{fact.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{fact.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3">
        <h3 className="text-[15px] font-semibold text-foreground">Bảng đổi sao</h3>
        <StarRewardGrid />
      </div>
    </section>
  )
}

function Faq() {
  const categories = useCategories()
  const drinkNames = categories
    .filter((c) => DRINK_CATEGORY_IDS.includes(c.id))
    .map((c) => c.name)
    .join(", ")
  const { gold } = TIERS

  const faqs = [
    {
      q: "Hạng thành viên được cập nhật khi nào?",
      a: "Lên hạng ngay khi một đơn hàng đưa chi tiêu tích luỹ chạm mốc của hạng trên. Việc giữ hạng được xét vào ngày 1 hằng tháng, dựa trên chi tiêu của tháng liền trước.",
    },
    {
      q: "Chi tiêu tích luỹ và chi tiêu mỗi tháng khác nhau thế nào?",
      a: `Chi tiêu tích luỹ cộng dồn qua các tháng và quyết định bạn lên hạng nào. Chi tiêu mỗi tháng chỉ dùng để xét giữ hạng. Ví dụ hạng ${gold.label} cần tích luỹ từ ${formatVND(gold.minSpend)} và chi tối thiểu ${formatVND(gold.keepPerMonth)} mỗi tháng.`,
    },
    {
      q: "Voucher đồ uống dùng như thế nào?",
      a: `Voucher tự áp dụng khi giỏ hàng có đồ uống thuộc nhóm ${drinkNames}: giảm ${formatVND(LOWEST.drinkVoucher)} đến ${formatVND(HIGHEST.drinkVoucher)} mỗi ly tuỳ hạng, tối đa ${MAX_DRINK_VOUCHERS_PER_ORDER} ly mỗi đơn.`,
    },
    {
      q: "Đơn mua tại cửa hàng có được cộng chi tiêu và sao vàng không?",
      a: "Có. Đơn online và đơn mua tại cửa hàng đều được cộng khi bạn đăng nhập hoặc đọc số điện thoại cho thu ngân. Đơn bị huỷ sẽ bị trừ lại cả chi tiêu lẫn sao.",
    },
  ]

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-foreground">Câu hỏi thường gặp</h2>
      <Accordion type="single" collapsible className="rounded-xl px-4 ring-1 ring-border">
        {faqs.map((faq) => (
          <AccordionItem key={faq.q} value={faq.q}>
            <AccordionTrigger className="py-3.5 text-[15px] hover:no-underline">{faq.q}</AccordionTrigger>
            <AccordionContent className="pb-4 text-muted-foreground">{faq.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

function BottomCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl bg-brand p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div>
        <Headline as="h2" className="text-3xl text-balance">
          {signedIn ? "Theo dõi hạng và sao vàng" : "Trở thành thành viên ngay"}
        </Headline>
        <p className="mt-2 max-w-xl text-sm text-white/90">
          {signedIn
            ? "Xem lịch sử lên, xuống hạng, đổi sao lấy voucher và các voucher của bạn trong tài khoản."
            : `Đăng ký bằng số điện thoại, xác minh một lần qua mã OTP. Thành viên mới nhận ngay hạng ${TIERS.bronze.label}. ${TIERS.bronze.freeDrink}.`}
        </p>
      </div>
      <Button asChild className="h-11 bg-white px-5 text-[15px] font-semibold text-brand hover:bg-white/90">
        <Link href={signedIn ? TIER_TAB_HREF : SIGN_UP_HREF}>{signedIn ? "Xem hạng của tôi" : "Đăng ký miễn phí"}</Link>
      </Button>
    </section>
  )
}
