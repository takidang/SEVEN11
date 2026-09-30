"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { GiftIcon } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatPhone, formatVND } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { PASSWORD_MIN_LENGTH, passwordSchema } from "@/lib/password"
import { normalizePhone, phoneSchema } from "@/lib/phone"
import { findCustomerByPhone } from "@/stores/session"

import { PasswordInput, PhoneInput, StepHeading, SwitchHint } from "./auth-fields"
import type { Draft } from "./auth-flow"

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Nhập họ và tên của bạn").max(60, "Họ tên tối đa 60 ký tự"),
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Nhập lại mật khẩu"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Mật khẩu nhập lại không khớp",
  })

export type SignUpValues = z.infer<typeof schema>

/** Tab "Đăng ký": name, phone and password, then OTP proves the phone belongs to the shopper. */
export function SignUpForm({
  defaults,
  onDraft,
  onSubmit,
  onSignIn,
}: {
  defaults: SignUpValues
  onDraft: (patch: Partial<Draft>) => void
  onSubmit: (values: SignUpValues) => void
  onSignIn: () => void
}) {
  const form = useForm<SignUpValues>({ resolver: zodResolver(schema), defaultValues: defaults })
  const { errors } = form.formState
  const [takenPhone, setTakenPhone] = useState<string | null>(null)

  const submit = form.handleSubmit((values) => {
    if (findCustomerByPhone(values.phone)) {
      setTakenPhone(normalizePhone(values.phone))
      return
    }
    onSubmit({ ...values, fullName: values.fullName.trim() })
  })

  return (
    <>
      <StepHeading title="Tạo tài khoản thành viên">
        Miễn phí. Thành viên mới bắt đầu từ hạng {TIERS.bronze.label}, số điện thoại được xác minh bằng mã OTP.
      </StepHeading>

      <form onSubmit={submit} className="mt-6" noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={!!errors.fullName}>
            <FieldLabel htmlFor="signup-name">Họ và tên</FieldLabel>
            <Input
              id="signup-name"
              autoComplete="name"
              placeholder="Ví dụ: Nguyễn Minh Anh"
              aria-invalid={!!errors.fullName}
              className="h-11 text-base md:text-base"
              {...form.register("fullName", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => onDraft({ fullName: e.target.value }),
              })}
            />
            <FieldError errors={[errors.fullName]} />
          </Field>

          <Field data-invalid={!!errors.phone || !!takenPhone}>
            <FieldLabel htmlFor="signup-phone">Số điện thoại</FieldLabel>
            <PhoneInput
              id="signup-phone"
              aria-invalid={!!errors.phone || !!takenPhone}
              {...form.register("phone", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  setTakenPhone(null)
                  onDraft({ phone: e.target.value })
                },
              })}
            />
            {takenPhone ? (
              <SwitchHint
                message={`Số ${formatPhone(takenPhone)} đã là thành viên.`}
                action="Đăng nhập"
                onAction={onSignIn}
              />
            ) : (
              <FieldError errors={[errors.phone]} />
            )}
          </Field>

          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="signup-password">Mật khẩu</FieldLabel>
            <PasswordInput
              id="signup-password"
              autoComplete="new-password"
              placeholder={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
              aria-invalid={!!errors.password}
              {...form.register("password", { deps: ["confirmPassword"] })}
            />
            {errors.password ? (
              <FieldError errors={[errors.password]} />
            ) : (
              <FieldDescription className="text-xs">Dùng để đăng nhập các lần sau.</FieldDescription>
            )}
          </Field>

          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="signup-confirm">Nhập lại mật khẩu</FieldLabel>
            <PasswordInput
              id="signup-confirm"
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              aria-invalid={!!errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>

          <div className="flex gap-3 rounded-lg bg-orange-soft p-3 text-sm">
            <GiftIcon className="mt-0.5 size-4 shrink-0 text-orange" />
            <span>
              {TIERS.bronze.freeDrink} và voucher giảm {formatVND(TIERS.bronze.drinkVoucher)} mỗi ly đồ uống.
            </span>
          </div>

          <Button type="submit" className="h-11 w-full text-[15px]">
            Đăng ký
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}
