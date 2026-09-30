"use client"

import {
  CalendarClockIcon,
  CheckIcon,
  CopyIcon,
  CrownIcon,
  ReceiptTextIcon,
  TagIcon,
  TicketIcon,
  TicketPercentIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { useCategories, usePromotions } from "@/hooks/use-catalog"
import { formatCompactVND, formatDate, formatNumber, formatVND } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { navigate } from "@/lib/navigation"
import { effectiveStatus } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { useCart } from "@/stores/cart"
import { useHydrated } from "@/stores/hydration"
import { useCurrentCustomer } from "@/stores/session"
import type { Category, Customer, Promotion } from "@/types"

import { EmptyState } from "../../_components/empty-state"
import { Headline } from "../../_components/headline"

/** Online promo codes: the ones usable now, then the ones about to start. */
export function PromoCodes({ now }: { now: Date }) {
  const promotions = usePromotions()
  const categories = useCategories()
  const customer = useCurrentCustomer()
  const hydrated = useHydrated()

  const { active, scheduled } = useMemo(() => {
    // Personal vouchers (redeemed with gold stars) belong to one member: they live in the account, not here.
    const online = promotions.filter((p) => p.code && !p.ownerId && p.channels.includes("online"))
    return {
      active: online
        .filter((p) => effectiveStatus(p, now) === "active")
        .sort((a, b) => a.endsAt.localeCompare(b.endsAt)),
      scheduled: online
        .filter((p) => effectiveStatus(p, now) === "scheduled")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }
  }, [promotions, now])

  return (
    <section id="ma-giam-gia" className="scroll-mt-32 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <TicketPercentIcon className="size-5 text-brand" />
          Mã giảm giá
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Nhập mã ở bước đặt hàng, hoặc bấm “Dùng ngay” để gắn mã vào giỏ hàng. Mỗi đơn dùng một mã.
        </p>
      </div>

      {active.length || scheduled.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {[...active, ...scheduled].map((promo) => (
            <CodeTicket
              key={promo.id}
              promo={promo}
              categories={categories}
              customer={hydrated ? customer : null}
              signedInKnown={hydrated}
              upcoming={effectiveStatus(promo, now) === "scheduled"}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={TicketPercentIcon}
          title="Hiện chưa có mã giảm giá cho đơn online"
          description="Theo dõi flash sale và ưu đãi thành viên bên dưới nhé."
          className="rounded-xl bg-surface/60"
        />
      )}
    </section>
  )
}

/** Clipboard API, with the old textarea trick for non-secure origins (e.g. the dev server opened by LAN IP). */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement("textarea")
      area.value = text
      area.setAttribute("readonly", "")
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand("copy")
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

function valueLabel(promo: Promotion) {
  if (promo.type === "percent")
    return {
      big: `${promo.value}%`,
      small: promo.maxDiscount ? `tối đa ${formatCompactVND(promo.maxDiscount).toUpperCase()}` : null,
    }
  return { big: formatCompactVND(promo.value).toUpperCase(), small: null }
}

function CodeTicket({
  promo,
  categories,
  customer,
  signedInKnown,
  upcoming,
}: {
  promo: Promotion
  categories: Category[]
  customer: Customer | null
  signedInKnown: boolean
  upcoming: boolean
}) {
  const [copied, setCopied] = useState(false)
  const code = promo.code!
  const exhausted = promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit
  const value = valueLabel(promo)
  const tierLocked = promo.tiers.length > 0
  const tierMismatch = tierLocked && customer && !promo.tiers.includes(customer.tier)
  const categoryNames = promo.categoryIds
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((name): name is string => !!name)

  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success(`Đã sao chép mã ${code}`)
    } else {
      toast.error(`Không sao chép được, bạn ghi lại mã ${code} nhé`)
    }
  }

  const apply = () => {
    useCart.getState().setPromoCode(code)
    toast.success(`Đã gắn mã ${code} vào giỏ hàng`, {
      description: "Mã được kiểm tra điều kiện khi bạn đặt hàng.",
      action: { label: "Xem giỏ", onClick: () => navigate("/gio-hang") },
    })
  }

  const conditions: { icon: LucideIcon; content: React.ReactNode }[] = [
    {
      icon: ReceiptTextIcon,
      content: promo.minOrderValue
        ? `Đơn tối thiểu ${formatVND(promo.minOrderValue)}`
        : "Không yêu cầu giá trị tối thiểu",
    },
    {
      icon: CrownIcon,
      content: tierLocked ? (
        <span className="flex flex-wrap items-center gap-1">
          Hạng áp dụng:
          {promo.tiers.map((t) => (
            <span key={t} className={cn("rounded-full px-2 py-px text-xs font-medium", TIERS[t].className)}>
              {TIERS[t].label}
            </span>
          ))}
        </span>
      ) : (
        "Áp dụng cho mọi khách hàng"
      ),
    },
    {
      icon: TagIcon,
      content: categoryNames.length ? `Áp dụng cho ${categoryNames.join(", ")}` : "Áp dụng cho toàn bộ sản phẩm",
    },
    {
      icon: CalendarClockIcon,
      content: upcoming
        ? `Từ ${formatDate(promo.startsAt)} đến ${formatDate(promo.endsAt)}`
        : `Hạn dùng đến ${formatDate(promo.endsAt)}`,
    },
    {
      icon: TicketIcon,
      content:
        promo.usageLimit !== undefined
          ? exhausted
            ? "Đã hết lượt sử dụng"
            : `Còn ${formatNumber(promo.usageLimit - promo.usageCount)} lượt`
          : "Không giới hạn lượt dùng",
    },
  ]

  return (
    <article
      className={cn(
        "flex overflow-hidden rounded-xl bg-white ring-1 ring-border",
        (exhausted || upcoming) && "bg-surface/60",
      )}
    >
      {/* Ticket stub */}
      <div
        className={cn(
          "relative flex w-28 shrink-0 flex-col items-center justify-center gap-1 px-2 py-4 text-center sm:w-32",
          upcoming || exhausted ? "bg-muted text-muted-foreground" : "bg-brand text-white",
        )}
      >
        <span className="text-[11px] font-semibold tracking-wide uppercase opacity-90">Giảm</span>
        <Headline as="span" className="text-[34px]">
          {value.big}
        </Headline>
        {value.small ? <span className="text-[11px] font-medium opacity-90">{value.small}</span> : null}
        {/* Perforation notches */}
        <span aria-hidden className="absolute -top-2 -right-2 size-4 rounded-full bg-white ring-1 ring-border" />
        <span aria-hidden className="absolute -right-2 -bottom-2 size-4 rounded-full bg-white ring-1 ring-border" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 border-l border-dashed border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{promo.name}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{promo.description}</p>
          </div>
          {upcoming ? <StatusBadge tone="info">Sắp diễn ra</StatusBadge> : null}
          {exhausted ? <StatusBadge tone="neutral">Hết lượt</StatusBadge> : null}
        </div>

        <ul className="space-y-1.5 text-sm text-foreground/85">
          {conditions.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <c.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">{c.content}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
          <button
            type="button"
            onClick={copy}
            aria-label={`Sao chép mã ${code}`}
            className="group flex h-9 items-center gap-2 rounded-lg border border-dashed border-brand/50 bg-brand-soft px-3 font-mono text-sm font-semibold tracking-wider text-brand-dark transition hover:border-brand"
          >
            {code}
            {copied ? (
              <CheckIcon className="size-4 text-fresh" />
            ) : (
              <CopyIcon className="size-4 opacity-60 group-hover:opacity-100" />
            )}
          </button>
          {!upcoming && !exhausted ? (
            <Button variant="outline" className="h-9 px-3" onClick={apply} disabled={!!tierMismatch}>
              Dùng ngay
            </Button>
          ) : null}
          {signedInKnown && tierLocked && !customer && !upcoming ? (
            <Link href="/dang-nhap?next=/khuyen-mai" className="text-sm font-medium text-brand hover:underline">
              Đăng nhập để dùng mã thành viên
            </Link>
          ) : null}
          {tierMismatch && customer ? (
            <span className="text-sm text-muted-foreground">
              Hạng {TIERS[customer.tier].label} của bạn chưa áp dụng mã này
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
