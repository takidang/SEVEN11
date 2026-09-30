"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { InfoIcon, ShuffleIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm, type UseFormReturn, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { TierBadge } from "@/components/shop/tier-ladder"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useCategories } from "@/hooks/use-catalog"
import { formatNumber, formatVND, normalizeText, toDateKey } from "@/lib/format"
import { DRINK_CATEGORY_IDS, MAX_DRINK_VOUCHERS_PER_ORDER, TIER_ORDER, TIERS } from "@/lib/membership"
import { CHANNEL } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { newId, useDb } from "@/stores/db"
import type { MemberTier, Promotion, PromotionType, SalesChannel } from "@/types"

import { NumberInput } from "@/components/admin/number-input"
import { ProductPicker } from "./product-picker"
import { CODE_TYPES, PROMOTION_TYPE, TYPE_ORDER } from "./promotion-meta"

const DAY = 86_400_000
const CHANNEL_ORDER: SalesChannel[] = ["online", "in-store"]

/** The 7-Eleven flash sale slots, offered as one-click presets. */
const FLASH_SLOTS = [
  { label: "Buổi sáng", start: "06:00", end: "10:00" },
  { label: "Ăn xế", start: "14:00", end: "17:00" },
  { label: "Ăn tối", start: "17:00", end: "21:00" },
]

/** Half-hour steps, 24-hour clock (the native time input follows the browser's 12/24h setting). */
const HALF_HOURS = Array.from({ length: 49 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0")
  return `${h}:${i % 2 ? "30" : "00"}`
})
const START_TIMES = HALF_HOURS.slice(0, -1)
const END_TIMES = HALF_HOURS.slice(1)

function promotionSchema(promotions: Promotion[], editing: Promotion | null, todayKey: string) {
  return z
    .object({
      type: z.enum(["percent", "fixed", "flash-sale", "buy-x-get-y", "member-voucher"]),
      name: z.string().trim().min(3, "Nhập tên chương trình (tối thiểu 3 ký tự)").max(80, "Tối đa 80 ký tự"),
      description: z.string().trim().max(240, "Tối đa 240 ký tự"),
      code: z.string().trim(),
      value: z.number().optional(),
      maxDiscount: z.number().optional(),
      minOrderValue: z.number().optional(),
      buyQuantity: z.number().optional(),
      getQuantity: z.number().optional(),
      dailyStart: z.string(),
      dailyEnd: z.string(),
      productIds: z.array(z.string()),
      categoryIds: z.array(z.string()),
      tiers: z.array(z.enum(TIER_ORDER)),
      channels: z.array(z.enum(["online", "in-store"])).min(1, "Chọn ít nhất một kênh bán"),
      startsAt: z.string().min(1, "Chọn ngày bắt đầu"),
      endsAt: z.string().min(1, "Chọn ngày kết thúc"),
      usageLimit: z.number().optional(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
      const isCode = CODE_TYPES.includes(v.type)

      if (v.type === "percent" || v.type === "flash-sale") {
        if (v.value === undefined || v.value < 1 || v.value > 90) issue("value", "Mức giảm từ 1% đến 90%")
      }
      if (v.type === "percent" && v.maxDiscount !== undefined && v.maxDiscount < 1_000) {
        issue("maxDiscount", "Giảm tối đa từ 1.000 ₫, hoặc để trống")
      }
      if (v.type === "fixed") {
        if (v.value === undefined || v.value < 1_000) issue("value", "Số tiền giảm tối thiểu 1.000 ₫")
        else if (v.minOrderValue !== undefined && v.value >= v.minOrderValue) {
          issue("value", "Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu")
        }
      }
      if (v.type === "buy-x-get-y") {
        if (!v.buyQuantity || v.buyQuantity > 50) issue("buyQuantity", "Số lượng mua từ 1 đến 50")
        if (!v.getQuantity || v.getQuantity > 10) issue("getQuantity", "Số lượng tặng từ 1 đến 10")
      }
      if (v.type === "member-voucher" && !v.tiers.length) issue("tiers", "Chọn ít nhất một hạng thành viên")

      if (isCode) {
        if (!/^[A-Z0-9]{4,20}$/.test(v.code)) issue("code", "Mã 4–20 ký tự, chỉ gồm chữ in hoa không dấu và số")
        else if (promotions.some((p) => p.id !== editing?.id && p.code?.toUpperCase() === v.code)) {
          issue("code", `Mã ${v.code} đang được dùng cho khuyến mãi khác`)
        }
      }
      if (v.type === "flash-sale") {
        if (!/^\d{2}:\d{2}$/.test(v.dailyStart)) issue("dailyStart", "Chọn giờ bắt đầu")
        if (!/^\d{2}:\d{2}$/.test(v.dailyEnd)) issue("dailyEnd", "Chọn giờ kết thúc")
        else if (v.dailyEnd <= v.dailyStart) issue("dailyEnd", "Giờ kết thúc phải sau giờ bắt đầu")
      }
      if ((v.type === "flash-sale" || v.type === "buy-x-get-y") && !v.productIds.length && !v.categoryIds.length) {
        issue("productIds", "Chọn ít nhất một sản phẩm hoặc danh mục")
      }
      if (v.startsAt && v.endsAt && v.endsAt < v.startsAt) issue("endsAt", "Ngày kết thúc phải từ ngày bắt đầu trở đi")
      if (!editing && v.endsAt && v.endsAt < todayKey) issue("endsAt", "Ngày kết thúc đã qua")
      if (v.usageLimit !== undefined) {
        if (v.usageLimit < 1) issue("usageLimit", "Tối thiểu 1 lượt, hoặc để trống nếu không giới hạn")
        else if (editing && v.usageLimit < editing.usageCount) {
          issue("usageLimit", `Không được nhỏ hơn số lượt đã dùng (${formatNumber(editing.usageCount)})`)
        }
      }
    })
}

type FormValues = z.infer<ReturnType<typeof promotionSchema>>

function defaultValues(promotion: Promotion | null, now: Date): FormValues {
  if (!promotion) {
    return {
      type: "percent",
      name: "",
      description: "",
      code: "",
      value: undefined,
      maxDiscount: undefined,
      minOrderValue: undefined,
      buyQuantity: 2,
      getQuantity: 1,
      dailyStart: "",
      dailyEnd: "",
      productIds: [],
      categoryIds: [],
      tiers: [],
      channels: ["online", "in-store"],
      startsAt: toDateKey(now),
      endsAt: toDateKey(new Date(now.getTime() + 30 * DAY)),
      usageLimit: undefined,
    }
  }
  const hasValue = promotion.type !== "buy-x-get-y" && promotion.type !== "member-voucher"
  return {
    type: promotion.type,
    name: promotion.name,
    description: promotion.description,
    code: promotion.code ?? "",
    value: hasValue ? promotion.value : undefined,
    maxDiscount: promotion.maxDiscount,
    minOrderValue: promotion.minOrderValue,
    buyQuantity: promotion.buyQuantity ?? 2,
    getQuantity: promotion.getQuantity ?? 1,
    dailyStart: promotion.dailyStart ?? "",
    dailyEnd: promotion.dailyEnd ?? "",
    productIds: promotion.productIds,
    categoryIds: promotion.categoryIds,
    tiers: promotion.tiers,
    channels: promotion.channels,
    startsAt: toDateKey(promotion.startsAt),
    endsAt: toDateKey(promotion.endsAt),
    usageLimit: promotion.usageLimit,
  }
}

/** Uppercase, no diacritics, letters and digits only. */
function cleanCode(value: string) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20)
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = "7E"
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return code
}

export type PromotionEditorState = { promotionId: string | null; nonce: number } | null

/** Create / edit a promotion (admin). */
export function PromotionFormSheet({
  state,
  now,
  onClose,
}: {
  state: PromotionEditorState
  now: Date
  onClose: () => void
}) {
  const promotions = useDb((s) => s.promotions)
  const [shown, setShown] = useState<PromotionEditorState>(state)
  if (state && state !== shown) setShown(state)
  const editing = shown?.promotionId ? (promotions.find((p) => p.id === shown.promotionId) ?? null) : null

  return (
    <Sheet open={!!state} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle className="text-lg font-semibold">
            {editing ? `Sửa khuyến mãi: ${editing.name}` : "Tạo khuyến mãi"}
          </SheetTitle>
          <SheetDescription>
            {editing
              ? `Đã dùng ${formatNumber(editing.usageCount)} lượt. Loại khuyến mãi không đổi được sau khi tạo.`
              : "Chương trình áp dụng cho toàn chuỗi, trên các kênh bán bạn chọn."}
          </SheetDescription>
        </SheetHeader>
        {shown ? (
          <PromotionForm
            key={`${shown.promotionId ?? "new"}-${shown.nonce}`}
            editing={editing}
            promotions={promotions}
            now={now}
            onDone={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function PromotionForm({
  editing,
  promotions,
  now,
  onDone,
}: {
  editing: Promotion | null
  promotions: Promotion[]
  now: Date
  onDone: () => void
}) {
  const categories = useCategories()
  const todayKey = toDateKey(now)
  const [schema] = useState(() => promotionSchema(promotions, editing, todayKey))
  const [initial] = useState(() => defaultValues(editing, now))
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial })
  const { errors, isSubmitting } = form.formState
  const type = useWatch({ control: form.control, name: "type" })
  const buyQuantity = useWatch({ control: form.control, name: "buyQuantity" })
  const getQuantity = useWatch({ control: form.control, name: "getQuantity" })

  const isCode = CODE_TYPES.includes(type)
  const drinkCategories = useMemo(
    () => categories.filter((c) => DRINK_CATEGORY_IDS.includes(c.id)).map((c) => c.name),
    [categories],
  )

  const onSubmit = form.handleSubmit((v) => {
    const [sy, sm, sd] = v.startsAt.split("-").map(Number)
    const [ey, em, ed] = v.endsAt.split("-").map(Number)
    // Keep the stored instant when the day did not change; new days run from 00:00 to 23:59:59.
    const startsAt =
      editing && toDateKey(editing.startsAt) === v.startsAt ? editing.startsAt : new Date(sy, sm - 1, sd).toISOString()
    const endsAt =
      editing && toDateKey(editing.endsAt) === v.endsAt
        ? editing.endsAt
        : new Date(ey, em - 1, ed, 23, 59, 59, 999).toISOString()
    const code = CODE_TYPES.includes(v.type)

    const promotion: Promotion = {
      id: editing?.id ?? newId("pr"),
      code: code ? v.code : undefined,
      name: v.name,
      description: v.description,
      type: v.type,
      value: v.type === "buy-x-get-y" || v.type === "member-voucher" ? 0 : (v.value ?? 0),
      maxDiscount: v.type === "percent" ? v.maxDiscount : undefined,
      minOrderValue: code ? v.minOrderValue : undefined,
      buyQuantity: v.type === "buy-x-get-y" ? v.buyQuantity : undefined,
      getQuantity: v.type === "buy-x-get-y" ? v.getQuantity : undefined,
      productIds: v.type === "member-voucher" ? [] : v.productIds,
      categoryIds: v.type === "member-voucher" ? DRINK_CATEGORY_IDS : v.categoryIds,
      tiers: code || v.type === "member-voucher" ? v.tiers : [],
      channels: CHANNEL_ORDER.filter((c) => v.channels.includes(c)),
      dailyStart: v.type === "flash-sale" ? v.dailyStart : undefined,
      dailyEnd: v.type === "flash-sale" ? v.dailyEnd : undefined,
      startsAt,
      endsAt,
      status: editing?.status ?? "active",
      usageLimit: v.usageLimit,
      usageCount: editing?.usageCount ?? 0,
    }
    useDb.getState().savePromotion(promotion)
    toast.success(editing ? `Đã lưu thay đổi “${promotion.name}”` : `Đã tạo khuyến mãi “${promotion.name}”`)
    onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-7 overflow-y-auto p-4">
        {/* Type */}
        <FormSection title="Loại khuyến mãi">
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(next) => {
                  field.onChange(next as PromotionType)
                  form.setValue("value", undefined)
                  form.clearErrors()
                }}
                className="grid gap-2 sm:grid-cols-2"
                aria-label="Loại khuyến mãi"
              >
                {TYPE_ORDER.filter((t) => !editing || t === field.value).map((t) => {
                  const meta = PROMOTION_TYPE[t]
                  return (
                    <FieldLabel key={t} htmlFor={`promo-type-${t}`}>
                      <Field orientation="horizontal">
                        <meta.icon className={cn("mt-0.5 size-4", t === "flash-sale" ? "text-red" : "text-brand")} />
                        <FieldContent>
                          <FieldTitle>{meta.label}</FieldTitle>
                          <FieldDescription className="text-xs">{meta.hint}</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value={t} id={`promo-type-${t}`} disabled={!!editing} />
                      </Field>
                    </FieldLabel>
                  )
                })}
              </RadioGroup>
            )}
          />
        </FormSection>

        {/* General */}
        <FormSection title="Thông tin chung">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="promo-name">Tên chương trình</FieldLabel>
              <Input
                id="promo-name"
                placeholder="VD: Cuối tuần giảm 10%"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="promo-description">Mô tả cho khách</FieldLabel>
              <Textarea
                id="promo-description"
                rows={2}
                placeholder="VD: Giảm 10% tối đa 30.000 ₫ cho đơn từ 150.000 ₫."
                aria-invalid={!!errors.description}
                {...form.register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>
            {isCode ? (
              <Field data-invalid={!!errors.code}>
                <FieldLabel htmlFor="promo-code">Mã khuyến mãi</FieldLabel>
                <div className="flex gap-2">
                  <Controller
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <Input
                        id="promo-code"
                        value={field.value}
                        onChange={(e) => field.onChange(cleanCode(e.target.value))}
                        onBlur={field.onBlur}
                        placeholder="VD: CUOITUAN10"
                        autoComplete="off"
                        className="font-mono tracking-wide uppercase"
                        aria-invalid={!!errors.code}
                      />
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="text-foreground"
                    onClick={() => form.setValue("code", randomCode(), { shouldValidate: form.formState.isSubmitted })}
                  >
                    <ShuffleIcon /> Tạo mã
                  </Button>
                </div>
                <FieldDescription className="text-xs">
                  Khách nhập mã khi thanh toán online hoặc đọc cho thu ngân.
                </FieldDescription>
                <FieldError errors={[errors.code]} />
              </Field>
            ) : (
              <Note>
                {type === "member-voucher"
                  ? "Tự áp dụng cho khách đăng nhập thành viên, không cần nhập mã."
                  : "Tự áp dụng khi giỏ hàng đủ điều kiện, không cần nhập mã."}
              </Note>
            )}
          </FieldGroup>
        </FormSection>

        {/* Offer */}
        <FormSection title="Mức ưu đãi">
          {type === "percent" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <MoneyField form={form} name="value" label="Mức giảm" suffix="%" grouping={false} maxDigits={2} />
              <MoneyField form={form} name="maxDiscount" label="Giảm tối đa" suffix="₫" placeholder="Không giới hạn" />
              <MoneyField
                form={form}
                name="minOrderValue"
                label="Đơn tối thiểu"
                suffix="₫"
                placeholder="Không yêu cầu"
              />
            </div>
          ) : type === "fixed" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField form={form} name="value" label="Số tiền giảm" suffix="₫" />
              <MoneyField
                form={form}
                name="minOrderValue"
                label="Đơn tối thiểu"
                suffix="₫"
                placeholder="Không yêu cầu"
              />
            </div>
          ) : type === "flash-sale" ? (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <MoneyField form={form} name="value" label="Mức giảm" suffix="%" grouping={false} maxDigits={2} />
                <TimeField form={form} name="dailyStart" label="Từ giờ" options={START_TIMES} />
                <TimeField form={form} name="dailyEnd" label="Đến giờ" options={END_TIMES} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Khung giờ quen thuộc:</span>
                {FLASH_SLOTS.map((slot) => (
                  <button
                    key={slot.label}
                    type="button"
                    className="h-6 rounded-full px-2.5 text-brand ring-1 ring-brand/25 hover:bg-brand-soft"
                    onClick={() => {
                      const opts = { shouldValidate: form.formState.isSubmitted, shouldDirty: true }
                      form.setValue("dailyStart", slot.start, opts)
                      form.setValue("dailyEnd", slot.end, opts)
                    }}
                  >
                    {slot.label} {slot.start}–{slot.end}
                  </button>
                ))}
              </div>
            </div>
          ) : type === "buy-x-get-y" ? (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField
                  form={form}
                  name="buyQuantity"
                  label="Khách mua"
                  suffix="sản phẩm"
                  grouping={false}
                  maxDigits={2}
                />
                <MoneyField
                  form={form}
                  name="getQuantity"
                  label="Được tặng thêm"
                  suffix="sản phẩm"
                  grouping={false}
                  maxDigits={2}
                />
              </div>
              {buyQuantity && getQuantity ? (
                <Note>
                  Khách lấy {buyQuantity + getQuantity} sản phẩm cùng loại chỉ trả tiền {buyQuantity}; phần tặng tính
                  theo giá đang bán (kể cả giá flash sale).
                </Note>
              ) : null}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg ring-1 ring-border">
              <ul className="grid divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                {TIER_ORDER.map((t) => (
                  <li key={t} className="px-3 py-2.5">
                    <TierBadge tier={t} className="whitespace-nowrap" />
                    <p className="tabular mt-1 text-sm font-semibold">-{formatVND(TIERS[t].drinkVoucher)}/ly</p>
                    <p className="text-xs text-muted-foreground">{TIERS[t].vouchersPerMonth} voucher/tháng</p>
                  </li>
                ))}
              </ul>
              <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Mức giảm theo chính sách hạng thành viên, tối đa {MAX_DRINK_VOUCHERS_PER_ORDER} ly/đơn, áp dụng cho{" "}
                {drinkCategories.join(", ") || "đồ uống pha chế"}.
              </p>
            </div>
          )}
        </FormSection>

        {/* Scope */}
        <FormSection title="Phạm vi áp dụng">
          <FieldGroup className="gap-5">
            {type !== "member-voucher" ? (
              <>
                <Field data-invalid={!!errors.productIds}>
                  <FieldLabel htmlFor="promo-products">Sản phẩm</FieldLabel>
                  <Controller
                    control={form.control}
                    name="productIds"
                    render={({ field }) => (
                      <ProductPicker
                        id="promo-products"
                        value={field.value}
                        onChange={(ids) => {
                          field.onChange(ids)
                          if (form.formState.isSubmitted) void form.trigger("productIds")
                        }}
                        invalid={!!errors.productIds}
                      />
                    )}
                  />
                  <FieldError errors={[errors.productIds]} />
                </Field>
                <FieldSet className="gap-0">
                  <FieldLegend variant="label">Danh mục</FieldLegend>
                  <Controller
                    control={form.control}
                    name="categoryIds"
                    render={({ field }) => (
                      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2" role="group" aria-label="Danh mục áp dụng">
                        {categories.map((c) => (
                          <Field key={c.id} orientation="horizontal" className="gap-2">
                            <Checkbox
                              id={`promo-cat-${c.id}`}
                              checked={field.value.includes(c.id)}
                              onCheckedChange={(checked) => {
                                field.onChange(checked ? [...field.value, c.id] : field.value.filter((x) => x !== c.id))
                                if (form.formState.isSubmitted) void form.trigger("productIds")
                              }}
                            />
                            <FieldLabel htmlFor={`promo-cat-${c.id}`} className="font-normal">
                              {c.name}
                            </FieldLabel>
                          </Field>
                        ))}
                      </div>
                    )}
                  />
                  <p className="mt-2.5 text-xs text-muted-foreground">
                    {type === "flash-sale" || type === "buy-x-get-y"
                      ? "Bắt buộc chọn sản phẩm hoặc danh mục."
                      : "Không chọn sản phẩm lẫn danh mục = áp dụng cho toàn bộ giỏ hàng."}
                  </p>
                </FieldSet>
              </>
            ) : null}

            {isCode || type === "member-voucher" ? (
              <FieldSet className="gap-0">
                <FieldLegend variant="label">Hạng thành viên</FieldLegend>
                <Controller
                  control={form.control}
                  name="tiers"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Hạng thành viên">
                      {TIER_ORDER.map((t) => (
                        <Field key={t} orientation="horizontal" className="w-auto gap-2">
                          <Checkbox
                            id={`promo-tier-${t}`}
                            checked={field.value.includes(t)}
                            aria-invalid={!!errors.tiers}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? TIER_ORDER.filter((x) => x === t || field.value.includes(x))
                                  : field.value.filter((x: MemberTier) => x !== t),
                              )
                            }
                          />
                          <FieldLabel htmlFor={`promo-tier-${t}`} className="font-normal">
                            <TierBadge tier={t} className="whitespace-nowrap" />
                          </FieldLabel>
                        </Field>
                      ))}
                    </div>
                  )}
                />
                {isCode ? (
                  <p className="mt-2.5 text-xs text-muted-foreground">
                    Không chọn hạng nào = mọi khách đều dùng được, kể cả khách chưa đăng nhập.
                  </p>
                ) : null}
                <FieldError className="mt-2" errors={[errors.tiers]} />
              </FieldSet>
            ) : null}

            <FieldSet className="gap-0">
              <FieldLegend variant="label">Kênh bán</FieldLegend>
              <Controller
                control={form.control}
                name="channels"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Kênh bán">
                    {CHANNEL_ORDER.map((c) => (
                      <Field key={c} orientation="horizontal" className="w-auto gap-2">
                        <Checkbox
                          id={`promo-channel-${c}`}
                          checked={field.value.includes(c)}
                          aria-invalid={!!errors.channels}
                          onCheckedChange={(checked) =>
                            field.onChange(checked ? [...field.value, c] : field.value.filter((x) => x !== c))
                          }
                        />
                        <FieldLabel htmlFor={`promo-channel-${c}`} className="font-normal">
                          {c === "online" ? "Online (web, app)" : CHANNEL[c]}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                )}
              />
              <FieldError className="mt-2" errors={[errors.channels]} />
            </FieldSet>
          </FieldGroup>
        </FormSection>

        {/* Period & limit */}
        <FormSection title="Thời gian & giới hạn">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={!!errors.startsAt}>
              <FieldLabel htmlFor="promo-starts">Bắt đầu</FieldLabel>
              <Input id="promo-starts" type="date" aria-invalid={!!errors.startsAt} {...form.register("startsAt")} />
              <FieldError errors={[errors.startsAt]} />
            </Field>
            <Field data-invalid={!!errors.endsAt}>
              <FieldLabel htmlFor="promo-ends">Kết thúc</FieldLabel>
              <Input id="promo-ends" type="date" aria-invalid={!!errors.endsAt} {...form.register("endsAt")} />
              <FieldError errors={[errors.endsAt]} />
            </Field>
            <MoneyField
              form={form}
              name="usageLimit"
              label="Giới hạn lượt dùng"
              suffix="lượt"
              placeholder="Không giới hạn"
            />
          </div>
        </FormSection>
      </div>

      <div className="flex items-center justify-end gap-2 border-t bg-muted/40 p-4">
        {Object.keys(errors).length ? (
          <p className="mr-auto text-xs text-destructive">Kiểm tra lại các ô được đánh dấu đỏ.</p>
        ) : null}
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {editing ? "Lưu thay đổi" : "Tạo khuyến mãi"}
        </Button>
      </div>
    </form>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
      <InfoIcon className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function TimeField({
  form,
  name,
  label,
  options,
}: {
  form: UseFormReturn<FormValues>
  name: "dailyStart" | "dailyEnd"
  label: string
  options: string[]
}) {
  const error = form.formState.errors[name]
  const id = `promo-${name}`
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} className="tabular w-full" aria-invalid={!!error}>
              <SelectValue placeholder="Chọn giờ" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-64">
              {(field.value && !options.includes(field.value) ? [...options, field.value].sort() : options).map((t) => (
                <SelectItem key={t} value={t} className="tabular">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError errors={[error]} />
    </Field>
  )
}

type NumberFieldName = "value" | "maxDiscount" | "minOrderValue" | "buyQuantity" | "getQuantity" | "usageLimit"

function MoneyField({
  form,
  name,
  label,
  suffix,
  placeholder,
  grouping,
  maxDigits,
}: {
  form: UseFormReturn<FormValues>
  name: NumberFieldName
  label: string
  suffix: string
  placeholder?: string
  grouping?: boolean
  maxDigits?: number
}) {
  const error = form.formState.errors[name]
  const id = `promo-${name}`
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <NumberInput
            id={id}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            suffix={suffix}
            placeholder={placeholder}
            grouping={grouping}
            maxDigits={maxDigits}
            invalid={!!error}
          />
        )}
      />
      <FieldError errors={[error]} />
    </Field>
  )
}
