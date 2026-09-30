"use client"

import { BanknoteIcon, CreditCardIcon, type LucideIcon, WalletIcon } from "lucide-react"

import { Panel } from "@/components/admin/page-header"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { PAYMENT_METHOD } from "@/lib/order-status"

import type { CheckoutPaymentMethod } from "./checkout-form"

const METHODS: { id: CheckoutPaymentMethod; icon: LucideIcon; hint: string }[] = [
  { id: "cod", icon: BanknoteIcon, hint: "Trả tiền mặt hoặc chuyển khoản cho nhân viên giao hàng" },
  { id: "ewallet", icon: WalletIcon, hint: "Thanh toán ngay bằng ví điện tử đã liên kết" },
  { id: "card", icon: CreditCardIcon, hint: "Thẻ ATM nội địa hoặc thẻ quốc tế" },
]

export function PaymentSection({
  value,
  onChange,
}: {
  value: CheckoutPaymentMethod
  onChange: (value: CheckoutPaymentMethod) => void
}) {
  return (
    <Panel title="Phương thức thanh toán">
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as CheckoutPaymentMethod)}
        className="grid gap-2 md:grid-cols-3"
        aria-label="Phương thức thanh toán"
      >
        {METHODS.map((method) => (
          <FieldLabel key={method.id} htmlFor={`pay-${method.id}`}>
            <Field orientation="horizontal" className="h-full items-start">
              <RadioGroupItem value={method.id} id={`pay-${method.id}`} className="mt-0.5" />
              <FieldContent>
                <FieldTitle>
                  <method.icon className="size-4 text-brand" />
                  {PAYMENT_METHOD[method.id]}
                </FieldTitle>
                <FieldDescription className="text-xs leading-5">{method.hint}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </Panel>
  )
}
