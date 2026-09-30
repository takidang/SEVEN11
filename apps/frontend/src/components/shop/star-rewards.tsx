import { StarIcon, TicketPercentIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatVND } from "@/lib/format"
import { REWARD_VOUCHER_DAYS, STAR_REWARDS, type StarReward } from "@/lib/stars"
import { cn } from "@/lib/utils"

export function StarCount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", className)}>
      <StarIcon className="size-[1em] fill-amber-400 text-amber-500" aria-hidden />
      {value.toLocaleString("vi-VN")}
      <span className="sr-only"> sao vàng</span>
    </span>
  )
}

/**
 * The star → voucher catalog. Pass `stars` + `onRedeem` to show redeem buttons for a member;
 * without them it is a read-only price list.
 */
export function StarRewardGrid({
  stars,
  onRedeem,
  className,
}: {
  stars?: number
  onRedeem?: (reward: StarReward) => void
  className?: string
}) {
  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {STAR_REWARDS.map((reward) => {
        const missing = stars !== undefined ? Math.max(0, reward.stars - stars) : 0
        return (
          <li key={reward.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-border">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-orange-soft text-orange">
              <TicketPercentIcon className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Voucher {formatVND(reward.value)}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Đơn từ {formatVND(reward.minOrderValue)} · dùng trong {REWARD_VOUCHER_DAYS} ngày
              </p>
              <StarCount value={reward.stars} className="mt-0.5 text-sm text-amber-700" />
            </div>
            {onRedeem ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Button size="sm" disabled={missing > 0} onClick={() => onRedeem(reward)}>
                  Đổi
                </Button>
                {missing > 0 ? <span className="text-[11px] text-muted-foreground">Thiếu {missing} sao</span> : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
