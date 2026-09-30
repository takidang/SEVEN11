"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { PackageSearchIcon, PlusIcon, SendIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useCategories, useProductMap, useProducts } from "@/hooks/use-catalog"
import { formatNumber, formatVND, normalizeText, toDateKey } from "@/lib/format"
import { cn } from "@/lib/utils"
import { newId, useDb } from "@/stores/db"
import { useCurrentStaff } from "@/stores/session"
import type { Product, PurchaseOrder, StockLevel, Supplier } from "@/types"

import { planLowStockOrder, REORDER_MULTIPLIER, type Suggestion } from "./suggestions"

export type PurchaseFormMode = { kind: "create"; suggest: boolean } | { kind: "edit"; purchaseOrder: PurchaseOrder }

const digits = /^\d+$/

/** Field captions for item rows on phones (a header row labels the columns from `md` up). */
const MOBILE_CAPTION = "text-xs text-muted-foreground md:hidden"

const itemSchema = z.object({
  productId: z.string(),
  quantity: z
    .string()
    .trim()
    .regex(digits, "Nhập số lượng")
    .refine((v) => !digits.test(v) || Number(v) >= 1, "Tối thiểu 1"),
  costPrice: z.string().trim().regex(digits, "Nhập giá vốn"),
  lotCode: z.string().trim().max(24, "Tối đa 24 ký tự"),
  expiresAt: z.string(),
})

const schema = z.object({
  storeId: z.string().min(1, "Chọn cửa hàng nhận hàng"),
  supplierId: z.string().min(1, "Chọn nhà cung cấp"),
  expectedAt: z.string(),
  note: z.string().trim().max(300, "Ghi chú tối đa 300 ký tự"),
  items: z.array(itemSchema).min(1, "Thêm ít nhất một mặt hàng vào phiếu"),
})

type FormValues = z.infer<typeof schema>
type ItemValues = FormValues["items"][number]

function dateKeyIn(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

function isoAt(dateKey: string, hours: number, minutes = 0) {
  const [y, m, d] = dateKey.split("-").map(Number)
  return new Date(y, m - 1, d, hours, minutes).toISOString()
}

function itemFor(product: Product, quantity: number): ItemValues {
  return {
    productId: product.id,
    quantity: String(quantity),
    costPrice: String(product.costPrice),
    lotCode: "",
    expiresAt: product.shelfLifeDays ? dateKeyIn(product.shelfLifeDays) : "",
  }
}

const suggestionItems = (list: Suggestion[] | undefined) => (list ?? []).map((s) => itemFor(s.product, s.quantity))

function defaultQuantity(level: StockLevel | undefined) {
  if (!level) return 12
  return Math.max(level.minQuantity * REORDER_MULTIPLIER - level.quantity, level.minQuantity, 1)
}

const commandFilter = (_value: string, search: string, keywords?: string[]) => {
  const haystack = normalizeText((keywords ?? []).join(" "))
  return normalizeText(search)
    .split(/\s+/)
    .every((term) => haystack.includes(term))
    ? 1
    : 0
}

function ProductPicker({
  supplier,
  levels,
  addedIds,
  onPick,
}: {
  supplier: Supplier | undefined
  levels: Map<string, StockLevel> | null
  addedIds: Set<string>
  onPick: (product: Product) => void
}) {
  const [open, setOpen] = useState(false)
  const products = useProducts()
  const categories = useCategories()

  const groups = useMemo(() => {
    if (!supplier) return []
    return categories
      .filter((c) => supplier.categoryIds.includes(c.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) => ({
        category,
        products: products.filter((p) => p.isActive && p.categoryId === category.id),
      }))
  }, [supplier, categories, products])

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={!supplier}>
          <PlusIcon /> Thêm sản phẩm
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] p-0">
        <Command filter={commandFilter}>
          <CommandInput placeholder="Tìm tên, SKU hoặc mã vạch…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Không có sản phẩm phù hợp</CommandEmpty>
            {groups.map(({ category, products: items }) => (
              <CommandGroup key={category.id} heading={category.name}>
                {items.map((p) => {
                  const level = levels?.get(p.id)
                  const low = !!level && level.quantity <= level.minQuantity
                  return (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      keywords={[p.name, p.sku, p.barcode, p.brand]}
                      data-checked={addedIds.has(p.id)}
                      onSelect={() => onPick(p)}
                    >
                      <ProductImage
                        src={p.image}
                        alt=""
                        size={28}
                        className="size-7 shrink-0 rounded bg-white ring-1 ring-border"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{p.sku}</span>
                      </span>
                      {level ? (
                        <span
                          className={cn(
                            "tabular shrink-0 text-xs",
                            low ? "font-medium text-warning" : "text-muted-foreground",
                          )}
                        >
                          Tồn {formatNumber(level.quantity)}
                        </span>
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function PurchaseOrderForm({
  mode,
  scopeStoreId,
  onCancel,
  onSaved,
}: {
  mode: PurchaseFormMode
  scopeStoreId: string | null
  onCancel: () => void
  onSaved: (purchaseOrder: PurchaseOrder) => void
}) {
  const staff = useCurrentStaff()
  const products = useProducts()
  const productMap = useProductMap()
  const stock = useDb((s) => s.stock)
  const suppliers = useDb((s) => s.suppliers)
  const stores = useDb((s) => s.stores)
  const suggest = mode.kind === "create" && mode.suggest
  const editing = mode.kind === "edit" ? mode.purchaseOrder : null

  const [defaultValues] = useState<FormValues>(() => {
    if (editing) {
      return {
        storeId: editing.storeId,
        supplierId: editing.supplierId,
        expectedAt: editing.expectedAt ? toDateKey(editing.expectedAt) : "",
        note: editing.note ?? "",
        items: editing.items.map((it) => ({
          productId: it.productId,
          quantity: String(it.quantity),
          costPrice: String(it.costPrice),
          lotCode: it.lotCode ?? "",
          expiresAt: it.expiresAt ? toDateKey(it.expiresAt) : "",
        })),
      }
    }
    const values: FormValues = {
      storeId: scopeStoreId ?? "",
      supplierId: "",
      expectedAt: dateKeyIn(1),
      note: "",
      items: [],
    }
    if (suggest && scopeStoreId) {
      const plan = planLowStockOrder({ storeId: scopeStoreId, products, stock, suppliers })
      if (plan.topSupplierId) {
        values.supplierId = plan.topSupplierId
        values.items = suggestionItems(plan.bySupplier.get(plan.topSupplierId))
      }
    }
    return values
  })

  const [today] = useState(() => dateKeyIn(0))
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues })
  const { control, formState } = form
  const errors = formState.errors
  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" })

  const [storeId, supplierId, items] = useWatch({ control, name: ["storeId", "supplierId", "items"] })
  const supplier = suppliers.find((s) => s.id === supplierId)
  const store = stores.find((s) => s.id === storeId)

  const levels = useMemo(
    () => (storeId ? new Map(stock.filter((l) => l.storeId === storeId).map((l) => [l.productId, l] as const)) : null),
    [stock, storeId],
  )
  const plan = useMemo(
    () => (suggest && storeId ? planLowStockOrder({ storeId, products, stock, suppliers }) : null),
    [suggest, storeId, products, stock, suppliers],
  )

  const supplierOptions = suppliers.filter((s) => s.status === "active" || s.id === defaultValues.supplierId)
  const storeOptions = stores.filter((s) => s.status !== "closed")
  const addedIds = new Set(items.map((it) => it.productId))
  const totals = items.reduce(
    (acc, it) => {
      const quantity = digits.test(it.quantity) ? Number(it.quantity) : 0
      const cost = digits.test(it.costPrice) ? Number(it.costPrice) : 0
      return { units: acc.units + quantity, amount: acc.amount + quantity * cost }
    },
    { units: 0, amount: 0 },
  )

  const changeSupplier = (nextId: string) => {
    const next = suppliers.find((s) => s.id === nextId)
    const current = form.getValues("items")
    const kept = current.filter((it) => next?.categoryIds.includes(productMap.get(it.productId)?.categoryId ?? ""))
    let nextItems = kept
    if (plan) {
      const extra = suggestionItems(plan.bySupplier.get(nextId)).filter(
        (it) => !kept.some((k) => k.productId === it.productId),
      )
      nextItems = [...kept, ...extra]
    }
    form.setValue("supplierId", nextId, { shouldValidate: formState.isSubmitted })
    replace(nextItems)
    const dropped = current.length - kept.length
    if (dropped > 0) toast.info(`Đã bỏ ${dropped} mặt hàng không thuộc nhà cung cấp này`)
  }

  const changeStore = (nextId: string) => {
    form.setValue("storeId", nextId, { shouldValidate: formState.isSubmitted })
    if (!suggest) return
    const nextPlan = planLowStockOrder({ storeId: nextId, products, stock, suppliers })
    if (!nextPlan.topSupplierId) return
    form.setValue("supplierId", nextPlan.topSupplierId, { shouldValidate: formState.isSubmitted })
    replace(suggestionItems(nextPlan.bySupplier.get(nextPlan.topSupplierId)))
  }

  const pick = (product: Product) => {
    if (addedIds.has(product.id)) return
    append(itemFor(product, defaultQuantity(levels?.get(product.id))), { shouldFocus: false })
  }

  const save = (status: "draft" | "ordered") =>
    form.handleSubmit((values) => {
      const saved = useDb.getState().savePurchaseOrder({
        id: editing?.id ?? newId("po"),
        code: editing?.code ?? "",
        supplierId: values.supplierId,
        storeId: values.storeId,
        items: values.items.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          costPrice: Number(it.costPrice),
          lotCode: it.lotCode || undefined,
          expiresAt: it.expiresAt ? isoAt(it.expiresAt, 23, 59) : undefined,
        })),
        total: 0,
        status,
        note: values.note || undefined,
        createdBy: editing?.createdBy ?? staff?.id ?? "",
        createdAt: editing?.createdAt ?? new Date().toISOString(),
        expectedAt: values.expectedAt ? isoAt(values.expectedAt, 8) : undefined,
      })
      const name = suppliers.find((s) => s.id === saved.supplierId)?.name
      toast.success(status === "draft" ? `Đã lưu nháp ${saved.code}` : `Đã đặt hàng ${saved.code}`, {
        description: `${name} · ${saved.items.length} mặt hàng · ${formatVND(saved.total)}`,
      })
      onSaved(saved)
    })

  const itemsError = errors.items?.root?.message ?? errors.items?.message
  const rowErrors = Array.isArray(errors.items) ? errors.items.filter(Boolean).length : 0

  return (
    <form onSubmit={(event) => event.preventDefault()} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {suggest ? (
          <div className="flex gap-3 rounded-lg bg-brand-soft/60 p-3 text-sm ring-1 ring-brand/15">
            <PackageSearchIcon className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="space-y-1 text-foreground">
              {!plan ? (
                <p>Chọn cửa hàng nhận hàng để lấy danh sách mặt hàng sắp hết.</p>
              ) : plan.total === 0 ? (
                <p>
                  {store ? `Cửa hàng ${store.code}` : "Cửa hàng"} chưa có mặt hàng nào chạm định mức tối thiểu. Bạn vẫn
                  có thể thêm sản phẩm thủ công.
                </p>
              ) : (
                <>
                  <p>
                    {store ? `Cửa hàng ${store.code}` : "Cửa hàng"} có <b>{plan.total}</b> mặt hàng sắp hết, thuộc{" "}
                    {plan.bySupplier.size} nhà cung cấp. Phiếu đã điền sẵn hàng của nhà cung cấp đang chọn với số lượng
                    đủ {REORDER_MULTIPLIER}× định mức — đổi nhà cung cấp để lấy gợi ý tương ứng.
                  </p>
                  {plan.unassigned.length ? (
                    <p className="text-xs text-muted-foreground">
                      {plan.unassigned.length} mặt hàng chưa có nhà cung cấp đang hợp tác:{" "}
                      {plan.unassigned
                        .slice(0, 3)
                        .map((p) => p.name)
                        .join(", ")}
                      {plan.unassigned.length > 3 ? "…" : ""}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          {scopeStoreId || editing ? (
            <Field>
              <FieldLabel>Cửa hàng nhận</FieldLabel>
              <div className="flex h-8 items-center rounded-lg bg-muted px-2.5 text-sm">
                <span className="truncate">{store ? `${store.code} – ${store.name}` : "—"}</span>
              </div>
            </Field>
          ) : (
            <Controller
              control={control}
              name="storeId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="po-store">Cửa hàng nhận</FieldLabel>
                  <Select value={field.value} onValueChange={changeStore}>
                    <SelectTrigger id="po-store" className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Chọn cửa hàng" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {storeOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} – {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}

          <Controller
            control={control}
            name="supplierId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="po-supplier">Nhà cung cấp</FieldLabel>
                <Select value={field.value} onValueChange={changeSupplier}>
                  <SelectTrigger id="po-supplier" className="w-full" aria-invalid={fieldState.invalid}>
                    <SelectValue placeholder="Chọn nhà cung cấp">{supplier?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {supplierOptions.map((s) => {
                      const count = plan?.bySupplier.get(s.id)?.length
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {count ? <span className="text-xs text-muted-foreground">· {count} gợi ý</span> : null}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Field>
            <FieldLabel htmlFor="po-expected">Ngày giao dự kiến</FieldLabel>
            <Input id="po-expected" type="date" min={today} {...form.register("expectedAt")} />
          </Field>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Mặt hàng ({fields.length})</h3>
              <p className="text-xs text-muted-foreground">
                {supplier
                  ? `Chỉ hiện sản phẩm thuộc danh mục ${supplier.name} cung cấp.`
                  : "Chọn nhà cung cấp để thêm sản phẩm."}
              </p>
            </div>
            <ProductPicker supplier={supplier} levels={levels} addedIds={addedIds} onPick={pick} />
          </div>

          {fields.length ? (
            <div className="overflow-hidden rounded-lg ring-1 ring-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_60px_100px_88px_136px_100px_28px] gap-2 bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground md:grid">
                <span>Sản phẩm</span>
                <span className="text-right">SL</span>
                <span className="text-right">Giá vốn</span>
                <span>Mã lô</span>
                <span>Hạn dùng</span>
                <span className="text-right">Thành tiền</span>
                <span />
              </div>
              <ul className="divide-y">
                {fields.map((field, index) => {
                  const product = productMap.get(field.productId)
                  if (!product) return null
                  const value = items[index]
                  const rowError = errors.items?.[index]
                  const quantity = value && digits.test(value.quantity) ? Number(value.quantity) : 0
                  const cost = value && digits.test(value.costPrice) ? Number(value.costPrice) : 0
                  const level = levels?.get(product.id)
                  return (
                    <li
                      key={field.id}
                      className="grid grid-cols-2 items-center gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_60px_100px_88px_136px_100px_28px]"
                    >
                      <div className="col-span-2 flex min-w-0 items-center gap-2.5 md:col-span-1">
                        <ProductImage
                          src={product.image}
                          alt={product.name}
                          size={32}
                          className="size-8 shrink-0 rounded-md bg-white ring-1 ring-border"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium" title={product.name}>
                            {product.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{product.sku}</span>
                            {level ? (
                              <span className={cn(level.quantity <= level.minQuantity && "font-medium text-warning")}>
                                {" "}
                                · Tồn {formatNumber(level.quantity)}/{formatNumber(level.minQuantity)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="md:hidden"
                          aria-label={`Bỏ ${product.name}`}
                          onClick={() => remove(index)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                      <label className="grid gap-1">
                        <span className={MOBILE_CAPTION}>Số lượng</span>
                        <Input
                          inputMode="numeric"
                          aria-label={`Số lượng ${product.name}`}
                          aria-invalid={!!rowError?.quantity}
                          title={rowError?.quantity?.message}
                          className="tabular h-8 text-right"
                          {...form.register(`items.${index}.quantity`)}
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className={MOBILE_CAPTION}>Giá vốn (₫)</span>
                        <Input
                          inputMode="numeric"
                          aria-label={`Giá vốn ${product.name}`}
                          aria-invalid={!!rowError?.costPrice}
                          title={rowError?.costPrice?.message}
                          className="tabular h-8 text-right"
                          {...form.register(`items.${index}.costPrice`)}
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className={MOBILE_CAPTION}>Mã lô</span>
                        <Input
                          aria-label={`Mã lô ${product.name}`}
                          placeholder="Tự tạo"
                          aria-invalid={!!rowError?.lotCode}
                          className="h-8 font-mono text-xs"
                          {...form.register(`items.${index}.lotCode`)}
                        />
                      </label>
                      {product.shelfLifeDays ? (
                        <label className="grid gap-1">
                          <span className={MOBILE_CAPTION}>Hạn dùng</span>
                          <Input
                            type="date"
                            min={today}
                            aria-label={`Hạn dùng ${product.name}`}
                            className="h-8 px-2 text-xs"
                            {...form.register(`items.${index}.expiresAt`)}
                          />
                        </label>
                      ) : (
                        <span className="self-end pb-2 text-xs text-muted-foreground md:self-center md:pb-0">
                          Không theo hạn
                        </span>
                      )}
                      <span className="tabular col-span-2 text-right text-sm font-medium md:col-span-1">
                        <span className="font-normal text-muted-foreground md:hidden">Thành tiền </span>
                        {formatVND(quantity * cost)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="hidden md:inline-flex"
                        aria-label={`Bỏ ${product.name}`}
                        onClick={() => remove(index)}
                      >
                        <XIcon />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {supplier ? "Chưa có mặt hàng. Bấm “Thêm sản phẩm” để chọn hàng cần nhập." : "Chọn nhà cung cấp trước."}
            </div>
          )}
          {itemsError ? <p className="text-sm text-destructive">{itemsError}</p> : null}
          {rowErrors ? (
            <p className="text-sm text-destructive">
              Kiểm tra lại {rowErrors} dòng được đánh dấu đỏ (số lượng tối thiểu 1, giá vốn là số nguyên).
            </p>
          ) : null}
        </section>

        <Field data-invalid={!!errors.note}>
          <FieldLabel htmlFor="po-note">Ghi chú cho nhà cung cấp</FieldLabel>
          <Textarea
            id="po-note"
            rows={2}
            placeholder="VD: Giao trước 6h sáng, kiểm tra hạn dùng khi nhận"
            aria-invalid={!!errors.note}
            {...form.register("note")}
          />
          <FieldError errors={[errors.note]} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-card px-5 py-3">
        <div className="mr-auto min-w-0 max-sm:w-full">
          <div className="text-xs text-muted-foreground">
            {fields.length} mặt hàng · {formatNumber(totals.units)} sản phẩm
          </div>
          <div className="tabular text-lg leading-tight font-semibold">{formatVND(totals.amount)}</div>
        </div>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="button" variant="outline" onClick={save("draft")}>
          Lưu nháp
        </Button>
        <Button type="button" onClick={save("ordered")}>
          <SendIcon /> Đặt hàng
        </Button>
      </div>
    </form>
  )
}

/** Create (optionally prefilled with low-stock suggestions) or edit a draft purchase order. */
export function PurchaseOrderFormSheet({
  open,
  mode,
  scopeStoreId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  mode: PurchaseFormMode | null
  scopeStoreId: string | null
  onOpenChange: (open: boolean) => void
  onSaved: (purchaseOrder: PurchaseOrder) => void
}) {
  // Keep the last mode so the form stays rendered while the sheet animates closed.
  const [shown, setShown] = useState(mode)
  if (mode && mode !== shown) setShown(mode)
  const current = mode ?? shown
  const editing = current?.kind === "edit" ? current.purchaseOrder : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle className="text-base font-semibold">
            {editing ? `Sửa phiếu nháp ${editing.code}` : "Tạo phiếu nhập hàng"}
          </SheetTitle>
          <SheetDescription>
            {current?.kind === "create" && current.suggest
              ? "Gợi ý từ các mặt hàng đang chạm định mức tối thiểu của cửa hàng."
              : "Chọn nhà cung cấp, thêm sản phẩm và số lượng cần nhập."}
          </SheetDescription>
        </SheetHeader>
        {current ? (
          <PurchaseOrderForm
            key={editing ? editing.id : current.kind === "create" && current.suggest ? "suggest" : "create"}
            mode={current}
            scopeStoreId={scopeStoreId}
            onCancel={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
