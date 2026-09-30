import { ArrowUpRightIcon, StoreIcon } from "lucide-react"

/** Shown when an admin looks at the whole chain: stock actions need one concrete store. */
export function ChainScopeHint({ storeCount }: { storeCount: number }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-border">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <StoreIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-foreground">Đang xem tổng tồn kho của {storeCount} cửa hàng · chỉ xem</p>
        <p className="mt-0.5 text-muted-foreground">
          Điều chỉnh tồn, xuất huỷ lô và kiểm kho luôn làm trên một cửa hàng. Chọn cửa hàng ở ô{" "}
          <span className="font-medium text-foreground">Toàn chuỗi</span> trên thanh tiêu đề.
        </p>
      </div>
      <ArrowUpRightIcon className="hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden />
    </div>
  )
}
