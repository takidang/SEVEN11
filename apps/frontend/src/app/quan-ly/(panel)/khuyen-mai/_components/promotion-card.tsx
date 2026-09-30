"use client"

import { CalendarRangeIcon, CopyIcon, PencilIcon, ShoppingBagIcon, StoreIcon, UsersRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/shop/product-image"
import { TierBadge } from "@/components/shop/tier-ladder"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { formatNumber } from "@/lib/format"
import { TIER_ORDER } from "@/lib/membership"
import { CHANNEL, PROMOTION_STATUS } from "@/lib/order-status"
import { isPromotionLive } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Category, Product, Promotion, PromotionStatus } from "@/types"

import { periodSummary, PROMOTION_TYPE, scopeSummary, valueSummary } from "./promotion-meta"

export function PromotionCard({
  promotion,
  status,
  now,
  categories,
  productMap,
  canManage,
  onEdit,
}: {
  promotion: Promotion
  /** Effective status (dates applied). */
  status: PromotionStatus
  now: Date
  categories: Category[]
  productMap: Map<string, Product>
  canManage: boolean
  onEdit: () => void
}) {
  const type = PROMOTION_TYPE[promotion.type]
  const badge = PROMOTION_STATUS[status]
  const period = periodSummary(promotion, status, now)
  const inWindow = promotion.type === "flash-sale" && status === "active" ? isPromotionLive(promotion, now) : null
  const limitReached = promotion.usageLimit !== undefined && promotion.usageCount >= promotion.usageLimit
  const photos = promotion.productIds
    .slice(0, 4)
    .map((id) => productMap.get(id))
    .filter((p): p is Product => !!p)
  const tiers = TIER_ORDER.filter((t) => promotion.tiers.includes(t))

  const toggle = (on: boolean) => {
    useDb.getState().setPromotionStatus(promotion.id, on ? "active" : "paused")
    if (on) toast.success(`Đã bật lại “${promotion.name}”`)
    else toast.success(`Đã tạm dừng “${promotion.name}”`)
  }

  const copyCode = async () => {
    if (!promotion.code) return
    try {
      await navigator.clipboard.writeText(promotion.code)
      toast.success(`Đã sao chép mã ${promotion.code}`)
    } catch {
      toast.error("Trình duyệt không cho phép sao chép, hãy chép mã thủ công")
    }
  }

  return (
    <article className={cn("flex flex-col rounded-xl bg-card ring-1 ring-border", status === "ended" && "bg-card/70")}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            promotion.type === "flash-sale" ? "bg-red-soft text-red" : "bg-brand-soft text-brand",
          )}
          aria-hidden
        >
          <type.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium text-foreground ring-1 ring-border ring-inset">
              {type.label}
            </span>
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            {inWindow !== null ? (
              <span className={cn("text-xs", inWindow ? "font-medium text-red" : "text-muted-foreground")}>
                {inWindow ? "Đang trong khung giờ" : "Ngoài khung giờ"}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-[15px] leading-snug font-semibold text-foreground">{promotion.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{promotion.description}</p>
        </div>
        {canManage ? (
          <label className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted-foreground">
            <Switch
              checked={promotion.status !== "paused"}
              onCheckedChange={toggle}
              disabled={status === "ended"}
              aria-label={promotion.status === "paused" ? `Bật lại ${promotion.name}` : `Tạm dừng ${promotion.name}`}
            />
            {status === "ended" ? "Đã hết hạn" : promotion.status === "paused" ? "Đang tắt" : "Đang bật"}
          </label>
        ) : null}
      </div>

      <div className="mx-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
        <p className="text-[15px] font-bold text-foreground">{valueSummary(promotion)}</p>
        {promotion.code ? (
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed border-brand/40 bg-card px-2 font-mono text-xs font-semibold tracking-wide text-brand-dark hover:bg-brand-soft"
            aria-label={`Sao chép mã ${promotion.code}`}
          >
            {promotion.code}
            <CopyIcon className="size-3.5" />
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Tự áp dụng, không cần mã</span>
        )}
      </div>

      <dl className="grid flex-1 gap-x-4 gap-y-2.5 px-4 py-3 text-sm sm:grid-cols-2">
        <MetaRow icon={ShoppingBagIcon} label="Áp dụng">
          <span className="flex min-w-0 items-center gap-2">
            {photos.length ? (
              <span className="flex shrink-0 -space-x-1.5">
                {photos.map((p) => (
                  <ProductImage
                    key={p.id}
                    src={p.image}
                    alt={p.name}
                    size={22}
                    className="size-5.5 rounded-full bg-white ring-2 ring-card"
                  />
                ))}
              </span>
            ) : null}
            <span className="truncate">{scopeSummary(promotion, categories)}</span>
          </span>
        </MetaRow>
        <MetaRow icon={UsersRoundIcon} label="Khách hàng">
          {tiers.length === TIER_ORDER.length ? (
            "Mọi hạng thành viên"
          ) : tiers.length ? (
            <span className="flex flex-wrap gap-1">
              {tiers.map((t) => (
                <TierBadge key={t} tier={t} className="px-2 text-[11px] whitespace-nowrap" />
              ))}
            </span>
          ) : (
            "Mọi khách hàng"
          )}
        </MetaRow>
        <MetaRow icon={StoreIcon} label="Kênh bán">
          {promotion.channels.map((c) => CHANNEL[c]).join(" · ")}
        </MetaRow>
        <MetaRow icon={CalendarRangeIcon} label="Thời gian">
          <span className="tabular">{period.range}</span>
          <span className="block text-xs text-muted-foreground">{period.hint}</span>
        </MetaRow>
      </dl>

      <div className="flex items-center gap-3 border-t px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Lượt dùng</span>
            <span className={cn("tabular font-medium", limitReached && "text-red")}>
              {formatNumber(promotion.usageCount)}
              {promotion.usageLimit !== undefined ? ` / ${formatNumber(promotion.usageLimit)}` : " · không giới hạn"}
            </span>
          </div>
          {promotion.usageLimit !== undefined ? (
            <Progress
              value={Math.min(100, (promotion.usageCount / Math.max(1, promotion.usageLimit)) * 100)}
              className={cn("mt-1.5 h-1.5", limitReached && "*:data-[slot=progress-indicator]:bg-red")}
              aria-label="Tỷ lệ lượt dùng"
            />
          ) : null}
        </div>
        {canManage ? (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon /> Sửa
          </Button>
        ) : null}
      </div>
    </article>
  )
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="min-w-0 text-foreground">{children}</dd>
      </div>
    </div>
  )
}
