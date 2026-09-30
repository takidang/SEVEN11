"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LogOutIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Panel } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatDate, formatPhone, formatVND, toDateKey } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import type { Customer } from "@/types"

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Nhập họ và tên").max(60, "Họ tên tối đa 60 ký tự"),
  email: z
    .string()
    .trim()
    .max(120, "Email tối đa 120 ký tự")
    .refine((value) => !value || z.email().safeParse(value).success, "Email chưa đúng định dạng"),
  birthday: z
    .string()
    .refine(
      (value) =>
        !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= toDateKey(new Date())),
      "Ngày sinh không hợp lệ",
    ),
})

type ProfileValues = z.infer<typeof profileSchema>

export function ProfileTab({ customer, onSignOut }: { customer: Customer; onSignOut: () => void }) {
  const now = useNow(60_000)
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: customer.fullName, email: customer.email ?? "", birthday: customer.birthday ?? "" },
  })
  const { errors, isDirty } = form.formState

  const submit = form.handleSubmit((values) => {
    const next = { fullName: values.fullName.trim(), email: values.email.trim(), birthday: values.birthday }
    useDb.getState().updateCustomer(customer.id, {
      fullName: next.fullName,
      email: next.email || undefined,
      birthday: next.birthday || undefined,
    })
    form.reset(next)
    toast.success("Đã lưu thông tin tài khoản")
  })

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Thông tin cá nhân" description="Dùng để giao hàng và gửi ưu đãi dành riêng cho bạn.">
        <form onSubmit={submit} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.fullName}>
              <FieldLabel htmlFor="profile-name">Họ và tên</FieldLabel>
              <Input
                id="profile-name"
                autoComplete="name"
                aria-invalid={!!errors.fullName}
                className="h-10"
                {...form.register("fullName")}
              />
              <FieldError errors={[errors.fullName]} />
            </Field>

            <Field data-disabled>
              <FieldLabel htmlFor="profile-phone">Số điện thoại</FieldLabel>
              <Input id="profile-phone" value={formatPhone(customer.phone)} disabled readOnly className="h-10" />
              <FieldDescription className="text-xs">
                Số điện thoại dùng để đăng nhập nên không thể thay đổi.
              </FieldDescription>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="profile-email">
                  Email <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
                </FieldLabel>
                <Input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  placeholder="ten@email.com"
                  aria-invalid={!!errors.email}
                  className="h-10"
                  {...form.register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field data-invalid={!!errors.birthday}>
                <FieldLabel htmlFor="profile-birthday">Ngày sinh</FieldLabel>
                <Input
                  id="profile-birthday"
                  type="date"
                  min="1900-01-01"
                  max={now ? toDateKey(now) : undefined}
                  aria-invalid={!!errors.birthday}
                  className="h-10"
                  {...form.register("birthday")}
                />
                <FieldError errors={[errors.birthday]} />
              </Field>
            </div>
            <FieldDescription className="-mt-1 text-xs">
              Tháng sinh nhật được giảm đến {Math.round(TIERS.diamond.birthdayDrinkDiscount * 100)}% đồ uống tuỳ hạng
              thành viên.
            </FieldDescription>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" disabled={!isDirty} onClick={() => form.reset()}>
                Huỷ thay đổi
              </Button>
              <Button type="submit" disabled={!isDirty} className="sm:min-w-32">
                Lưu thay đổi
              </Button>
            </div>
          </FieldGroup>
        </form>
      </Panel>

      <div className="space-y-5">
        <Panel title="Tài khoản thành viên">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Ngày tham gia</dt>
              <dd className="tabular font-medium">{formatDate(customer.joinedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Số đơn đã mua</dt>
              <dd className="tabular font-medium">{customer.orderCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Tổng chi tiêu</dt>
              <dd className="tabular font-medium">{formatVND(customer.totalSpent)}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Đăng xuất">
          <p className="text-sm leading-6 text-muted-foreground">
            Lần sau bạn đăng nhập lại bằng số điện thoại và mật khẩu. Giỏ hàng vẫn được giữ trên thiết bị này.
          </p>
          <Button
            variant="outline"
            className="mt-4 h-10 w-full text-red hover:bg-red-soft hover:text-red"
            onClick={onSignOut}
          >
            <LogOutIcon /> Đăng xuất
          </Button>
        </Panel>
      </div>
    </div>
  )
}
