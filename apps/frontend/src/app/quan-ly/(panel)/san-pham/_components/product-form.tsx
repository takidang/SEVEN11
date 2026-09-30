"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useProducts } from "@/hooks/use-catalog"
import { discountPercent, formatPercent, formatVND, normalizeText } from "@/lib/format"
import { cn } from "@/lib/utils"
import { newId, useDb } from "@/stores/db"
import type { Category, Product, ProductUnit } from "@/types"

import { StoreStockTable } from "./store-stock-table"

export const PRODUCT_UNITS = [
  "cái",
  "ly",
  "lon",
  "chai",
  "hộp",
  "gói",
  "túi",
  "lốc",
  "thùng",
  "vỉ",
  "combo",
  "phần",
] as const satisfies readonly ProductUnit[]

const digits = /^\d+$/

const schema = z
  .object({
    name: z.string().trim().min(3, "Tên sản phẩm cần ít nhất 3 ký tự").max(120, "Tên tối đa 120 ký tự"),
    categoryId: z.string().min(1, "Chọn danh mục"),
    subcategoryId: z.string().min(1, "Chọn nhóm hàng"),
    brand: z.string().trim().min(1, "Nhập thương hiệu"),
    unit: z.enum(PRODUCT_UNITS, "Chọn đơn vị tính"),
    origin: z.string().trim().min(1, "Nhập xuất xứ"),
    barcode: z
      .string()
      .trim()
      .regex(/^\d{13}$/, "Mã vạch gồm đúng 13 chữ số"),
    sku: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{4,20}$/, "SKU gồm 4–20 ký tự chữ, số hoặc dấu gạch ngang"),
    price: z
      .string()
      .trim()
      .regex(digits, "Nhập giá bán (số nguyên, đơn vị đồng)")
      .refine((v) => !digits.test(v) || Number(v) > 0, "Giá bán phải lớn hơn 0"),
    compareAtPrice: z.string().trim().regex(/^\d*$/, "Chỉ nhập số"),
    costPrice: z.string().trim().regex(digits, "Nhập giá vốn (số nguyên, đơn vị đồng)"),
    shelfLifeDays: z
      .string()
      .trim()
      .regex(/^\d*$/, "Chỉ nhập số ngày")
      .refine((v) => v === "" || Number(v) >= 1, "Hạn dùng tối thiểu 1 ngày"),
    image: z
      .string()
      .trim()
      .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://"),
    isNew: z.boolean(),
    ageRestricted: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.compareAtPrice && digits.test(values.price) && Number(values.compareAtPrice) <= Number(values.price)) {
      ctx.addIssue({
        code: "custom",
        path: ["compareAtPrice"],
        message: "Giá gốc phải lớn hơn giá bán (hoặc để trống)",
      })
    }
  })

type FormValues = z.infer<typeof schema>

/** Next "7E1xxxx" code after the highest one in the catalog. */
export function suggestSku(products: Product[]) {
  let max = 10000
  for (const p of products) {
    const match = /^7E(\d+)$/.exec(p.sku)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `7E${max + 1}`
}

/** Random EAN-13 with the Vietnamese GS1 prefix (893) and a valid check digit. */
function randomEan13() {
  let code = "893"
  for (let i = 0; i < 9; i++) code += Math.floor(Math.random() * 10)
  const sum = [...code].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return code + ((10 - (sum % 10)) % 10)
}

function uniqueSlug(name: string, products: Product[]) {
  const base =
    normalizeText(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "san-pham"
  const taken = new Set(products.map((p) => p.slug))
  let slug = base
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
  return slug
}

function toFormValues(product: Product | null, products: Product[]): FormValues {
  if (!product) {
    return {
      name: "",
      categoryId: "",
      subcategoryId: "",
      brand: "",
      unit: "cái",
      origin: "Việt Nam",
      barcode: "",
      sku: suggestSku(products),
      price: "",
      compareAtPrice: "",
      costPrice: "",
      shelfLifeDays: "",
      image: "",
      isNew: true,
      ageRestricted: false,
      isActive: true,
    }
  }
  return {
    name: product.name,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    brand: product.brand,
    unit: product.unit,
    origin: product.origin,
    barcode: product.barcode,
    sku: product.sku,
    price: String(product.price),
    compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : "",
    costPrice: String(product.costPrice),
    shelfLifeDays: product.shelfLifeDays ? String(product.shelfLifeDays) : "",
    image: product.image,
    isNew: !!product.isNew,
    ageRestricted: !!product.ageRestricted,
    isActive: product.isActive,
  }
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** Admin create / edit form for a product. `product = null` creates a new one. */
export function ProductForm({
  product,
  categories,
  scopeStoreId,
  onCancel,
  onSaved,
}: {
  product: Product | null
  categories: Category[]
  scopeStoreId: string | null
  onCancel: () => void
  onSaved: (product: Product) => void
}) {
  const products = useProducts()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(product, products),
  })
  const { control, register, formState } = form
  const errors = formState.errors

  const [categoryId, image, price, costPrice, compareAtPrice, unit] = useWatch({
    control,
    name: ["categoryId", "image", "price", "costPrice", "compareAtPrice", "unit"],
  })
  const category = categories.find((c) => c.id === categoryId)
  const priceValue = digits.test(price) ? Number(price) : 0
  const costValue = digits.test(costPrice) ? Number(costPrice) : null
  const margin = priceValue > 0 && costValue !== null ? (priceValue - costValue) / priceValue : null
  const discount = digits.test(compareAtPrice) ? discountPercent(priceValue, Number(compareAtPrice)) : null

  const onSubmit = form.handleSubmit((values) => {
    const db = useDb.getState()
    const others = db.products.filter((p) => p.id !== product?.id)
    const sku = values.sku.toUpperCase()
    let invalid = false
    if (others.some((p) => p.sku.toUpperCase() === sku)) {
      form.setError("sku", { message: "SKU này đã được dùng cho sản phẩm khác" })
      invalid = true
    }
    const duplicate = others.find((p) => p.barcode === values.barcode)
    if (duplicate) {
      form.setError("barcode", { message: `Mã vạch đã dùng cho “${duplicate.name}”` })
      invalid = true
    }
    if (invalid) return

    const saved: Product = {
      ...(product ?? {}),
      id: product?.id ?? newId("p"),
      slug: product?.slug ?? uniqueSlug(values.name, db.products),
      createdAt: product?.createdAt ?? new Date().toISOString(),
      sku,
      barcode: values.barcode,
      name: values.name,
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId,
      brand: values.brand,
      unit: values.unit,
      origin: values.origin,
      image: values.image,
      price: Number(values.price),
      compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : undefined,
      costPrice: Number(values.costPrice),
      shelfLifeDays: values.shelfLifeDays ? Number(values.shelfLifeDays) : undefined,
      isNew: values.isNew || undefined,
      ageRestricted: values.ageRestricted || undefined,
      isActive: values.isActive,
    }
    db.saveProduct(saved)
    toast.success(product ? "Đã lưu thay đổi sản phẩm" : "Đã thêm sản phẩm mới", {
      description: product ? saved.name : `${saved.name} · ${saved.sku} — tồn kho ban đầu 0 ở mọi cửa hàng`,
    })
    onSaved(saved)
  })

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
        <Section title="Thông tin chung">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.name} className="sm:col-span-2">
              <FieldLabel htmlFor="product-name">Tên sản phẩm</FieldLabel>
              <Input
                id="product-name"
                placeholder="VD: Trà Sữa Oolong Rang size L"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Controller
              control={control}
              name="categoryId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-category">Danh mục</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      const next = categories.find((c) => c.id === value)
                      form.setValue("subcategoryId", next?.subcategories.length === 1 ? next.subcategories[0].id : "", {
                        shouldValidate: formState.isSubmitted,
                      })
                      if (next?.ageRestricted) form.setValue("ageRestricted", true)
                    }}
                  >
                    <SelectTrigger id="product-category" className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Chọn danh mục" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="subcategoryId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-subcategory">Nhóm hàng</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!category}>
                    <SelectTrigger id="product-subcategory" className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder={category ? "Chọn nhóm hàng" : "Chọn danh mục trước"} />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {category?.subcategories.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Field data-invalid={!!errors.brand}>
              <FieldLabel htmlFor="product-brand">Thương hiệu</FieldLabel>
              <Input
                id="product-brand"
                placeholder="VD: 7-Select"
                aria-invalid={!!errors.brand}
                {...register("brand")}
              />
              <FieldError errors={[errors.brand]} />
            </Field>

            <Field data-invalid={!!errors.origin}>
              <FieldLabel htmlFor="product-origin">Xuất xứ</FieldLabel>
              <Input id="product-origin" aria-invalid={!!errors.origin} {...register("origin")} />
              <FieldError errors={[errors.origin]} />
            </Field>

            <Controller
              control={control}
              name="unit"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-unit">Đơn vị tính</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="product-unit" className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Chọn đơn vị" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {PRODUCT_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u.charAt(0).toUpperCase() + u.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Field data-invalid={!!errors.shelfLifeDays}>
              <FieldLabel htmlFor="product-shelf-life">Hạn dùng sau khi nhập</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="product-shelf-life"
                  inputMode="numeric"
                  placeholder="Để trống nếu dài hạn"
                  aria-invalid={!!errors.shelfLifeDays}
                  {...register("shelfLifeDays")}
                />
                <InputGroupAddon align="inline-end">ngày</InputGroupAddon>
              </InputGroup>
              <FieldError errors={[errors.shelfLifeDays]} />
            </Field>
          </div>
        </Section>

        <Section title="Giá" description="Số nguyên, đơn vị đồng. Giá gốc chỉ nhập khi sản phẩm đang giảm giá.">
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                { name: "price", label: "Giá bán", placeholder: "0" },
                { name: "compareAtPrice", label: "Giá gốc", placeholder: "Không giảm" },
                { name: "costPrice", label: "Giá vốn", placeholder: "0" },
              ] as const
            ).map((f) => (
              <Field key={f.name} data-invalid={!!errors[f.name]}>
                <FieldLabel htmlFor={`product-${f.name}`}>{f.label}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`product-${f.name}`}
                    inputMode="numeric"
                    placeholder={f.placeholder}
                    className="tabular"
                    aria-invalid={!!errors[f.name]}
                    {...register(f.name)}
                  />
                  <InputGroupAddon align="inline-end">₫</InputGroupAddon>
                </InputGroup>
                <FieldError errors={[errors[f.name]]} />
              </Field>
            ))}
          </div>

          <div className="space-y-1.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
            {margin === null ? (
              <p className="text-muted-foreground">Nhập giá bán và giá vốn để xem lãi gộp.</p>
            ) : (
              <p className="text-muted-foreground">
                Lãi gộp{" "}
                <span className="tabular font-semibold text-foreground">
                  {formatVND(priceValue - (costValue ?? 0))}
                </span>{" "}
                / {unit} · Biên lợi nhuận{" "}
                <span className={cn("tabular font-semibold", margin < 0.2 ? "text-warning" : "text-foreground")}>
                  {formatPercent(margin)}
                </span>
                {discount ? (
                  <>
                    {" "}
                    · Đang giảm <span className="font-semibold text-sale">{discount}%</span> so với giá gốc
                  </>
                ) : null}
              </p>
            )}
            {costValue !== null && priceValue > 0 && costValue >= priceValue ? (
              <p className="flex items-start gap-1.5 font-medium text-warning">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                Giá vốn không thấp hơn giá bán — mỗi sản phẩm bán ra sẽ bị lỗ.
              </p>
            ) : margin !== null && margin < 0.2 ? (
              <p className="flex items-start gap-1.5 font-medium text-warning">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                Biên lợi nhuận dưới 20%.
              </p>
            ) : null}
          </div>
        </Section>

        <Section title="Mã hàng & hình ảnh">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.sku}>
              <FieldLabel htmlFor="product-sku">Mã SKU</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="product-sku"
                  className="font-mono uppercase"
                  aria-invalid={!!errors.sku}
                  {...register("sku")}
                />
                {!product ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      onClick={() =>
                        form.setValue("sku", suggestSku(useDb.getState().products), {
                          shouldValidate: formState.isSubmitted,
                        })
                      }
                    >
                      Gợi ý
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
              <FieldError errors={[errors.sku]} />
            </Field>

            <Field data-invalid={!!errors.barcode}>
              <FieldLabel htmlFor="product-barcode">Mã vạch (EAN-13)</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="product-barcode"
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="13 chữ số"
                  className="font-mono"
                  aria-invalid={!!errors.barcode}
                  {...register("barcode")}
                />
                {!product ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      onClick={() => form.setValue("barcode", randomEan13(), { shouldValidate: true })}
                      aria-label="Tạo mã vạch mới"
                    >
                      <RefreshCwIcon /> Tạo mã
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
              <FieldError errors={[errors.barcode]} />
            </Field>
          </div>

          <div className="flex items-start gap-3">
            <ProductImage
              key={image}
              src={image}
              alt="Ảnh xem trước"
              size={72}
              className="size-18 shrink-0 rounded-lg bg-white ring-1 ring-border"
            />
            <Field data-invalid={!!errors.image} className="min-w-0 flex-1">
              <FieldLabel htmlFor="product-image">Đường dẫn ảnh</FieldLabel>
              <Input
                id="product-image"
                type="url"
                placeholder="https://…"
                aria-invalid={!!errors.image}
                {...register("image")}
              />
              {errors.image ? (
                <FieldError errors={[errors.image]} />
              ) : (
                <FieldDescription className="text-xs">
                  Ảnh vuông, nền trắng. Xem trước hiển thị bên trái.
                </FieldDescription>
              )}
            </Field>
          </div>
        </Section>

        <Section title="Hiển thị & bán hàng">
          <div className="divide-y rounded-lg ring-1 ring-border">
            {(
              [
                {
                  name: "isActive",
                  label: "Đang bán",
                  description: "Tắt để ngừng bán trên web và tại quầy. Tồn kho vẫn được giữ.",
                },
                { name: "isNew", label: "Sản phẩm mới", description: "Gắn nhãn MỚI trên thẻ sản phẩm." },
                {
                  name: "ageRestricted",
                  label: "Giới hạn 18+",
                  description: "Yêu cầu xác nhận tuổi khi thêm vào giỏ hoặc bán tại quầy.",
                },
              ] as const
            ).map((f) => (
              <Controller
                key={f.name}
                control={control}
                name={f.name}
                render={({ field }) => (
                  <Field orientation="horizontal" className="px-3 py-2.5">
                    <FieldContent>
                      <FieldLabel htmlFor={`product-${f.name}`}>{f.label}</FieldLabel>
                      <FieldDescription className="text-xs">{f.description}</FieldDescription>
                    </FieldContent>
                    <Switch id={`product-${f.name}`} checked={field.value} onCheckedChange={field.onChange} />
                  </Field>
                )}
              />
            ))}
          </div>
        </Section>

        {product ? (
          <Section title="Tồn kho theo cửa hàng" description="Số lượng hiện có / định mức tối thiểu ở từng cửa hàng.">
            <StoreStockTable productId={product.id} highlightStoreId={scopeStoreId} />
          </Section>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t bg-card px-5 py-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit">{product ? "Lưu thay đổi" : "Thêm sản phẩm"}</Button>
      </div>
    </form>
  )
}
