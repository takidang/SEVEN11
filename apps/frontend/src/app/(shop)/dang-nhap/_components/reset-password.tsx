"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { formatPhone } from "@/lib/format"
import { PASSWORD_MIN_LENGTH, passwordSchema } from "@/lib/password"
import { normalizePhone, phoneSchema } from "@/lib/phone"
import { findCustomerByPhone, resetCustomerPassword } from "@/stores/session"

import { BackLink, PasswordInput, PhoneInput, StepHeading, SwitchHint } from "./auth-fields"
import type { Draft } from "./auth-flow"

const phoneFormSchema = z.object({ phone: phoneSchema })

/** "Quên mật khẩu", step 1: which phone → OTP. */
export function ForgotPasswordStep({
  defaultPhone,
  onDraft,
  onBack,
  onSignUp,
  onSubmit,
}: {
  defaultPhone: string
  onDraft: (patch: Partial<Draft>) => void
  onBack: () => void
  onSignUp: () => void
  onSubmit: (phone: string) => void
}) {
  const form = useForm<z.infer<typeof phoneFormSchema>>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: defaultPhone },
  })
  const error = form.formState.errors.phone
  const [unknownPhone, setUnknownPhone] = useState<string | null>(null)

  const submit = form.handleSubmit(({ phone }) => {
    if (!findCustomerByPhone(phone)) {
      setUnknownPhone(normalizePhone(phone))
      return
    }
    onSubmit(phone)
  })

  return (
    <>
      <BackLink onClick={onBack}>Quay lại đăng nhập</BackLink>
      <StepHeading title="Quên mật khẩu" afterBackLink>
        Nhập số điện thoại đã đăng ký. Sau khi xác minh chính chủ bằng mã OTP, bạn đặt mật khẩu mới.
      </StepHeading>

      <form onSubmit={submit} className="mt-6" noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={!!error || !!unknownPhone}>
            <FieldLabel htmlFor="forgot-phone">Số điện thoại</FieldLabel>
            <PhoneInput
              id="forgot-phone"
              autoFocus
              aria-invalid={!!error || !!unknownPhone}
              {...form.register("phone", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  setUnknownPhone(null)
                  onDraft({ phone: e.target.value })
                },
              })}
            />
            {unknownPhone ? (
              <SwitchHint
                message={`Số ${formatPhone(unknownPhone)} chưa đăng ký thành viên.`}
                action="Đăng ký với số này"
                onAction={onSignUp}
              />
            ) : (
              <FieldError errors={[error]} />
            )}
          </Field>
          <Button type="submit" className="h-11 w-full text-[15px]">
            Gửi mã OTP
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}

const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Nhập lại mật khẩu"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Mật khẩu nhập lại không khớp",
  })

/** "Quên mật khẩu", step 3: the phone passed OTP → choose a new password, then signed in. */
export function NewPasswordStep({ phone, onBack }: { phone: string; onBack: () => void }) {
  const form = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })
  const { errors } = form.formState

  const submit = form.handleSubmit(({ password }) => {
    const result = resetCustomerPassword(phone, password)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Đã đặt mật khẩu mới", { description: `Chào ${result.customer.fullName}, bạn đã đăng nhập.` })
  })

  return (
    <>
      <BackLink onClick={onBack}>Quay lại đăng nhập</BackLink>
      <StepHeading title="Đặt mật khẩu mới" afterBackLink>
        Đã xác minh số <span className="font-semibold whitespace-nowrap text-foreground">{formatPhone(phone)}</span>.
        Tạo mật khẩu mới để đăng nhập các lần sau.
      </StepHeading>

      <form onSubmit={submit} className="mt-6" noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="reset-password">Mật khẩu mới</FieldLabel>
            <PasswordInput
              id="reset-password"
              autoFocus
              autoComplete="new-password"
              placeholder={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
              aria-invalid={!!errors.password}
              {...form.register("password", { deps: ["confirmPassword"] })}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="reset-confirm">Nhập lại mật khẩu</FieldLabel>
            <PasswordInput
              id="reset-confirm"
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              aria-invalid={!!errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>
          <Button type="submit" className="h-11 w-full text-[15px]">
            Lưu mật khẩu và đăng nhập
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}
