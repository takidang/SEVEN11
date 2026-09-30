"use client"

import { ArrowLeftIcon, EyeIcon, EyeOffIcon, LockKeyholeIcon, PhoneIcon } from "lucide-react"
import { useState } from "react"

import { FieldError } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

export function PhoneInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <InputGroup className="h-11">
      <InputGroupAddon>
        <PhoneIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="Ví dụ: 0901 234 567"
        className={cn("text-base md:text-base", className)}
        {...props}
      />
    </InputGroup>
  )
}

/** Password field with a show/hide toggle. */
export function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [visible, setVisible] = useState(false)
  return (
    <InputGroup className="h-11">
      <InputGroupAddon>
        <LockKeyholeIcon />
      </InputGroupAddon>
      <InputGroupInput
        className={cn("text-base md:text-base", className)}
        {...props}
        type={visible ? "text" : "password"}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

/** Inline error that offers a way out, e.g. "Số … chưa đăng ký thành viên. Đăng ký với số này". */
export function SwitchHint({ message, action, onAction }: { message: string; action: string; onAction: () => void }) {
  return (
    <FieldError>
      {message}{" "}
      <button type="button" onClick={onAction} className="font-semibold text-brand underline-offset-2 hover:underline">
        {action}
      </button>
    </FieldError>
  )
}

export function BackLink({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-6 inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-brand disabled:opacity-50"
    >
      <ArrowLeftIcon className="size-4" /> {children}
    </button>
  )
}

export function StepHeading({
  title,
  children,
  afterBackLink,
}: {
  title: string
  children: React.ReactNode
  /** Tighter top margin when a BackLink sits above the title. */
  afterBackLink?: boolean
}) {
  return (
    <>
      <h1 className={cn("text-2xl font-bold tracking-tight", afterBackLink ? "mt-3" : "mt-6")}>{title}</h1>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{children}</p>
    </>
  )
}
