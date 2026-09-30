"use client"

import { CheckIcon, CopyIcon, StarIcon, TicketPercentIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Panel } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { StarCount, StarRewardGrid } from "@/components/shop/star-rewards"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useMyVouchers, useStarHistory } from "@/hooks/use-membership"
import { formatDate, formatDateTime, formatVND } from "@/lib/format"
import { navigate } from "@/lib/navigation"
import { effectiveStatus } from "@/lib/pricing"
import { REWARD_VOUCHER_DAYS, STAR_SPEND, STAR_VALID_MONTHS, type StarReward, spendToNextStar } from "@/lib/stars"
import { cn } from "@/lib/utils"
import { useCart } from "@/stores/cart"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import type { Customer, Promotion } from "@/types"

const HISTORY_PAGE = 15

/** "Sao vàng" tab: balance, redeem stars for vouchers, the member's vouchers and star history. */
export function StarsTab({ customer }: { customer: Customer }) {
  const [confirming, setConfirming] = useState<StarReward | null>(null)
  const toNext = spendToNextStar(customer.starCarry)

  const redeem = (reward: StarReward) => {
    const result = useDb.getState().redeemStars(customer.id, reward.id)
    setConfirming(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Đã đổi voucher ${formatVND(reward.value)}`, {
      description: `Mã ${result.voucher.code} đã vào mục Voucher của tôi, dùng trong ${REWARD_VOUCHER_DAYS} ngày.`,
    })
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-xl bg-card p-5 ring-1 ring-border md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
        <div>
          <p className="text-sm text-muted-foreground">Sao vàng đang có</p>
          <StarCount value={customer.stars} className="mt-1 text-4xl font-bold" />
          <p className="mt-2 text-sm text-muted-foreground">
            Cứ {formatVND(STAR_SPEND)} chi tiêu được 1 sao · sao có hạn {STAR_VALID_MONTHS} tháng
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/70">
          <p className="text-sm">
            Chi tiêu thêm <span className="font-semibold">{formatVND(toNext)}</span> để nhận sao tiếp theo
          </p>
          <Progress
            value={(customer.starCarry / STAR_SPEND) * 100}
            className="mt-2 h-1.5 bg-white [&_[data-slot=progress-indicator]]:bg-amber-500"
            aria-label="Tiến độ tới sao tiếp theo"
          />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Tính theo số tiền thực trả sau giảm giá, không gồm đồ uống có cồn. Phần lẻ được cộng dồn sang đơn sau.
          </p>
        </div>
      </section>

      <Panel
        title="Đổi sao lấy voucher"
        description="Voucher đổi xong nằm trong mục Voucher của tôi, mỗi đơn dùng 1 voucher."
      >
        <StarRewardGrid stars={customer.stars} onRedeem={setConfirming} />
      </Panel>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <MyVouchers customerId={customer.id} />
        <StarHistory customerId={customer.id} />
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          {confirming ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Đổi {confirming.stars} sao lấy voucher {formatVND(confirming.value)}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Voucher dùng cho đơn từ {formatVND(confirming.minOrderValue)}, trong {REWARD_VOUCHER_DAYS} ngày. Sau
                  khi đổi bạn còn {customer.stars - confirming.stars} sao.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Để sau</AlertDialogCancel>
                <AlertDialogAction onClick={() => redeem(confirming)}>Đổi sao</AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function voucherState(voucher: Promotion, now: Date) {
  if (voucher.usageLimit !== undefined && voucher.usageCount >= voucher.usageLimit) {
    return { label: "Đã dùng", tone: "neutral" as const, usable: false }
  }
  if (effectiveStatus(voucher, now) === "ended") return { label: "Hết hạn", tone: "neutral" as const, usable: false }
  return { label: "Còn hạn", tone: "fresh" as const, usable: true }
}

function MyVouchers({ customerId }: { customerId: string }) {
  const vouchers = useMyVouchers(customerId)
  const now = useNow(60_000)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
      toast.success(`Đã sao chép mã ${code}`)
    } catch {
      toast.error(`Không sao chép được, bạn ghi lại mã ${code} nhé`)
    }
  }

  const use = (code: string) => {
    useCart.getState().setPromoCode(code)
    toast.success(`Đã gắn voucher ${code} vào giỏ hàng`, {
      description: "Voucher được kiểm tra điều kiện khi bạn đặt hàng.",
      action: { label: "Xem giỏ", onClick: () => navigate("/gio-hang") },
    })
  }

  return (
    <Panel title="Voucher của tôi" bodyClassName="p-0">
      {vouchers.length && now ? (
        <ul className="divide-y">
          {vouchers.map((v) => {
            const state = voucherState(v, now)
            return (
              <li key={v.id} className={cn("flex items-center gap-3 px-4 py-3", !state.usable && "opacity-70")}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-soft text-orange">
                  <TicketPercentIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    Giảm {formatVND(v.value)}
                    <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Đơn từ {formatVND(v.minOrderValue ?? 0)} · HSD {formatDate(v.endsAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => copy(v.code!)}
                    aria-label={`Sao chép mã ${v.code}`}
                    className="mt-1 inline-flex items-center gap-1.5 rounded border border-dashed border-brand/40 px-1.5 font-mono text-xs font-semibold tracking-wider text-brand-dark"
                  >
                    {v.code}
                    {copied === v.code ? (
                      <CheckIcon className="size-3.5 text-fresh" />
                    ) : (
                      <CopyIcon className="size-3.5" />
                    )}
                  </button>
                </div>
                {state.usable ? (
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => use(v.code!)}>
                    Dùng ngay
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">
          Chưa có voucher nào. Đổi sao vàng ở phía trên để nhận voucher giảm giá.
        </p>
      )}
    </Panel>
  )
}

function StarHistory({ customerId }: { customerId: string }) {
  const history = useStarHistory(customerId)
  const [shown, setShown] = useState(HISTORY_PAGE)

  return (
    <Panel title="Lịch sử sao vàng" bodyClassName="p-0">
      {history.length ? (
        <>
          <ul className="divide-y">
            {history.slice(0, shown).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    entry.delta > 0 ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground",
                  )}
                >
                  <StarIcon className={cn("size-4", entry.delta > 0 && "fill-amber-400")} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.note}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                </div>
                <span
                  className={cn(
                    "tabular shrink-0 text-sm font-semibold",
                    entry.delta > 0 ? "text-fresh" : "text-muted-foreground",
                  )}
                >
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </span>
              </li>
            ))}
          </ul>
          {history.length > shown ? (
            <div className="border-t p-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + HISTORY_PAGE)}>
                Xem thêm
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">
          Chưa có sao nào. Mỗi đơn hàng từ {formatVND(STAR_SPEND)} sẽ tích sao vàng.
        </p>
      )}
    </Panel>
  )
}
