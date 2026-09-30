"use client"

import { ArrowDownRightIcon, ArrowUpRightIcon, UserRoundPlusIcon } from "lucide-react"

import { Panel } from "@/components/admin/page-header"
import { MembershipRules, TierBadge, TierLadder } from "@/components/shop/tier-ladder"
import { formatDate } from "@/lib/format"
import { TIER_ORDER, TIERS } from "@/lib/membership"
import { cn } from "@/lib/utils"
import type { Customer } from "@/types"

/** "Hạng thành viên" tab: every tier with its requirements, the rules, and this member's tier history. */
export function TierTab({ customer }: { customer: Customer }) {
  return (
    <div className="space-y-5">
      <Panel
        title="Các hạng thành viên"
        description="Chi tiêu tích luỹ đủ mốc là lên hạng ngay. Mỗi tháng cần chi tối thiểu một mức để giữ hạng."
      >
        <TierLadder current={customer.tier} tierSpend={customer.tierSpend} />
      </Panel>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Panel title="Cách tính hạng và sao vàng">
          <MembershipRules />
        </Panel>

        <Panel title="Lịch sử hạng" bodyClassName="p-0">
          <ol className="divide-y">
            {customer.tierHistory.map((change) => {
              const up = TIER_ORDER.indexOf(change.to) > TIER_ORDER.indexOf(change.from)
              const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon
              return (
                <li key={`${change.at}-${change.to}`} className="flex gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      up ? "bg-fresh-soft text-fresh" : "bg-orange-soft text-orange",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {up ? "Lên hạng" : "Xuống hạng"} <TierBadge tier={change.to} />
                      <span className="text-xs font-normal text-muted-foreground">
                        từ hạng {TIERS[change.from].label}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{change.reason}</p>
                  </div>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">{formatDate(change.at)}</span>
                </li>
              )
            })}
            <li className="flex gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <UserRoundPlusIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Tham gia chương trình thành viên</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {customer.tierHistory.length
                    ? "Bắt đầu tích luỹ chi tiêu để lên hạng."
                    : `Bạn đang ở hạng ${TIERS[customer.tier].label} từ ${formatDate(customer.tierSince)}.`}
                </p>
              </div>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{formatDate(customer.joinedAt)}</span>
            </li>
          </ol>
        </Panel>
      </div>
    </div>
  )
}
