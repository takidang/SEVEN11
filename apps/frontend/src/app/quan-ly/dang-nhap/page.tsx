"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeftIcon, ShieldCheckIcon, StoreIcon, UserRoundIcon } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { FullPageLoader } from "@/components/admin/staff-gate"
import { LogoMark, Wordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { DEMO_PASSWORD } from "@/data/staff"
import { homeFor, ROLE_LABEL } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { useDbReady, useHydrated } from "@/stores/hydration"
import { signInStaff, useCurrentStaff } from "@/stores/session"
import type { Role } from "@/types"

const schema = z.object({
  email: z.string().trim().min(1, "Nhập email").email("Email không hợp lệ"),
  password: z.string().min(1, "Nhập mật khẩu"),
})

type FormValues = z.infer<typeof schema>

const DEMO_ACCOUNTS: { role: Role; email: string; hint: string; icon: typeof ShieldCheckIcon }[] = [
  { role: "admin", email: "admin@7eleven.demo", hint: "Toàn chuỗi 10 cửa hàng", icon: ShieldCheckIcon },
  { role: "manager", email: "quanly1006@7eleven.demo", hint: "Cửa hàng 1006 – 81 Nguyễn Du", icon: StoreIcon },
  { role: "cashier", email: "thungan1006@7eleven.demo", hint: "Quầy thu ngân 1006", icon: UserRoundIcon },
]

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const staff = useCurrentStaff()
  const hydrated = useHydrated()
  const dbReady = useDbReady()
  const next = params.get("next")

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })
  const email = useWatch({ control: form.control, name: "email" })

  useEffect(() => {
    if (hydrated && dbReady && staff) router.replace(next?.startsWith("/quan-ly") ? next : homeFor(staff.role))
  }, [hydrated, dbReady, staff, next, router])

  if (!hydrated || !dbReady || staff) return <FullPageLoader />

  const onSubmit = form.handleSubmit(({ email, password }) => {
    const result = signInStaff(email, password)
    if (!result.ok) form.setError("password", { message: result.error })
  })

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-x-0 top-[42%] h-3 bg-orange" aria-hidden />
        <div className="absolute inset-x-0 top-[calc(42%+18px)] h-3 bg-red" aria-hidden />
        <Link
          href="/"
          className="relative inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          <ArrowLeftIcon className="size-4" /> Về cửa hàng online
        </Link>
        <div className="relative">
          <span className="inline-flex rounded-2xl bg-white px-5 py-3">
            <Wordmark className="text-6xl" />
          </span>
          <h1 className="mt-16 max-w-md text-4xl leading-tight font-bold">
            Quản lý chuỗi cửa hàng tiện lợi, mở cửa 24/7.
          </h1>
          <p className="mt-4 max-w-md text-white/80">
            Bán hàng tại quầy, đơn online giao 24 phút, tồn kho theo lô – hạn dùng, khuyến mãi và báo cáo doanh thu
            trong một hệ thống.
          </p>
        </div>
        <p className="relative text-xs text-white/60">Đồ án môn học · lấy cảm hứng từ 7-Eleven Việt Nam</p>
      </aside>

      <main className="flex items-center justify-center bg-surface p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="size-11" />
            <Wordmark className="text-3xl" />
          </div>
          <h2 className="text-2xl font-bold">Đăng nhập nhân viên</h2>
          <p className="mt-1 text-sm text-muted-foreground">Dùng tài khoản được quản trị chuỗi cấp.</p>

          <form onSubmit={onSubmit} className="mt-6 rounded-xl bg-card p-5 ring-1 ring-border" noValidate>
            <FieldGroup className="gap-4">
              <Field data-invalid={!!form.formState.errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="ten@7eleven.demo"
                  className="h-10"
                  {...form.register("email")}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>
              <Field data-invalid={!!form.formState.errors.password}>
                <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="h-10"
                  {...form.register("password")}
                />
                <FieldError errors={[form.formState.errors.password]} />
              </Field>
              <Button type="submit" size="lg" className="h-10 w-full">
                Đăng nhập
              </Button>
            </FieldGroup>
          </form>

          <div className="mt-6">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Tài khoản demo · mật khẩu {DEMO_PASSWORD}
            </p>
            <div className="mt-2 grid gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.role}
                  type="button"
                  onClick={() => {
                    form.setValue("email", a.email, { shouldValidate: true })
                    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true })
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg bg-card p-3 text-left ring-1 transition hover:ring-brand/40",
                    email === a.email ? "ring-2 ring-brand" : "ring-border",
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <a.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{ROLE_LABEL[a.role]}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.email} · {a.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <LoginForm />
    </Suspense>
  )
}
