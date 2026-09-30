"use client"

import { SearchIcon, XIcon } from "lucide-react"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

/** One filter row above a table: wraps on narrow screens. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <InputGroup className={cn("w-full bg-card sm:w-64", className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Xoá từ khoá" onClick={() => onChange("")}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

/** "42 sản phẩm" at the end of the toolbar. */
export function ResultCount({ children }: { children: React.ReactNode }) {
  return <span className="text-sm whitespace-nowrap text-muted-foreground sm:ml-auto">{children}</span>
}

/** Pill filters with counts (e.g. Tất cả · Sắp hết hạn · Đã hết hạn). */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-brand text-white ring-brand" : "bg-card text-brand ring-brand/25 hover:bg-brand-soft",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-xs leading-5",
                  active ? "bg-white/20 text-white" : "bg-brand-soft text-brand",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
