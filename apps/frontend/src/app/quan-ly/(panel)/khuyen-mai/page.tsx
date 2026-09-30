"use client"

import { BadgePercentIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { PageHeader } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCategories, useProductMap } from "@/hooks/use-catalog"
import { formatNumber, normalizeText } from "@/lib/format"
import { PROMOTION_STATUS } from "@/lib/order-status"
import { canManage } from "@/lib/permissions"
import { effectiveStatus } from "@/lib/pricing"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"
import type { Promotion, PromotionStatus, PromotionType } from "@/types"

import { PromotionCard } from "./_components/promotion-card"
import { type PromotionEditorState, PromotionFormSheet } from "./_components/promotion-form-sheet"
import { PROMOTION_TYPE, STATUS_ORDER, TYPE_ORDER } from "./_components/promotion-meta"

type Tab = PromotionStatus | "all"

const TABS: Tab[] = ["active", "scheduled", "paused", "ended", "all"]

/** Most relevant first: what ends soonest while running, what starts soonest when upcoming… */
function compareWithin(status: PromotionStatus) {
  return (a: Promotion, b: Promotion) => {
    switch (status) {
      case "scheduled":
        return a.startsAt.localeCompare(b.startsAt)
      case "ended":
        return b.endsAt.localeCompare(a.endsAt)
      default:
        return a.endsAt.localeCompare(b.endsAt)
    }
  }
}

export default function PromotionsPage() {
  const now = useNow(30_000)
  const staff = useCurrentStaff()
  const promotions = useDb((s) => s.promotions)
  const categories = useCategories()
  const productMap = useProductMap()

  const [tab, setTab] = useState<Tab>("active")
  const [query, setQuery] = useState("")
  const [type, setType] = useState<PromotionType | "all">("all")
  const [editor, setEditor] = useState<PromotionEditorState>(null)

  // Personal vouchers (a member redeemed them with gold stars) are not chain programs: they live
  // in that member's customer sheet, so they stay out of this list and its counts.
  const withStatus = useMemo(
    () =>
      now ? promotions.filter((p) => !p.ownerId).map((p) => ({ promotion: p, status: effectiveStatus(p, now) })) : [],
    [promotions, now],
  )

  const filtered = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    return withStatus.filter(({ promotion: p }) => {
      if (type !== "all" && p.type !== type) return false
      const haystack = normalizeText(`${p.name} ${p.code ?? ""} ${p.description}`)
      return terms.every((t) => haystack.includes(t))
    })
  }, [withStatus, query, type])

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { active: 0, scheduled: 0, paused: 0, ended: 0, all: filtered.length }
    for (const { status } of filtered) result[status]++
    return result
  }, [filtered])

  const rows = useMemo(() => {
    const list = tab === "all" ? filtered : filtered.filter((x) => x.status === tab)
    return list.slice().sort((a, b) => {
      const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      return byStatus || compareWithin(a.status)(a.promotion, b.promotion)
    })
  }, [filtered, tab])

  if (!now || !staff) return <PageSkeleton />

  const manage = canManage(staff.role, "promotions")
  const searching = query.trim() !== "" || type !== "all"
  const openEditor = (promotionId: string | null) => setEditor({ promotionId, nonce: Date.now() })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Khuyến mãi"
        description={
          manage
            ? "Flash sale theo khung giờ, mã giảm giá, mua X tặng Y và voucher thành viên – áp dụng cho toàn chuỗi. Voucher đổi sao xem trong hồ sơ khách hàng."
            : "Các chương trình đang áp dụng cho toàn chuỗi (chỉ xem). Quản trị chuỗi tạo và điều chỉnh khuyến mãi."
        }
        actions={
          manage ? (
            <Button onClick={() => openEditor(null)}>
              <PlusIcon /> Tạo khuyến mãi
            </Button>
          ) : null
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="max-w-full">
            <div className="no-scrollbar max-w-full overflow-x-auto">
              <TabsList className="bg-card ring-1 ring-border">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="gap-1.5 px-2.5 data-active:bg-brand-soft data-active:text-brand-dark"
                  >
                    {t === "all" ? "Tất cả" : PROMOTION_STATUS[t].label}
                    <span className="tabular rounded-full bg-muted px-1.5 text-[11px] leading-4 font-semibold text-muted-foreground">
                      {counts[t]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
          <div className="relative w-full sm:ml-auto sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên hoặc mã khuyến mãi"
              className="bg-card pl-8"
              aria-label="Tìm khuyến mãi"
            />
          </div>
          <Select value={type} onValueChange={(v) => setType(v as PromotionType | "all")}>
            <SelectTrigger className="w-44 bg-card" aria-label="Lọc theo loại">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại</SelectItem>
              {TYPE_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {PROMOTION_TYPE[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{formatNumber(rows.length)} chương trình</p>

        {rows.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ promotion, status }) => (
              <PromotionCard
                key={promotion.id}
                promotion={promotion}
                status={status}
                now={now}
                categories={categories}
                productMap={productMap}
                canManage={manage}
                onEdit={() => openEditor(promotion.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-card px-4 py-14 text-center ring-1 ring-border">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BadgePercentIcon className="size-5" />
            </span>
            <p className="text-sm font-medium">
              {searching
                ? "Không có khuyến mãi phù hợp"
                : tab === "all"
                  ? "Chưa có khuyến mãi nào"
                  : `Không có chương trình “${PROMOTION_STATUS[tab].label.toLowerCase()}”`}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {searching ? "Thử từ khoá hoặc loại khuyến mãi khác." : "Chọn tab khác để xem các chương trình còn lại."}
            </p>
            {manage && !searching ? (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => openEditor(null)}>
                <PlusIcon /> Tạo khuyến mãi
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {manage ? <PromotionFormSheet state={editor} now={now} onClose={() => setEditor(null)} /> : null}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-80" />
      <Skeleton className="h-8 w-[480px] max-w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
