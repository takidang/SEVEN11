"use client"

import { CalendarIcon, CalendarRangeIcon, StoreIcon } from "lucide-react"
import { useRef, useState } from "react"
import type { DateRange } from "react-day-picker"
import { vi } from "react-day-picker/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIsMobile } from "@/hooks/use-mobile"
import { addDays, type ChannelFilter, type PeriodPreset, type ReportPeriod } from "@/lib/analytics"
import { formatDate } from "@/lib/format"

import { weekdayShort } from "../../_components/chart-kit"

export type PresetValue = PeriodPreset | "custom"

export const PRESET_LABEL: Record<PresetValue, string> = {
  "7d": "7 ngày gần nhất",
  "30d": "30 ngày gần nhất",
  "this-month": "Tháng này",
  "last-month": "Tháng trước",
  custom: "Tuỳ chọn",
}

export const CHANNEL_FILTER_LABEL: Record<ChannelFilter, string> = {
  all: "Tất cả kênh",
  "in-store": "Tại quầy",
  online: "Online",
}

/** "01/09/2026 – 16/09/2026" (a single day shows once). */
export function periodLabel(period: ReportPeriod): string {
  const last = addDays(period.from, period.days - 1)
  return period.days <= 1 ? formatDate(period.from) : `${formatDate(period.from)} – ${formatDate(last)}`
}

/**
 * The one filter row of the reports page: period preset, custom date range, sales channel,
 * and the store scope (read-only here — it is chosen in the header switcher).
 */
export function ReportFilters({
  preset,
  period,
  channel,
  today,
  scopeLabel,
  onPresetChange,
  onCustomRange,
  onChannelChange,
}: {
  preset: PresetValue
  period: ReportPeriod
  channel: ChannelFilter
  /** Local midnight of today (last selectable day). */
  today: Date
  scopeLabel: string
  onPresetChange: (preset: PeriodPreset) => void
  onCustomRange: (firstDay: Date, lastDay: Date) => void
  onChannelChange: (channel: ChannelFilter) => void
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const pickedCustom = useRef(false)
  const lastDay = addDays(period.to, -1)

  const openCalendar = () => {
    setDraft({ from: period.from, to: lastDay })
    setOpen(true)
  }

  const apply = () => {
    if (!draft?.from) return
    onCustomRange(draft.from, draft.to ?? draft.from)
    setOpen(false)
  }

  const visibleMonths = isMobile ? 1 : 2

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={preset}
        onValueChange={(value) => {
          if (value === "custom") pickedCustom.current = true
          else onPresetChange(value as PeriodPreset)
        }}
      >
        <SelectTrigger className="w-[190px] bg-white" aria-label="Khoảng thời gian">
          <CalendarRangeIcon className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          onCloseAutoFocus={(event) => {
            // "Tuỳ chọn" opens the calendar once the menu has closed (so focus doesn't bounce back).
            if (!pickedCustom.current) return
            pickedCustom.current = false
            event.preventDefault()
            openCalendar()
          }}
        >
          {(["7d", "30d", "this-month", "last-month"] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {PRESET_LABEL[value]}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="custom">{PRESET_LABEL.custom}</SelectItem>
        </SelectContent>
      </Select>

      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) openCalendar()
          else setOpen(false)
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" className="bg-white font-normal" aria-label="Chọn khoảng ngày">
            <CalendarIcon className="text-muted-foreground" />
            <span className="tabular">{periodLabel(period)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto gap-0 p-0">
          <Calendar
            mode="range"
            locale={vi}
            numberOfMonths={visibleMonths}
            defaultMonth={new Date(lastDay.getFullYear(), lastDay.getMonth() - (visibleMonths - 1), 1)}
            endMonth={today}
            disabled={{ after: today }}
            selected={draft}
            onSelect={setDraft}
            formatters={{
              formatCaption: (month) => `Tháng ${month.getMonth() + 1}/${month.getFullYear()}`,
              formatWeekdayName: (day) => weekdayShort(day),
            }}
            className="mx-auto p-3"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5">
            <span className="tabular text-sm text-muted-foreground">
              {draft?.from
                ? draft.to && draft.to > draft.from
                  ? `${formatDate(draft.from)} – ${formatDate(draft.to)}`
                  : formatDate(draft.from)
                : "Chọn ngày bắt đầu và kết thúc"}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button size="sm" disabled={!draft?.from} onClick={apply}>
                Áp dụng
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Select value={channel} onValueChange={(value) => onChannelChange(value as ChannelFilter)}>
        <SelectTrigger className="w-[150px] bg-white" aria-label="Kênh bán">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {(Object.keys(CHANNEL_FILTER_LABEL) as ChannelFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {CHANNEL_FILTER_LABEL[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="inline-flex min-w-0 items-center gap-1.5 px-1 text-sm text-muted-foreground">
        <StoreIcon className="size-4 shrink-0 text-brand" />
        <span className="truncate">{scopeLabel}</span>
      </span>
    </div>
  )
}
