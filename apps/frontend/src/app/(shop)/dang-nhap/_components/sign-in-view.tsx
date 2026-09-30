"use client"

import { BikeIcon, PackageCheckIcon, TicketPercentIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { LogoMark } from "@/components/brand/logo"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TIERS } from "@/lib/membership"
import { normalizePhone, safeNextPath } from "@/lib/phone"
import { replaceQuery } from "@/lib/query"
import { cn } from "@/lib/utils"
import { useDbReady, useHydrated } from "@/stores/hydration"
import { type OtpPurpose, requestOtp } from "@/stores/otp"
import { signUpCustomer, useCurrentCustomer } from "@/stores/session"

import { type Draft, type Mode, TAB_PARAM } from "./auth-flow"
import { MemberBenefitsPanel } from "./member-benefits-panel"
import { OtpStep, showDemoSms } from "./otp-step"
import { ForgotPasswordStep, NewPasswordStep } from "./reset-password"
import { SignInForm } from "./sign-in-form"
import { SignUpForm, type SignUpValues } from "./sign-up-form"

type Step =
  | { id: "form" }
  | { id: "forgot" }
  | { id: "otp"; purpose: OtpPurpose; phone: string; sentAt: number; devCode: string }
  | { id: "new-password"; phone: string }

/**
 * A half-finished sign-up survives a reload: what the shopper typed is kept in sessionStorage
 * so the OTP step never throws them back to an empty form. The code itself lives in memory in
 * `stores/otp.ts`, so on resume a fresh one is sent.
 */
const RESUME_KEY = "7eleven-auth-step"

interface Resume {
  step: Step
  pendingSignUp: SignUpValues | null
}

/** Forget the unfinished step — the flow ended, so it must not come back on the next visit. */
function clearResume() {
  try {
    sessionStorage.removeItem(RESUME_KEY)
  } catch {
    // sessionStorage unavailable: nothing was saved either.
  }
}

function readResume(): Resume | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY)
    const saved = raw ? (JSON.parse(raw) as Resume) : null
    return saved?.step?.id === "otp" || saved?.step?.id === "new-password" ? saved : null
  } catch {
    return null
  }
}

export function SignInSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 py-2 lg:grid-cols-2 lg:py-6">
      <div className="rounded-xl p-5 ring-1 ring-border sm:p-8">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="mt-6 h-11 w-full rounded-lg" />
        <Skeleton className="mt-6 h-8 w-2/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-8 h-4 w-28" />
        <Skeleton className="mt-2 h-11 w-full rounded-lg" />
        <Skeleton className="mt-4 h-4 w-20" />
        <Skeleton className="mt-2 h-11 w-full rounded-lg" />
        <Skeleton className="mt-6 h-11 w-full rounded-lg" />
      </div>
      <Skeleton className="hidden min-h-[520px] rounded-xl lg:block" />
    </div>
  )
}

/** Customer account page: tabs Đăng nhập / Đăng ký, plus the "Quên mật khẩu" flow (see auth-flow.ts). */
export function SignInView() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextPath(params.get("next"))
  const mode: Mode = params.get("tab") === TAB_PARAM["sign-up"] ? "sign-up" : "sign-in"
  const hydrated = useHydrated()
  const dbReady = useDbReady()
  const customer = useCurrentCustomer()
  const signedIn = hydrated && dbReady && !!customer

  // Already signed in (or just signed in on this page) → go where the shopper was heading.
  useEffect(() => {
    if (!signedIn) return
    // Signing up ends on this page, so clear the saved OTP step before leaving.
    clearResume()
    router.replace(next)
  }, [signedIn, next, router])

  if (!hydrated || !dbReady || customer) return <SignInSkeleton />

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-stretch gap-6 py-2 lg:grid-cols-2 lg:py-6">
      <SignInCard mode={mode} />
      <MemberBenefitsPanel className="hidden lg:flex" />
    </div>
  )
}

const TAB_TRIGGER = "text-[15px] data-active:font-semibold data-active:text-brand data-active:hover:text-brand"

function SignInCard({ mode }: { mode: Mode }) {
  const [resumed] = useState(readResume)
  const [step, setStep] = useState<Step>(() => resumed?.step ?? { id: "form" })
  const [draft, setDraft] = useState<Draft>(() => ({
    phone: resumed?.pendingSignUp?.phone ?? "",
    fullName: resumed?.pendingSignUp?.fullName ?? "",
  }))
  // Sign-up details waiting for the OTP check (refilled if the shopper goes back to fix the phone).
  const [pendingSignUp, setPendingSignUp] = useState<SignUpValues | null>(resumed?.pendingSignUp ?? null)

  const updateDraft = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  // Remember an unfinished OTP step, and forget it as soon as the flow ends.
  useEffect(() => {
    try {
      if (step.id === "otp" || step.id === "new-password") {
        sessionStorage.setItem(RESUME_KEY, JSON.stringify({ step, pendingSignUp } satisfies Resume))
      } else {
        sessionStorage.removeItem(RESUME_KEY)
      }
    } catch {
      // sessionStorage unavailable (private mode): the flow still works, it just cannot resume.
    }
  }, [step, pendingSignUp])

  const showTab = (value: Mode) => {
    setStep({ id: "form" })
    replaceQuery({ tab: TAB_PARAM[value] })
  }

  const sendOtp = (purpose: OtpPurpose, rawPhone: string) => {
    const phone = normalizePhone(rawPhone)
    const sent = requestOtp(phone, purpose)
    setStep({ id: "otp", purpose, phone, sentAt: sent.sentAt, devCode: sent.devCode })
    showDemoSms(phone, sent.devCode)
  }

  // The resumed code no longer exists (codes live in memory), so send a new one right away.
  const resent = useRef(false)
  useEffect(() => {
    if (resumed?.step.id !== "otp" || resent.current) return
    resent.current = true
    sendOtp(resumed.step.purpose, resumed.step.phone)
    toast.info("Đã gửi lại mã xác minh", { description: "Trang vừa được tải lại nên mã cũ không còn dùng được." })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, for the step restored on mount
  }, [])

  const onPhoneVerified = (purpose: OtpPurpose, phone: string) => {
    if (purpose === "reset") {
      setStep({ id: "new-password", phone })
      return
    }
    const result = pendingSignUp ? signUpCustomer({ ...pendingSignUp, phone }) : null
    if (!result?.ok) {
      toast.error(result?.error ?? "Phiên đăng ký đã hết, vui lòng nhập lại")
      setStep({ id: "form" })
      return
    }
    toast.success("Tạo tài khoản thành công", {
      description: `Chào ${result.customer.fullName}, bạn đang là thành viên hạng ${TIERS[result.customer.tier].label}.`,
    })
  }

  // Dots for the multi-step flows: sign-up = form → OTP; forgot = phone → OTP → new password.
  const progress =
    step.id === "form"
      ? mode === "sign-up"
        ? { current: 1, total: 2 }
        : null
      : step.id === "forgot"
        ? { current: 1, total: 3 }
        : step.id === "otp"
          ? { current: 2, total: step.purpose === "sign-up" ? 2 : 3 }
          : { current: 3, total: 3 }

  return (
    <section className="flex flex-col rounded-xl bg-card p-5 ring-1 ring-border sm:p-8">
      <div className="flex items-center gap-3">
        <LogoMark className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Thành viên 7-Eleven</p>
          <p className="text-xs text-muted-foreground">Đăng nhập bằng số điện thoại</p>
        </div>
        {progress ? (
          <ol className="flex items-center gap-1.5" aria-label={`Bước ${progress.current}/${progress.total}`}>
            {Array.from({ length: progress.total }, (_, i) => i + 1).map((n) => (
              <li
                key={n}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  n === progress.current ? "w-6 bg-brand" : n < progress.current ? "w-1.5 bg-brand" : "w-1.5 bg-border",
                )}
              />
            ))}
          </ol>
        ) : null}
      </div>

      {step.id === "form" ? (
        <Tabs
          value={mode}
          onValueChange={(value) => showTab(value === "sign-up" ? "sign-up" : "sign-in")}
          className="mt-6 gap-0"
        >
          <TabsList className="w-full group-data-horizontal/tabs:h-11">
            <TabsTrigger value="sign-in" className={TAB_TRIGGER}>
              Đăng nhập
            </TabsTrigger>
            <TabsTrigger value="sign-up" className={TAB_TRIGGER}>
              Đăng ký
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sign-in">
            <SignInForm
              defaultPhone={draft.phone}
              onDraft={updateDraft}
              onSignUp={() => showTab("sign-up")}
              onForgotPassword={() => setStep({ id: "forgot" })}
            />
          </TabsContent>
          <TabsContent value="sign-up">
            <SignUpForm
              defaults={{
                fullName: draft.fullName,
                phone: draft.phone,
                password: pendingSignUp?.password ?? "",
                confirmPassword: pendingSignUp?.confirmPassword ?? "",
              }}
              onDraft={updateDraft}
              onSubmit={(values) => {
                setPendingSignUp(values)
                updateDraft({ phone: values.phone, fullName: values.fullName })
                sendOtp("sign-up", values.phone)
              }}
              onSignIn={() => showTab("sign-in")}
            />
          </TabsContent>
        </Tabs>
      ) : null}

      {step.id === "forgot" ? (
        <ForgotPasswordStep
          defaultPhone={draft.phone}
          onDraft={updateDraft}
          onBack={() => showTab("sign-in")}
          onSignUp={() => showTab("sign-up")}
          onSubmit={(phone) => sendOtp("reset", phone)}
        />
      ) : null}

      {step.id === "otp" ? (
        <OtpStep
          key={step.sentAt}
          phone={step.phone}
          purpose={step.purpose}
          sentAt={step.sentAt}
          confirmLabel={step.purpose === "sign-up" ? "Xác nhận và tạo tài khoản" : "Xác nhận"}
          onBack={() => setStep(step.purpose === "sign-up" ? { id: "form" } : { id: "forgot" })}
          onResend={() => sendOtp(step.purpose, step.phone)}
          onShowSms={() => showDemoSms(step.phone, step.devCode)}
          onVerified={() => onPhoneVerified(step.purpose, step.phone)}
        />
      ) : null}

      {step.id === "new-password" ? <NewPasswordStep phone={step.phone} onBack={() => showTab("sign-in")} /> : null}

      <div className="mt-auto pt-8">
        <ul className="grid grid-cols-3 gap-2 border-t pt-5 text-center text-xs text-muted-foreground [&>li]:flex [&>li]:flex-col [&>li]:items-center [&>li]:gap-1.5">
          <li>
            <BikeIcon className="size-5 text-fresh" /> Giao nhanh 24 phút
          </li>
          <li>
            <PackageCheckIcon className="size-5 text-brand" /> Theo dõi đơn hàng
          </li>
          <li>
            <TicketPercentIcon className="size-5 text-orange" /> Voucher thành viên
          </li>
        </ul>
      </div>
    </section>
  )
}
