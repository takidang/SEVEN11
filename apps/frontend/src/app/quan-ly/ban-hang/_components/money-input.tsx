"use client"

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

/** VND amount input: digits only, shown with thousand separators ("2.000.000"). */
export function MoneyInput({
  value,
  onChange,
  className,
  inputClassName,
  ...props
}: {
  value: number | null
  onChange: (value: number | null) => void
  className?: string
  inputClassName?: string
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">) {
  return (
    <InputGroup className={cn("bg-white", className)}>
      <InputGroupInput
        {...props}
        inputMode="numeric"
        autoComplete="off"
        value={value === null ? "" : formatNumber(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 12)
          onChange(digits ? Number(digits) : null)
        }}
        className={cn("tabular", inputClassName)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>₫</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
