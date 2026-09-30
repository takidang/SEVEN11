"use client"

import { REGEXP_ONLY_DIGITS } from "input-otp"
import { MessageSquareTextIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { formatPhone } from "@/lib/format"
import { useNow } from "@/stores/hydration"
import {
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  OTP_TTL_MINUTES,
  type OtpPurpose,
  type OtpVerifyResult,
  verifyOtp,
} from "@/stores/otp"

import { BackLink, StepHeading } from "./auth-fields"

/** The app sends no real SMS: the code arrives as a toast styled like a text message (a newer one replaces it). */
export function showDemoSms(phone: string, code: string) {
  toast(`SMS giả lập tới ${formatPhone(phone)}`, {
    id: "demo-sms",
    icon: <MessageSquareTextIcon className="size-4 text-brand" />,
    description: (
      <span className="text-foreground">
        7-Eleven: Mã xác minh của bạn là <b className="tabular -mr-[0.2em] text-base tracking-[0.2em]">{code}</b>, hiệu
        lực {OTP_TTL_MINUTES} phút. Không chia sẻ mã này cho bất kỳ ai.
      </span>
    ),
    duration: 30_000,
  })
}

type OtpError = Extract<OtpVerifyResult, { ok: false }>

/** Proves the shopper owns the phone — used by sign-up and "Quên mật khẩu", never by plain sign-in. */
export function OtpStep({
  phone,
  purpose,
  sentAt,
  confirmLabel,
  onBack,
  onResend,
  onShowSms,
  onVerified,
}: {
  phone: string
  purpose: OtpPurpose
  sentAt: number
  confirmLabel: string
  onBack: () => void
  onResend: () => void
  onShowSms: () => void
  onVerified: () => void
}) {
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<OtpError | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const now = useNow(1000)
  const secondsLeft = now
    ? Math.max(0, Math.ceil((sentAt + OTP_RESEND_SECONDS * 1000 - now.getTime()) / 1000))
    : OTP_RESEND_SECONDS
  // An expired or locked code can't be retried — only a new code helps.
  const blocked = !!error && error.reason !== "wrong"
  const canResend = secondsLeft === 0 || blocked

  // After a wrong code, put the cursor back (the input is disabled while checking).
  useEffect(() => {
    if (error && !verifying && !blocked) inputRef.current?.focus()
  }, [error, verifying, blocked])

  const verify = (value: string) => {
    if (value.length !== OTP_LENGTH || verifying || blocked) return
    setVerifying(true)
    // The short wait mimics the verification request.
    window.setTimeout(() => {
      const result = verifyOtp(phone, purpose, value)
      if (result.ok) {
        onVerified()
        return
      }
      setError(result)
      setCode("")
      setVerifying(false)
    }, 500)
  }

  return (
    <>
      <BackLink onClick={onBack} disabled={verifying}>
        Đổi số điện thoại
      </BackLink>
      <StepHeading title="Xác minh số điện thoại" afterBackLink>
        Nhập mã {OTP_LENGTH} số vừa gửi qua SMS tới{" "}
        <span className="font-semibold whitespace-nowrap text-foreground">{formatPhone(phone)}</span> để xác nhận bạn là
        chủ số điện thoại này.
      </StepHeading>

      <div className="mt-6">
        <InputOTP
          ref={inputRef}
          maxLength={OTP_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          value={code}
          onChange={setCode}
          onComplete={verify}
          disabled={verifying || blocked}
          autoFocus
          aria-label="Mã OTP"
          containerClassName="justify-center sm:justify-start"
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                aria-invalid={!!error && !code}
                className="size-11 rounded-lg border text-lg font-semibold first:rounded-lg last:rounded-lg sm:size-12"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error ? (
          <p role="alert" className="mt-3 text-center text-sm text-destructive sm:text-left">
            {error.error}
          </p>
        ) : null}
        <p className="mt-3 text-center text-xs leading-5 text-muted-foreground sm:text-left">
          <MessageSquareTextIcon className="mr-1 inline size-3.5 align-[-3px]" />
          Bản demo không gửi SMS thật, mã hiện trong thông báo tin nhắn.{" "}
          <button type="button" onClick={onShowSms} className="font-semibold text-brand hover:underline">
            Xem lại tin nhắn
          </button>
        </p>
      </div>

      <Button
        type="button"
        className="mt-6 h-11 w-full text-[15px]"
        disabled={code.length !== OTP_LENGTH || verifying || blocked}
        onClick={() => verify(code)}
      >
        {verifying ? (
          <>
            <Spinner /> Đang xác thực…
          </>
        ) : (
          confirmLabel
        )}
      </Button>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {blocked ? "Cần mã mới?" : "Chưa nhận được mã?"}{" "}
        {canResend ? (
          <button
            type="button"
            onClick={onResend}
            disabled={verifying}
            className="font-semibold text-brand hover:underline"
          >
            Gửi lại mã
          </button>
        ) : (
          <span>
            Gửi lại sau <span className="tabular font-semibold text-foreground">{secondsLeft} giây</span>
          </span>
        )}
      </p>
    </>
  )
}
