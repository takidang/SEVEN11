"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronRightIcon, UserRoundIcon } from "lucide-react"
import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { DEMO_PASSWORD } from "@/data/staff"
import { formatPhone } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { normalizePhone, phoneSchema } from "@/lib/phone"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { type CustomerAuthError, signInCustomer } from "@/stores/session"

import { PasswordInput, PhoneInput, StepHeading, SwitchHint } from "./auth-fields"
import { DEMO_PHONE, type Draft } from "./auth-flow"

const schema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Nhập mật khẩu"),
})

type Values = z.infer<typeof schema>

/** Tab "Đăng nhập": phone + password, no OTP. */
export function SignInForm({
  defaultPhone,
  onDraft,
  onSignUp,
  onForgotPassword,
}: {
  defaultPhone: string
  onDraft: (patch: Partial<Draft>) => void
  onSignUp: () => void
  onForgotPassword: () => void
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { phone: defaultPhone, password: "" } })
  const { errors } = form.formState
  const phone = useWatch({ control: form.control, name: "phone" })
  // Problems that come with a way out: go to the other tab, or create a password.
  const [problem, setProblem] = useState<{ reason: CustomerAuthError; phone: string } | null>(null)
  const notRegistered = problem?.reason === "not-registered"
  const noPassword = problem?.reason === "no-password"

  const submit = form.handleSubmit((values) => {
    const result = signInCustomer(values.phone, values.password)
    if (result.ok) {
      toast.success(`Chào mừng ${result.customer.fullName} quay lại`)
    } else if (result.reason === "wrong-password") {
      form.setError("password", { message: result.error })
    } else {
      setProblem({ reason: result.reason, phone: normalizePhone(values.phone) })
    }
  })

  const fillDemo = () => {
    form.setValue("phone", DEMO_PHONE, { shouldValidate: true })
    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true })
    onDraft({ phone: DEMO_PHONE })
    setProblem(null)
  }

  return (
    <>
      <StepHeading title="Chào mừng bạn quay lại">Đăng nhập bằng số điện thoại và mật khẩu đã đăng ký.</StepHeading>

      <form onSubmit={submit} className="mt-6" noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={!!errors.phone || notRegistered}>
            <FieldLabel htmlFor="signin-phone">Số điện thoại</FieldLabel>
            <PhoneInput
              id="signin-phone"
              aria-invalid={!!errors.phone || notRegistered}
              {...form.register("phone", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  setProblem(null)
                  onDraft({ phone: e.target.value })
                },
              })}
            />
            {notRegistered ? (
              <SwitchHint
                message={`Số ${formatPhone(problem.phone)} chưa đăng ký thành viên.`}
                action="Đăng ký với số này"
                onAction={onSignUp}
              />
            ) : (
              <FieldError errors={[errors.phone]} />
            )}
          </Field>

          <Field data-invalid={!!errors.password || noPassword}>
            <FieldLabel htmlFor="signin-password">Mật khẩu</FieldLabel>
            <PasswordInput
              id="signin-password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              aria-invalid={!!errors.password || noPassword}
              {...form.register("password", { onChange: () => setProblem(null) })}
            />
            {noPassword ? (
              <SwitchHint
                message="Tài khoản đăng ký tại cửa hàng nên chưa có mật khẩu."
                action="Tạo mật khẩu"
                onAction={onForgotPassword}
              />
            ) : (
              <FieldError errors={[errors.password]} />
            )}
          </Field>

          <div className="-mt-1 flex justify-end">
            <button type="button" onClick={onForgotPassword} className="text-sm font-medium text-brand hover:underline">
              Quên mật khẩu?
            </button>
          </div>

          <Button type="submit" className="h-11 w-full text-[15px]">
            Đăng nhập
          </Button>
        </FieldGroup>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        hoặc
        <span className="h-px flex-1 bg-border" />
      </div>

      <DemoAccountButton selected={normalizePhone(phone ?? "") === DEMO_PHONE} onClick={fillDemo} />
    </>
  )
}

/** Fills the form with the demo member (like the staff login page), the shopper still presses "Đăng nhập". */
function DemoAccountButton({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  const demo = useDb((s) => s.customers.find((c) => c.phone === DEMO_PHONE))

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg p-3 text-left ring-1 transition hover:bg-accent hover:ring-brand/40 focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none",
        selected ? "ring-2 ring-brand" : "ring-border",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <UserRoundIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Dùng tài khoản demo {DEMO_PHONE}</span>
        <span className="block truncate text-xs text-muted-foreground">
          Mật khẩu {DEMO_PASSWORD}
          {demo ? ` · ${demo.fullName} · hạng ${TIERS[demo.tier].label}` : ""}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}
