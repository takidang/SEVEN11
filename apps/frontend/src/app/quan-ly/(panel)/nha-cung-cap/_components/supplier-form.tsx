"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { newId, useDb } from "@/stores/db"
import type { Category, Supplier } from "@/types"

export const SUPPLIER_STATUS = {
  active: { label: "Đang hợp tác", tone: "fresh" },
  inactive: { label: "Ngừng hợp tác", tone: "neutral" },
} as const

const schema = z.object({
  name: z.string().trim().min(3, "Tên nhà cung cấp cần ít nhất 3 ký tự").max(120, "Tối đa 120 ký tự"),
  contactName: z.string().trim().min(2, "Nhập tên người liên hệ").max(60, "Tối đa 60 ký tự"),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^0\d{9,10}$/, "Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0")),
  email: z.string().trim().pipe(z.email("Email không hợp lệ")),
  address: z.string().trim().min(5, "Nhập địa chỉ nhà cung cấp").max(200, "Tối đa 200 ký tự"),
  taxCode: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Mã số thuế gồm đúng 10 chữ số"),
  categoryIds: z.array(z.string()).min(1, "Chọn ít nhất một danh mục cung cấp"),
  active: z.boolean(),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function nextCode(suppliers: Supplier[]) {
  let max = 0
  for (const s of suppliers) {
    const match = /^NCC(\d+)$/.exec(s.code)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `NCC${String(max + 1).padStart(3, "0")}`
}

/** Admin create / edit form for a supplier (`supplier = null` creates one). */
export function SupplierForm({
  supplier,
  categories,
  onCancel,
  onSaved,
}: {
  supplier: Supplier | null
  categories: Category[]
  onCancel: () => void
  onSaved: (supplier: Supplier) => void
}) {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: supplier?.name ?? "",
      contactName: supplier?.contactName ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      taxCode: supplier?.taxCode ?? "",
      categoryIds: supplier?.categoryIds ?? [],
      active: supplier ? supplier.status === "active" : true,
    },
  })
  const errors = form.formState.errors

  const onSubmit = form.handleSubmit((values) => {
    const db = useDb.getState()
    const duplicate = db.suppliers.find((s) => s.id !== supplier?.id && s.taxCode === values.taxCode)
    if (duplicate) {
      form.setError("taxCode", { message: `Mã số thuế đã dùng cho ${duplicate.name}` })
      return
    }
    const saved: Supplier = {
      id: supplier?.id ?? newId("sup"),
      code: supplier?.code ?? nextCode(db.suppliers),
      name: values.name,
      contactName: values.contactName,
      phone: values.phone,
      email: values.email,
      address: values.address,
      taxCode: values.taxCode,
      categoryIds: categories.map((c) => c.id).filter((id) => values.categoryIds.includes(id)),
      status: values.active ? "active" : "inactive",
    }
    db.saveSupplier(saved)
    toast.success(supplier ? "Đã lưu thông tin nhà cung cấp" : "Đã thêm nhà cung cấp", {
      description: `${saved.code} · ${saved.name}`,
    })
    onSaved(saved)
  })

  const text = (
    name: "name" | "contactName" | "phone" | "email" | "address" | "taxCode",
    label: string,
    props: React.ComponentProps<"input"> = {},
    className?: string,
  ) => (
    <Field data-invalid={!!errors[name]} className={className}>
      <FieldLabel htmlFor={`supplier-${name}`}>{label}</FieldLabel>
      <Input id={`supplier-${name}`} aria-invalid={!!errors[name]} {...props} {...form.register(name)} />
      <FieldError errors={[errors[name]]} />
    </Field>
  )

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Thông tin doanh nghiệp</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Tên nhà cung cấp", { placeholder: "VD: Công ty TNHH Thực phẩm An Bình" }, "sm:col-span-2")}
            {text("taxCode", "Mã số thuế", { inputMode: "numeric", maxLength: 10, className: "font-mono" })}
            {text("address", "Địa chỉ", {}, "sm:col-span-2")}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Liên hệ đặt hàng</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("contactName", "Người liên hệ")}
            {text("phone", "Số điện thoại", { inputMode: "tel", placeholder: "028 3900 0101" })}
            {text("email", "Email", { type: "email", placeholder: "dathang@congty.vn" }, "sm:col-span-2")}
          </div>
        </section>

        <Controller
          control={form.control}
          name="categoryIds"
          render={({ field, fieldState }) => (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Danh mục cung cấp</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Phiếu nhập với nhà cung cấp này chỉ chọn được sản phẩm thuộc các danh mục đã đánh dấu.
                </p>
              </div>
              <div
                className={cn(
                  "grid gap-1 rounded-lg p-1 ring-1 sm:grid-cols-2",
                  fieldState.invalid ? "ring-destructive" : "ring-border",
                )}
              >
                {categories.map((category) => {
                  const checked = field.value.includes(category.id)
                  const id = `supplier-category-${category.id}`
                  return (
                    <label
                      key={category.id}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-muted",
                        checked && "bg-brand-soft/60 hover:bg-brand-soft",
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next ? [...field.value, category.id] : field.value.filter((v) => v !== category.id),
                          )
                        }
                      />
                      {category.name}
                    </label>
                  )
                })}
              </div>
              <FieldError errors={[fieldState.error]} />
            </section>
          )}
        />

        <Controller
          control={form.control}
          name="active"
          render={({ field }) => (
            <Field orientation="horizontal" className="rounded-lg px-3 py-2.5 ring-1 ring-border">
              <FieldContent>
                <FieldLabel htmlFor="supplier-active">Đang hợp tác</FieldLabel>
                <FieldDescription className="text-xs">
                  Tắt để ngừng đặt hàng: nhà cung cấp không còn xuất hiện khi tạo phiếu nhập mới.
                </FieldDescription>
              </FieldContent>
              <Switch id="supplier-active" checked={field.value} onCheckedChange={field.onChange} />
            </Field>
          )}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t bg-card px-5 py-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit">{supplier ? "Lưu thay đổi" : "Thêm nhà cung cấp"}</Button>
      </div>
    </form>
  )
}
