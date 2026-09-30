"use client"

import { useRef } from "react"

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Whole-number input for money and quantities: shows thousands separators
 * ("20.000") while typing, keeps the caret in place and reports a number
 * (undefined when empty). Use with react-hook-form's <Controller>.
 */
export function NumberInput({
  value,
  onChange,
  onBlur,
  suffix,
  grouping = true,
  maxDigits = 12,
  id,
  name,
  placeholder,
  invalid,
  disabled,
  className,
  autoFocus,
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  onBlur?: () => void
  /** Unit shown at the end, e.g. "₫", "%", "lượt". */
  suffix?: string
  /** Thousands separators (off for percentages and small quantities). */
  grouping?: boolean
  maxDigits?: number
  id?: string
  name?: string
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const display = value === undefined || Number.isNaN(value) ? "" : grouping ? formatNumber(value) : String(value)

  return (
    <InputGroup className={cn("bg-background", className)} data-disabled={disabled || undefined}>
      <InputGroupInput
        ref={ref}
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className="tabular"
        onBlur={onBlur}
        onChange={(e) => {
          const input = e.target
          const caret = input.selectionStart ?? input.value.length
          const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, "").length
          const digits = input.value
            .replace(/\D/g, "")
            .replace(/^0+(?=\d)/, "")
            .slice(0, maxDigits)
          onChange(digits === "" ? undefined : Number(digits))
          // Re-place the caret after the same number of digits once the formatted value is rendered.
          requestAnimationFrame(() => {
            const el = ref.current
            if (!el || document.activeElement !== el) return
            let position = 0
            let seen = 0
            while (position < el.value.length && seen < digitsBeforeCaret) {
              if (/\d/.test(el.value[position])) seen++
              position++
            }
            el.setSelectionRange(position, position)
          })
        }}
      />
      {suffix ? (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{suffix}</InputGroupText>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}
