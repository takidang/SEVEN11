"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { STOCK_STATE, stockState } from "@/hooks/use-stock"
import { formatNumber } from "@/lib/format"
import { useDb } from "@/stores/db"
import type { Product } from "@/types"

import { ProductCell } from "@/components/admin/product-cell"

export interface StockTarget {
  product: Product
  storeId: string
}

/** The live stock level of the target (it can change while a dialog is open, e.g. a POS sale). */
function useLevel(target: StockTarget) {
  const level = useDb((s) => s.stock.find((l) => l.storeId === target.storeId && l.productId === target.product.id))
  return { quantity: level?.quantity ?? 0, minQuantity: level?.minQuantity ?? 0 }
}

/** Keeps the last non-null value so dialog content doesn't vanish during the close animation. */
function useLastTarget(target: StockTarget | null) {
  const [shown, setShown] = useState(target)
  if (target && target !== shown) setShown(target)
  return target ?? shown
}

/** "+3" / "−2" / "0" with a real minus sign. */
export function signed(value: number) {
  if (value > 0) return `+${formatNumber(value)}`
  if (value < 0) return `−${formatNumber(-value)}`
  return "0"
}

/** Difference pill for counted vs system stock. */
export function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) return <StatusBadge tone="neutral">Khớp</StatusBadge>
  return (
    <StatusBadge tone={diff > 0 ? "fresh" : "danger"}>
      {signed(diff)} {diff > 0 ? "thừa" : "thiếu"}
    </StatusBadge>
  )
}

const REASONS = {
  "kiem-ke": "Kiểm kê",
  "hong-vo": "Hàng hỏng/vỡ",
  "het-han": "Hàng hết hạn",
  khac: "Khác",
} as const

const adjustSchema = z
  .object({
    quantity: z.string().trim().regex(/^\d+$/, "Nhập số lượng thực tế (số nguyên từ 0)"),
    reason: z.enum(["kiem-ke", "hong-vo", "het-han", "khac"]),
    note: z.string().trim().max(200, "Ghi chú tối đa 200 ký tự"),
  })
  .superRefine((values, ctx) => {
    if (values.reason === "khac" && !values.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Ghi rõ lý do điều chỉnh" })
    }
  })

type AdjustValues = z.infer<typeof adjustSchema>

function AdjustStockForm({ target, onDone }: { target: StockTarget; onDone: () => void }) {
  const level = useLevel(target)
  const form = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { quantity: String(level.quantity), reason: "kiem-ke", note: "" },
  })
  const errors = form.formState.errors
  const quantity = useWatch({ control: form.control, name: "quantity" })
  const actual = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null
  const diff = actual === null ? null : actual - level.quantity

  const onSubmit = form.handleSubmit((values) => {
    const next = Number(values.quantity)
    if (next === level.quantity) {
      toast.info("Số lượng không đổi, không cần điều chỉnh")
      onDone()
      return
    }
    useDb.getState().setStockLevel(target.storeId, target.product.id, { quantity: next })
    toast.success(`Đã điều chỉnh tồn: ${formatNumber(level.quantity)} → ${formatNumber(next)}`, {
      description: `${target.product.name} · ${REASONS[values.reason]}${values.note ? ` · ${values.note}` : ""}`,
    })
    onDone()
  })

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <ProductCell product={target.product} showBarcode={false} />

      <div className="grid grid-cols-3 items-start gap-3 rounded-lg bg-muted/60 p-3">
        <div>
          <div className="text-xs text-muted-foreground">Tồn hệ thống</div>
          <div className="tabular mt-1.5 text-lg font-semibold">{formatNumber(level.quantity)}</div>
        </div>
        <Field data-invalid={!!errors.quantity} className="gap-1">
          <FieldLabel htmlFor="adjust-quantity" className="text-xs font-normal text-muted-foreground">
            Thực tế
          </FieldLabel>
          <Input
            id="adjust-quantity"
            inputMode="numeric"
            autoComplete="off"
            className="tabular h-9 bg-card text-base font-semibold"
            aria-invalid={!!errors.quantity}
            {...form.register("quantity")}
          />
        </Field>
        <div>
          <div className="text-xs text-muted-foreground">Chênh lệch</div>
          <div className="mt-2">
            {diff === null ? <span className="text-muted-foreground">—</span> : <DiffBadge diff={diff} />}
          </div>
        </div>
      </div>
      <FieldError errors={[errors.quantity]} className="-mt-2" />

      <Controller
        control={form.control}
        name="reason"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="adjust-reason">Lý do</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="adjust-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.entries(REASONS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />

      <Field data-invalid={!!errors.note}>
        <FieldLabel htmlFor="adjust-note">Ghi chú</FieldLabel>
        <Textarea
          id="adjust-note"
          rows={2}
          placeholder="VD: vỡ 2 chai khi xếp kệ"
          aria-invalid={!!errors.note}
          {...form.register("note")}
        />
        <FieldError errors={[errors.note]} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit">Lưu điều chỉnh</Button>
      </DialogFooter>
    </form>
  )
}

export function AdjustStockDialog({
  target,
  storeLabel,
  onClose,
}: {
  target: StockTarget | null
  storeLabel: string
  onClose: () => void
}) {
  const shown = useLastTarget(target)
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Điều chỉnh tồn kho</DialogTitle>
          <DialogDescription>Nhập số lượng đếm thực tế tại {storeLabel.toLowerCase()}.</DialogDescription>
        </DialogHeader>
        {shown ? <AdjustStockForm key={shown.product.id} target={shown} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

const minSchema = z.object({
  minQuantity: z
    .string()
    .trim()
    .regex(/^\d+$/, "Nhập định mức (số nguyên từ 0)")
    .refine((v) => !/^\d+$/.test(v) || Number(v) <= 9999, "Định mức tối đa 9.999"),
})

type MinValues = z.infer<typeof minSchema>

function MinQuantityForm({ target, onDone }: { target: StockTarget; onDone: () => void }) {
  const level = useLevel(target)
  const form = useForm<MinValues>({
    resolver: zodResolver(minSchema),
    defaultValues: { minQuantity: String(level.minQuantity) },
  })
  const errors = form.formState.errors
  const value = useWatch({ control: form.control, name: "minQuantity" })
  const min = /^\d+$/.test(value.trim()) ? Number(value) : null
  const preview = min === null ? null : STOCK_STATE[stockState({ quantity: level.quantity, minQuantity: min })]

  const onSubmit = form.handleSubmit((values) => {
    const next = Number(values.minQuantity)
    if (next !== level.minQuantity) {
      useDb.getState().setStockLevel(target.storeId, target.product.id, { minQuantity: next })
      toast.success(`Đã đổi định mức tối thiểu: ${formatNumber(level.minQuantity)} → ${formatNumber(next)}`, {
        description: target.product.name,
      })
    }
    onDone()
  })

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <ProductCell product={target.product} showBarcode={false} />
      <Field data-invalid={!!errors.minQuantity}>
        <FieldLabel htmlFor="min-quantity">Định mức tối thiểu</FieldLabel>
        <Input
          id="min-quantity"
          inputMode="numeric"
          autoComplete="off"
          className="tabular"
          aria-invalid={!!errors.minQuantity}
          {...form.register("minQuantity")}
        />
        {errors.minQuantity ? (
          <FieldError errors={[errors.minQuantity]} />
        ) : (
          <FieldDescription className="text-xs">
            Khi tồn bằng hoặc thấp hơn định mức, mặt hàng được cảnh báo “Sắp hết” và gợi ý khi tạo phiếu nhập.
          </FieldDescription>
        )}
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">
          Tồn hiện tại <span className="tabular font-semibold text-foreground">{formatNumber(level.quantity)}</span>
        </span>
        {preview ? <StatusBadge tone={preview.tone}>{preview.label}</StatusBadge> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit">Lưu định mức</Button>
      </DialogFooter>
    </form>
  )
}

export function MinQuantityDialog({
  target,
  storeLabel,
  onClose,
}: {
  target: StockTarget | null
  storeLabel: string
  onClose: () => void
}) {
  const shown = useLastTarget(target)
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa định mức tối thiểu</DialogTitle>
          <DialogDescription>Áp dụng cho {storeLabel.toLowerCase()}.</DialogDescription>
        </DialogHeader>
        {shown ? <MinQuantityForm key={shown.product.id} target={shown} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}
