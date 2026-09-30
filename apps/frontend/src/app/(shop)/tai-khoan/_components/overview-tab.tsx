"use client"

import {
  CakeIcon,
  CopyIcon,
  CupSodaIcon,
  GiftIcon,
  type LucideIcon,
  PackageIcon,
  TicketPercentIcon,
  TruckIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { toast } from "sonner"

import { Panel } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { useCategories, usePromotions } from "@/hooks/use-catalog"
import { formatDate, formatVND } from "@/lib/format"
import { MAX_DRINK_VOUCHERS_PER_ORDER, TIERS } from "@/lib/membership"
import { FREE_SHIPPING_FROM, isPromotionLive } from "@/lib/pricing"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import type { Category, Customer, Promotion } from "@/types"

import { OrderList } from "./order-list"

function copyCode(code: string) {
  if (!navigator.clipboard) {
    toast.error(`Không sao chép được, hãy ghi lại mã ${code}`)
    return
  }
  navigator.clipboard
    .writeText(code)
    .then(() => toast.success(`Đã sao chép mã ${code}`, { description: "Dán mã ở bước đặt hàng để được giảm giá." }))
    .catch(() => toast.error(`Không sao chép được, hãy ghi lại mã ${code}`))
}

function voucherText(promotion: Promotion, customer: Customer, categories: Category[]) {
  const tier = TIERS[customer.tier]
  if (promotion.type === "member-voucher") {
    return {
      title: `Giảm ${formatVND(tier.drinkVoucher)} mỗi ly đồ uống`,
      condition: `Hạng ${tier.label} · tối đa ${MAX_DRINK_VOUCHERS_PER_ORDER} ly mỗi đơn`,
    }
  }
  const title =
    promotion.type === "percent"
      ? `Giảm ${promotion.value}%${promotion.maxDiscount ? `, tối đa ${formatVND(promotion.maxDiscount)}` : ""}`
      : `Giảm ${formatVND(promotion.value)}`
  const scope = promotion.categoryIds.length
    ? `Áp dụng cho ${promotion.categoryIds.map((id) => categories.find((c) => c.id === id)?.name ?? id).join(", ")}`
    : promotion.minOrderValue
      ? `Đơn từ ${formatVND(promotion.minOrderValue)}`
      : "Mọi đơn hàng"
  const tiers = promotion.tiers.length ? ` · hạng ${promotion.tiers.map((t) => TIERS[t].label).join(", ")}` : ""
  return { title, condition: `${scope}${tiers}` }
}

export function OverviewTab({ customer, onShowOrders }: { customer: Customer; onShowOrders: () => void }) {
  const now = useNow(60_000)
  const promotions = usePromotions()
  const categories = useCategories()
  const orders = useDb((s) => s.orders)
  const tier = TIERS[customer.tier]

  const recentOrders = useMemo(
    () => orders.filter((o) => o.customerId === customer.id).slice(0, 3),
    [orders, customer.id],
  )
  const vouchers = useMemo(() => {
    if (!now) return []
    return promotions.filter((p) => {
      if (!isPromotionLive(p, now, "online")) return false
      if (p.type === "member-voucher") return p.tiers.includes(customer.tier)
      if (p.ownerId) return p.ownerId === customer.id
      return !!p.code && (p.tiers.length === 0 || p.tiers.includes(customer.tier))
    })
  }, [promotions, now, customer.id, customer.tier])

  const birthdayMonth = customer.birthday ? Number(customer.birthday.slice(5, 7)) : null
  const isBirthdayMonth = !!now && birthdayMonth === now.getMonth() + 1
  const birthdayPercent = Math.round(tier.birthdayDrinkDiscount * 100)

  const benefits: { icon: LucideIcon; title: string; description: string }[] = [
    {
      icon: CupSodaIcon,
      title: `Giảm ${formatVND(tier.drinkVoucher)} mỗi ly đồ uống`,
      description: `${tier.vouchersPerMonth} voucher mỗi tháng, dùng tối đa ${MAX_DRINK_VOUCHERS_PER_ORDER} ly mỗi đơn`,
    },
    { icon: GiftIcon, title: tier.freeDrink, description: "Quyền lợi cơ bản của hạng thành viên" },
    {
      icon: CakeIcon,
      title: `Tháng sinh nhật giảm ${birthdayPercent}% đồ uống`,
      description: "Áp dụng khi mua từ 3 ly trong tháng sinh nhật",
    },
    {
      icon: TruckIcon,
      title: `Miễn phí giao hàng cho đơn từ ${formatVND(FREE_SHIPPING_FROM)}`,
      description: "Giao nhanh trong 24 phút từ cửa hàng gần bạn",
    },
  ]

  return (
    <div className="space-y-5">
      {isBirthdayMonth ? (
        <div className="flex items-center gap-3 rounded-xl bg-orange-soft p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-orange">
            <CakeIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Chúc mừng tháng sinh nhật của bạn!</p>
            <p className="mt-0.5 text-xs leading-5 text-foreground/75">
              Trong tháng {birthdayMonth}, thành viên hạng {tier.label} được giảm {birthdayPercent}% đồ uống khi mua từ
              3 ly.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Panel
          title={`Quyền lợi hạng ${tier.label}`}
          actions={
            <Link href="/thanh-vien" className="text-sm font-medium text-brand hover:underline">
              Tất cả hạng
            </Link>
          }
        >
          <ul className="space-y-3.5">
            {benefits.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <b.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{b.title}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{b.description}</p>
                </div>
              </li>
            ))}
          </ul>
          {!customer.birthday ? (
            <p className="mt-4 rounded-lg bg-muted/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Bạn chưa cập nhật ngày sinh – thêm ở mục{" "}
              <Link href="/tai-khoan?tab=thong-tin" className="font-medium text-brand hover:underline">
                Thông tin
              </Link>{" "}
              để nhận ưu đãi tháng sinh nhật.
            </p>
          ) : null}
        </Panel>

        <Panel title="Voucher dùng được ngay" description="Cho đơn đặt online, có hiệu lực hôm nay">
          {vouchers.length ? (
            <ul className="space-y-2.5">
              {vouchers.map((promotion) => {
                const text = voucherText(promotion, customer, categories)
                return (
                  <li
                    key={promotion.id}
                    className="flex items-center gap-3 rounded-lg border border-dashed border-orange/40 bg-orange-soft/40 p-3"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-orange ring-1 ring-orange/20">
                      <TicketPercentIcon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{text.title}</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {text.condition} · HSD {formatDate(promotion.endsAt)}
                      </p>
                    </div>
                    {promotion.code ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 bg-white font-semibold tracking-wide"
                        onClick={() => copyCode(promotion.code!)}
                        aria-label={`Sao chép mã ${promotion.code}`}
                      >
                        <CopyIcon /> {promotion.code}
                      </Button>
                    ) : (
                      <StatusBadge tone="fresh" className="shrink-0">
                        Tự động áp dụng
                      </StatusBadge>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Hiện chưa có voucher nào dành cho bạn. Quay lại sau nhé!
            </p>
          )}
        </Panel>
      </div>

      <Panel
        title="Đơn hàng gần đây"
        actions={
          recentOrders.length ? (
            <Button variant="ghost" size="sm" className="text-brand hover:text-brand" onClick={onShowOrders}>
              Xem tất cả
            </Button>
          ) : null
        }
        bodyClassName="p-0"
      >
        {recentOrders.length ? (
          <OrderList orders={recentOrders} />
        ) : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PackageIcon className="size-6" />
            </span>
            <p className="mt-3 text-sm text-muted-foreground">Bạn chưa có đơn hàng nào.</p>
            <Button asChild className="mt-4 h-9">
              <Link href="/">Mua sắm ngay</Link>
            </Button>
          </div>
        )}
      </Panel>
    </div>
  )
}
