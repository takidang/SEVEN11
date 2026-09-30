import { CheckCircle2Icon } from "lucide-react"

import { formatCompactVND, formatVND } from "@/lib/format"
import { TIER_ORDER, TIERS } from "@/lib/membership"
import { STAR_SPEND, STAR_VALID_MONTHS } from "@/lib/stars"
import { cn } from "@/lib/utils"
import type { MemberTier } from "@/types"

export function TierBadge({ tier, className }: { tier: MemberTier; className?: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", TIERS[tier].className, className)}>
      {TIERS[tier].label}
    </span>
  )
}

/**
 * The four tiers as one comparison table: a column per tier, a row per benefit. Real loyalty
 * programmes are read this way — it beats four near-identical cards that only differ by a number.
 * With `current` + `tierSpend` the member's column is highlighted and the rest show what is missing.
 */
export function TierLadder({
  current,
  tierSpend,
  className,
}: {
  current?: MemberTier | null
  tierSpend?: number
  className?: string
}) {
  const currentRank = current ? TIER_ORDER.indexOf(current) : -1

  const rows: { label: string; value: (tier: (typeof TIERS)[MemberTier]) => string }[] = [
    {
      label: "Giữ hạng mỗi tháng",
      value: (t) => (t.keepPerMonth ? `Chi tối thiểu ${formatVND(t.keepPerMonth)}` : "Không cần duy trì"),
    },
    { label: "Giảm mỗi ly đồ uống", value: (t) => formatVND(t.drinkVoucher) },
    { label: "Voucher mỗi tháng", value: (t) => `${t.vouchersPerMonth} voucher` },
    { label: "Tháng sinh nhật", value: (t) => `Giảm ${Math.round(t.birthdayDrinkDiscount * 100)}% đồ uống` },
    { label: "Nước miễn phí", value: (t) => t.freeDrink },
  ]

  return (
    <div className={cn("overflow-x-auto rounded-xl ring-1 ring-border", className)}>
      <table className="w-full min-w-[720px] border-collapse bg-card text-left">
        <caption className="sr-only">So sánh quyền lợi bốn hạng thành viên</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-44 border-r border-border/70 bg-card px-4 py-3 align-bottom"
            >
              <span className="text-xs font-medium text-muted-foreground">Quyền lợi</span>
            </th>
            {TIER_ORDER.map((id, index) => {
              const tier = TIERS[id]
              const isCurrent = id === current
              const missing = tierSpend !== undefined ? Math.max(0, tier.minSpend - tierSpend) : 0
              return (
                <th
                  key={id}
                  scope="col"
                  className={cn("p-1.5 align-bottom", isCurrent && "bg-brand-soft/40")}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <div className={cn("rounded-lg px-3 py-2.5", tier.faceClassName)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] leading-tight font-black tracking-wide uppercase">{tier.label}</span>
                      {isCurrent ? (
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-foreground ring-1 ring-black/5">
                          Hạng của bạn
                        </span>
                      ) : currentRank >= 0 && index < currentRank ? (
                        <CheckCircle2Icon className="size-4 shrink-0 opacity-70" aria-label="Đã đạt" />
                      ) : currentRank >= 0 && missing > 0 ? (
                        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ring-1 ring-black/5">
                          Còn {formatCompactVND(missing)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 font-normal opacity-75">
                      {tier.minSpend ? `Tích luỹ từ ${formatVND(tier.minSpend)}` : "Ngay khi đăng ký"}
                    </p>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border/70">
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-border/70 bg-card px-4 py-3 text-[13px] leading-5 font-medium text-muted-foreground"
              >
                {row.label}
              </th>
              {TIER_ORDER.map((id) => (
                <td
                  key={id}
                  className={cn(
                    "px-3 py-3 text-[13px] leading-5",
                    id === current ? "bg-brand-soft/40 font-medium text-foreground" : "text-foreground/85",
                  )}
                >
                  {row.value(TIERS[id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The membership rules in plain words (tiers + gold stars). */
export function MembershipRules({ className }: { className?: string }) {
  const rules = [
    "Chi tiêu được tính là số tiền thực trả sau mọi giảm giá (mua 1.000.000 ₫ được giảm 500.000 ₫ thì tính 500.000 ₫), không tính đồ uống có cồn. Đơn bị huỷ sẽ bị trừ lại.",
    "Chi tiêu tích luỹ đạt mốc của hạng nào là lên hạng đó ngay, không phải chờ.",
    "Ngày 1 hằng tháng, hệ thống xét chi tiêu của tháng trước. Chưa đủ mức giữ hạng thì xuống 1 hạng, và chi tiêu tích luỹ trở về đúng mốc của hạng mới.",
    "Tháng vừa lên hạng không bị xét giữ hạng. Hạng Đồng không cần duy trì.",
    `Cứ ${formatVND(STAR_SPEND)} chi tiêu được 1 sao vàng, phần lẻ cộng dồn sang đơn sau. Sao có hạn ${STAR_VALID_MONTHS} tháng kể từ ngày nhận và dùng để đổi voucher.`,
  ]
  return (
    <ol className={cn("space-y-2.5 text-sm leading-6 text-foreground/85", className)}>
      {rules.map((rule, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
            {i + 1}
          </span>
          <span className="min-w-0">{rule}</span>
        </li>
      ))}
    </ol>
  )
}
