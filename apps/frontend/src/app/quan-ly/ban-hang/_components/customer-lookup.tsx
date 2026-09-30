"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { UserRoundPlusIcon, UserRoundSearchIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { StarCount } from "@/components/shop/star-rewards"
import { TierBadge } from "@/components/shop/tier-ladder"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { formatPhone, formatVND, initials } from "@/lib/format"
import { TIERS } from "@/lib/membership"
import { useDb } from "@/stores/db"
import type { Customer } from "@/types"

import { usePosStore } from "./pos-store"

const PHONE_RE = /^0\d{9}$/

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Nhập họ tên khách hàng"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => PHONE_RE.test(v), "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0"),
})

type RegisterInput = z.input<typeof registerSchema>
type RegisterValues = z.output<typeof registerSchema>

/** Member lookup by phone (Enter), with a quick sign-up when the number is new. */
export function CustomerLookup({
  customer,
  phoneRef,
}: {
  customer: Customer | null
  phoneRef: React.RefObject<HTMLInputElement | null>
}) {
  const customers = useDb((s) => s.customers)
  const [phone, setPhone] = useState("")
  const [notFound, setNotFound] = useState<string | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)

  const lookup = () => {
    const digits = phone.replace(/\D/g, "")
    if (!digits) return
    if (!PHONE_RE.test(digits)) {
      setNotFound(null)
      toast.error("Số điện thoại gồm 10 chữ số, bắt đầu bằng 0", { id: "pos-phone" })
      return
    }
    const match = customers.find((c) => c.phone === digits)
    if (match) {
      usePosStore.getState().setCustomer(match.id)
      setPhone("")
      setNotFound(null)
    } else {
      setNotFound(digits)
    }
  }

  if (customer) {
    const tier = TIERS[customer.tier]
    return (
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-dark">
          {initials(customer.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{customer.fullName}</span>
            <TierBadge tier={customer.tier} className="shrink-0 px-2 text-[11px] whitespace-nowrap" />
            <StarCount value={customer.stars} className="shrink-0 text-xs" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {formatPhone(customer.phone)} · Giảm {formatVND(tier.drinkVoucher)}/ly đồ uống
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Bỏ chọn khách hàng"
          onClick={() => {
            usePosStore.getState().setCustomer(null)
            phoneRef.current?.focus()
          }}
        >
          <XIcon />
        </Button>
      </div>
    )
  }

  return (
    <div className="border-b px-4 py-2.5">
      <InputGroup className="h-9 bg-white">
        <InputGroupAddon>
          <UserRoundSearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={phoneRef}
          value={phone}
          inputMode="tel"
          autoComplete="off"
          placeholder="SĐT khách thành viên"
          aria-label="Số điện thoại khách thành viên"
          onChange={(e) => {
            setPhone(e.target.value.replace(/[^\d\s]/g, "").slice(0, 13))
            setNotFound(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              lookup()
            } else if (e.key === "Escape" && (phone || notFound)) {
              e.preventDefault()
              e.stopPropagation()
              setPhone("")
              setNotFound(null)
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          {phone ? (
            <InputGroupButton variant="secondary" onClick={lookup}>
              Tìm
            </InputGroupButton>
          ) : (
            <Kbd>F4</Kbd>
          )}
        </InputGroupAddon>
      </InputGroup>
      {notFound ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
          <p className="min-w-0 text-xs text-muted-foreground">
            Chưa có thành viên <span className="tabular font-medium text-foreground">{formatPhone(notFound)}</span>
          </p>
          <Button size="xs" variant="outline" className="bg-white" onClick={() => setRegisterOpen(true)}>
            <UserRoundPlusIcon /> Đăng ký thành viên
          </Button>
        </div>
      ) : null}
      <RegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        phone={notFound ?? ""}
        onRegistered={() => {
          setPhone("")
          setNotFound(null)
        }}
      />
    </div>
  )
}

function RegisterDialog({
  open,
  onOpenChange,
  phone,
  onRegistered,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  phone: string
  onRegistered: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Đăng ký thành viên</DialogTitle>
          <DialogDescription>
            Khách mới bắt đầu ở hạng {TIERS.bronze.label} và được giảm ngay {formatVND(TIERS.bronze.drinkVoucher)} mỗi
            ly đồ uống trong hoá đơn này.
          </DialogDescription>
        </DialogHeader>
        {/* Remount per phone so default values follow the lookup. */}
        {open ? (
          <RegisterForm
            key={phone}
            phone={phone}
            onCancel={() => onOpenChange(false)}
            onDone={() => {
              onRegistered()
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RegisterForm({ phone, onCancel, onDone }: { phone: string; onCancel: () => void; onDone: () => void }) {
  const form = useForm<RegisterInput, unknown, RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", phone },
  })

  const onSubmit = form.handleSubmit(({ fullName, phone: digits }) => {
    const db = useDb.getState()
    if (db.customers.some((c) => c.phone === digits)) {
      form.setError("phone", { message: "Số điện thoại này đã là thành viên" })
      return
    }
    const customer = db.registerCustomer({ fullName, phone: digits })
    usePosStore.getState().setCustomer(customer.id)
    toast.success(`Đã đăng ký thành viên hạng ${TIERS.bronze.label} cho ${customer.fullName}`)
    onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FieldGroup className="gap-3">
        <Field data-invalid={!!form.formState.errors.fullName}>
          <FieldLabel htmlFor="pos-member-name">Họ và tên</FieldLabel>
          <Input
            id="pos-member-name"
            autoFocus
            autoComplete="off"
            placeholder="Nguyễn Văn A"
            aria-invalid={!!form.formState.errors.fullName}
            {...form.register("fullName")}
          />
          <FieldError errors={[form.formState.errors.fullName]} />
        </Field>
        <Field data-invalid={!!form.formState.errors.phone}>
          <FieldLabel htmlFor="pos-member-phone">Số điện thoại</FieldLabel>
          <Input
            id="pos-member-phone"
            inputMode="tel"
            autoComplete="off"
            aria-invalid={!!form.formState.errors.phone}
            {...form.register("phone")}
          />
          <FieldError errors={[form.formState.errors.phone]} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit">
          <UserRoundPlusIcon /> Đăng ký
        </Button>
      </DialogFooter>
    </form>
  )
}
