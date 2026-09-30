"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRightIcon,
  CakeIcon,
  GiftIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  ReceiptIcon,
  TicketIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { StatusBadge } from "@/components/admin/status-badge"
import { StarCount } from "@/components/shop/star-rewards"
import { TierBadge } from "@/components/shop/tier-ladder"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCategories, useProductMap } from "@/hooks/use-catalog"
import { useKeepStatus, useMyVouchers, useStarHistory } from "@/hooks/use-membership"
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPhone,
  formatVND,
  toDateKey,
} from "@/lib/format"
import { type KeepStatus, monthLabel, monthStart, shiftMonth, TIER_ORDER, TIERS } from "@/lib/membership"
import { CHANNEL, ORDER_STATUS, type Tone } from "@/lib/order-status"
import { effectiveStatus } from "@/lib/pricing"
import { STAR_SPEND, spendToNextStar } from "@/lib/stars"
import { cn } from "@/lib/utils"
import { voucherExpiry, voucherValueText } from "@/lib/vouchers"
import { useDb } from "@/stores/db"
import type { Customer, Promotion } from "@/types"

import { CustomerAvatar, keepBadge, TIER_BAR, tierProgress } from "./customer-columns"

const RECENT_ORDERS = 8
const RECENT_STAR_ENTRIES = 6
const RECENT_TIER_CHANGES = 5

/** yyyy-MM-dd → dd/MM/yyyy without going through Date (no timezone shift). */
function formatDateKey(key: string) {
  const [y, m, d] = key.split("-")
  return `${d}/${m}/${y}`
}

/**
 * Customer detail sheet. Opens while `customer` is set; keeps showing the last
 * customer during the close animation.
 */
export function CustomerSheet({
  customer,
  now,
  canEdit,
  onClose,
}: {
  customer: Customer | null
  now: Date
  canEdit: boolean
  onClose: () => void
}) {
  const [shown, setShown] = useState<Customer | null>(customer)
  if (customer && customer !== shown) setShown(customer)

  return (
    <Sheet open={!!customer} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {shown ? (
          <CustomerDetails key={shown.id} customer={shown} now={now} canEdit={canEdit} />
        ) : (
          <SheetHeader className="sr-only">
            <SheetTitle>Khách hàng</SheetTitle>
            <SheetDescription>Thông tin thành viên</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function CustomerDetails({ customer, now, canEdit }: { customer: Customer; now: Date; canEdit: boolean }) {
  const orders = useDb((s) => s.orders)
  const stores = useDb((s) => s.stores)
  const keep = useKeepStatus(customer, now)
  const starHistory = useStarHistory(customer.id)
  const vouchers = useMyVouchers(customer.id)
  const productMap = useProductMap()
  const categories = useCategories()
  const [editing, setEditing] = useState(false)

  const history = useMemo(() => {
    const mine = orders.filter((o) => o.customerId === customer.id)
    const quantityByCategory = new Map<string, number>()
    for (const o of mine) {
      if (o.status === "cancelled") continue
      for (const it of o.items) {
        const categoryId = productMap.get(it.productId)?.categoryId
        if (categoryId) quantityByCategory.set(categoryId, (quantityByCategory.get(categoryId) ?? 0) + it.quantity)
      }
    }
    let favourite: { id: string; quantity: number } | null = null
    for (const [id, quantity] of quantityByCategory) {
      if (!favourite || quantity > favourite.quantity) favourite = { id, quantity }
    }
    return { orders: mine, favourite }
  }, [orders, customer.id, productMap])

  const storeCode = useMemo(() => new Map(stores.map((s) => [s.id, s.code] as const)), [stores])
  const favouriteCategory = history.favourite ? categories.find((c) => c.id === history.favourite!.id) : null
  const averageOrder = customer.orderCount ? customer.totalSpent / customer.orderCount : 0
  const lastOrder = history.orders[0]

  const birthdayThisMonth = !!customer.birthday && Number(customer.birthday.slice(5, 7)) === now.getMonth() + 1
  const defaultFirst = [...customer.addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))

  return (
    <>
      <SheetHeader className="flex-row items-start gap-3 border-b p-4 pr-12">
        <CustomerAvatar name={customer.fullName} className="size-12 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-lg font-semibold">{customer.fullName}</SheetTitle>
            <TierBadge tier={customer.tier} />
          </div>
          <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="tabular inline-flex items-center gap-1">
              <PhoneIcon className="size-3.5" /> {formatPhone(customer.phone)}
            </span>
            {customer.email ? (
              <span className="inline-flex items-center gap-1">
                <MailIcon className="size-3.5" /> {customer.email}
              </span>
            ) : null}
            <span>Thành viên từ {formatDate(customer.joinedAt)}</span>
          </SheetDescription>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {keep ? <MembershipCard customer={customer} keep={keep} /> : null}

        {/* Purchase stats */}
        <section className="grid grid-cols-3 gap-2">
          <MiniStat label="Tổng chi tiêu" value={formatVND(customer.totalSpent)} />
          <MiniStat label="Số đơn" value={formatNumber(customer.orderCount)} />
          <MiniStat label="Giá trị TB/đơn" value={formatVND(averageOrder)} />
          <div className="col-span-3 grid gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs sm:grid-cols-2">
            <span className="text-muted-foreground">
              Hay mua nhất:{" "}
              <span className="font-medium text-foreground">
                {favouriteCategory
                  ? `${favouriteCategory.name} (${formatNumber(history.favourite!.quantity)} sp)`
                  : "Chưa có"}
              </span>
            </span>
            <span className="text-muted-foreground">
              Mua gần nhất:{" "}
              <span className="font-medium text-foreground">
                {lastOrder ? formatDateTime(lastOrder.createdAt) : "Chưa có"}
              </span>
            </span>
          </div>
        </section>

        {/* Gold stars */}
        <section>
          <SectionTitle title="Sao vàng" hint={`1 sao cho mỗi ${formatVND(STAR_SPEND)} chi tiêu`} />
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Sao hiện có" value={<StarCount value={customer.stars} />} />
            <MiniStat label="Chi thêm để có sao tiếp theo" value={formatVND(spendToNextStar(customer.starCarry))} />
          </div>
          {starHistory.length ? (
            <>
              <p className="mt-3 mb-1.5 text-xs text-muted-foreground">
                Biến động gần đây · {Math.min(RECENT_STAR_ENTRIES, starHistory.length)} /{" "}
                {formatNumber(starHistory.length)} lượt
              </p>
              <ul className="divide-y rounded-lg ring-1 ring-border">
                {starHistory.slice(0, RECENT_STAR_ENTRIES).map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{entry.note}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                    </div>
                    <StatusBadge tone={entry.delta > 0 ? "fresh" : "neutral"} dot={false} className="tabular h-5 px-2">
                      {entry.delta > 0 ? `+${formatNumber(entry.delta)}` : `−${formatNumber(-entry.delta)}`} sao
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Chưa có biến động sao vàng.</p>
          )}
        </section>

        {/* Personal vouchers redeemed with stars */}
        <section>
          <SectionTitle
            title="Voucher đổi sao"
            hint={vouchers.length ? `${formatNumber(vouchers.length)} voucher` : undefined}
          />
          {vouchers.length ? (
            <ul className="divide-y rounded-lg ring-1 ring-border">
              {vouchers.map((voucher) => (
                <VoucherRow key={voucher.id} voucher={voucher} now={now} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Khách chưa đổi voucher nào bằng sao vàng.</p>
          )}
        </section>

        {/* Tier history */}
        <section>
          <SectionTitle
            title="Lịch sử hạng"
            hint={
              customer.tierHistory.length > RECENT_TIER_CHANGES
                ? `${RECENT_TIER_CHANGES} / ${formatNumber(customer.tierHistory.length)} lần thay đổi`
                : undefined
            }
          />
          {customer.tierHistory.length ? (
            <ol className="divide-y rounded-lg ring-1 ring-border">
              {customer.tierHistory.slice(0, RECENT_TIER_CHANGES).map((change, i) => {
                const up = TIER_ORDER.indexOf(change.to) > TIER_ORDER.indexOf(change.from)
                return (
                  <li key={`${change.at}-${i}`} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TierBadge tier={change.from} />
                      <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label="sang" />
                      <TierBadge tier={change.to} />
                      <StatusBadge tone={up ? "fresh" : "orange"} className="ml-1 h-5 px-2">
                        {up ? "Lên hạng" : "Xuống hạng"}
                      </StatusBadge>
                      <span className="tabular ml-auto text-xs text-muted-foreground">{formatDate(change.at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{change.reason}</p>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có thay đổi hạng nào.</p>
          )}
        </section>

        {/* Profile */}
        <section>
          <SectionTitle
            title="Thông tin cá nhân"
            action={
              canEdit && !editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <PencilIcon /> Sửa
                </Button>
              ) : null
            }
          />
          {editing ? (
            <ProfileForm customer={customer} now={now} onDone={() => setEditing(false)} />
          ) : (
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Họ tên</dt>
              <dd>{customer.fullName}</dd>
              <dt className="text-muted-foreground">Số điện thoại</dt>
              <dd className="tabular">{formatPhone(customer.phone)}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{customer.email ?? <span className="text-muted-foreground">Chưa có</span>}</dd>
              <dt className="text-muted-foreground">Ngày sinh</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {customer.birthday ? (
                  formatDateKey(customer.birthday)
                ) : (
                  <span className="text-muted-foreground">Chưa có</span>
                )}
                {birthdayThisMonth ? <StatusBadge tone="orange">Sinh nhật tháng này</StatusBadge> : null}
              </dd>
            </dl>
          )}
        </section>

        {/* Addresses */}
        <section>
          <SectionTitle title="Sổ địa chỉ" hint={`${customer.addresses.length} địa chỉ`} />
          {defaultFirst.length ? (
            <ul className="space-y-2">
              {defaultFirst.map((a) => (
                <li key={a.id} className="flex gap-3 rounded-lg px-3 py-2.5 ring-1 ring-border">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {a.label}
                      {a.isDefault ? (
                        <StatusBadge tone="brand" dot={false} className="h-5 px-2">
                          Mặc định
                        </StatusBadge>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">
                      {a.recipient} · <span className="tabular">{formatPhone(a.phone)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {a.line}, {a.ward}, {a.province}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Khách chưa lưu địa chỉ giao hàng.</p>
          )}
        </section>

        {/* Orders */}
        <section>
          <SectionTitle
            title="Đơn hàng gần đây"
            hint={
              history.orders.length
                ? `${Math.min(RECENT_ORDERS, history.orders.length)} / ${formatNumber(history.orders.length)} đơn trên hệ thống`
                : undefined
            }
          />
          {history.orders.length ? (
            <ul className="divide-y rounded-lg ring-1 ring-border">
              {history.orders.slice(0, RECENT_ORDERS).map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/quan-ly/don-hang?ma=${o.code}`}
                      className="font-mono text-[13px] font-medium text-brand hover:underline"
                    >
                      {o.code}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)} · {CHANNEL[o.channel]} · CH {storeCode.get(o.storeId) ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular text-sm font-semibold">{formatVND(o.total)}</span>
                    <StatusBadge tone={ORDER_STATUS[o.status].tone} className="h-5 px-2">
                      {ORDER_STATUS[o.status].label}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg py-8 text-center ring-1 ring-border">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ReceiptIcon className="size-5" />
              </span>
              <p className="text-sm text-muted-foreground">Khách chưa có đơn hàng nào trên hệ thống.</p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

/** Tier, accumulated spend toward the next tier, this month's keep-the-tier check and perks. */
function MembershipCard({ customer, keep }: { customer: Customer; keep: KeepStatus }) {
  const tier = TIERS[customer.tier]
  const progress = tierProgress(customer)
  const badge = keepBadge(keep)
  const reviewDay = formatDate(monthStart(shiftMonth(keep.month, 1)))

  return (
    <section className="overflow-hidden rounded-xl ring-1 ring-border">
      <div className="flex items-start justify-between gap-3 bg-muted/40 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Hạng thành viên</p>
          <p className="mt-0.5 text-[15px] font-semibold">Thành viên {tier.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Từ ngày {formatDate(customer.tierSince)}</p>
        </div>
        <TierBadge tier={customer.tier} className="text-[13px]" />
      </div>

      <div className="space-y-2 border-t px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Chi tiêu tích luỹ</p>
            <p className="tabular text-xl font-semibold tracking-tight">{formatVND(customer.tierSpend)}</p>
          </div>
          {progress.next ? (
            <div className="flex flex-col items-end gap-1">
              <p className="text-xs text-muted-foreground">Hạng tiếp theo</p>
              <TierBadge tier={progress.next.id} />
            </div>
          ) : null}
        </div>
        {progress.next ? (
          <>
            <Progress
              value={Math.round(progress.ratio * 100)}
              className={cn("h-2", TIER_BAR[progress.next.id])}
              aria-label={`Tiến độ lên hạng ${progress.next.label}`}
            />
            <p className="text-xs text-muted-foreground">
              Còn <span className="tabular font-medium text-foreground">{formatVND(progress.missing)}</span> để lên hạng{" "}
              {progress.next.label} (mốc {formatVND(progress.next.minSpend)}).
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Đã ở hạng cao nhất của chương trình.</p>
        )}
      </div>

      <div className="space-y-2 border-t px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Giữ hạng tháng {monthLabel(keep.month)}</p>
            <p className="tabular mt-0.5 text-sm font-semibold">
              {keep.exempt ? (
                <>Đã chi {formatVND(keep.spent)}</>
              ) : (
                <>
                  {formatVND(keep.spent)}
                  <span className="font-normal text-muted-foreground"> / {formatVND(keep.required)}</span>
                </>
              )}
            </p>
          </div>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>
        {keep.exempt ? null : (
          <Progress
            value={Math.min(100, (keep.spent / keep.required) * 100)}
            className={cn(
              "h-2",
              keep.missing ? "*:data-[slot=progress-indicator]:bg-orange" : "*:data-[slot=progress-indicator]:bg-fresh",
            )}
            aria-label={`Tiến độ giữ hạng tháng ${monthLabel(keep.month)}`}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {keep.exempt === "base-tier" ? (
            <>Hạng {tier.label} không cần duy trì chi tiêu hằng tháng.</>
          ) : keep.exempt === "upgrade-month" ? (
            <>
              Khách lên hạng {tier.label} trong tháng này nên chưa bị xét. Từ tháng{" "}
              {monthLabel(shiftMonth(keep.month, 1))} cần chi tối thiểu{" "}
              <span className="tabular font-medium text-foreground">{formatVND(tier.keepPerMonth)}</span> mỗi tháng.
            </>
          ) : keep.missing ? (
            <>
              Còn {keep.daysLeft} ngày để chi thêm{" "}
              <span className="tabular font-medium text-foreground">{formatVND(keep.missing)}</span>. Nếu không đủ, ngày{" "}
              {reviewDay} khách xuống hạng{" "}
              <span className="font-medium text-foreground">{keep.dropTo ? TIERS[keep.dropTo].label : ""}</span>.
            </>
          ) : (
            <>
              Đã đủ mức giữ hạng {tier.label} cho đợt xét ngày {reviewDay}.
            </>
          )}
        </p>
      </div>

      <ul className="space-y-1.5 border-t px-4 py-3 text-xs text-muted-foreground">
        <li className="flex items-start gap-2">
          <TicketIcon className="mt-px size-3.5 shrink-0 text-brand" />
          Voucher đồ uống -{formatVND(tier.drinkVoucher)}/ly · {tier.vouchersPerMonth} voucher/tháng
        </li>
        <li className="flex items-start gap-2">
          <CakeIcon className="mt-px size-3.5 shrink-0 text-brand" />
          Tháng sinh nhật giảm {formatPercent(tier.birthdayDrinkDiscount, 0)} đồ uống
        </li>
        <li className="flex items-start gap-2">
          <GiftIcon className="mt-px size-3.5 shrink-0 text-brand" />
          {tier.freeDrink}
        </li>
      </ul>
    </section>
  )
}

/** Used · expired · paused · still usable, with the validity line to match. */
function voucherState(voucher: Promotion, now: Date): { label: string; tone: Tone; expiry: string; urgent: boolean } {
  const until = `HSD ${formatDate(voucher.endsAt)}`
  if (voucher.usageLimit !== undefined && voucher.usageCount >= voucher.usageLimit) {
    return { label: "Đã dùng", tone: "neutral", expiry: until, urgent: false }
  }
  const status = effectiveStatus(voucher, now)
  if (status === "ended") return { label: "Hết hạn", tone: "neutral", expiry: until, urgent: false }
  if (status === "paused") return { label: "Tạm dừng", tone: "warning", expiry: until, urgent: false }
  const { text, urgent } = voucherExpiry(voucher, now)
  return { label: "Chưa dùng", tone: "fresh", expiry: text, urgent }
}

function VoucherRow({ voucher, now }: { voucher: Promotion; now: Date }) {
  const state = voucherState(voucher, now)
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <TicketIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-mono text-[13px] font-semibold">{voucher.code}</span>
          <span>{voucherValueText(voucher)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {voucher.minOrderValue ? `Đơn từ ${formatVND(voucher.minOrderValue)} · ` : ""}
          <span className={cn(state.urgent && "font-medium text-warning")}>{state.expiry}</span>
        </p>
      </div>
      <StatusBadge tone={state.tone} className="h-5 px-2">
        {state.label}
      </StatusBadge>
    </li>
  )
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">
        {title}
        {hint ? <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </h3>
      {action}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2 ring-1 ring-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  )
}

function profileSchema(todayKey: string) {
  return z.object({
    fullName: z.string().trim().min(2, "Nhập họ tên (tối thiểu 2 ký tự)").max(60, "Họ tên tối đa 60 ký tự"),
    email: z
      .string()
      .trim()
      .refine((v) => v === "" || z.email().safeParse(v).success, "Email không hợp lệ"),
    birthday: z.string().refine((v) => v === "" || (v >= "1920-01-01" && v <= todayKey), "Ngày sinh không hợp lệ"),
  })
}

type ProfileValues = z.infer<ReturnType<typeof profileSchema>>

function ProfileForm({ customer, now, onDone }: { customer: Customer; now: Date; onDone: () => void }) {
  const todayKey = toDateKey(now)
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema(todayKey)),
    defaultValues: {
      fullName: customer.fullName,
      email: customer.email ?? "",
      birthday: customer.birthday ?? "",
    },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) => {
    useDb.getState().updateCustomer(customer.id, {
      fullName: values.fullName,
      email: values.email || undefined,
      birthday: values.birthday || undefined,
    })
    toast.success("Đã cập nhật thông tin khách hàng")
    onDone()
  })

  return (
    <form onSubmit={onSubmit} className="rounded-lg p-3 ring-1 ring-border" noValidate>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="customer-name">Họ tên</FieldLabel>
          <Input id="customer-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
          <FieldError errors={[errors.fullName]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="customer-email">Email</FieldLabel>
            <Input
              id="customer-email"
              type="email"
              placeholder="ten@email.com"
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.birthday}>
            <FieldLabel htmlFor="customer-birthday">Ngày sinh</FieldLabel>
            <Input
              id="customer-birthday"
              type="date"
              max={todayKey}
              aria-invalid={!!errors.birthday}
              {...form.register("birthday")}
            />
            <FieldError errors={[errors.birthday]} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Số điện thoại là tài khoản đăng nhập của khách nên không sửa được ở đây.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Huỷ
          </Button>
          <Button type="submit">Lưu thay đổi</Button>
        </div>
      </FieldGroup>
    </form>
  )
}
