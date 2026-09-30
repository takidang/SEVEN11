"use client"

import { ClipboardCheckIcon, EqualIcon, RotateCcwIcon, ScaleIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCategories, useProductMap, useProducts } from "@/hooks/use-catalog"
import { formatNumber, formatVND, normalizeText } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Product } from "@/types"

import { ProductCell } from "@/components/admin/product-cell"
import { FilterChips, ResultCount, SearchInput, Toolbar } from "@/components/admin/toolbar"
import { DiffBadge, signed } from "./stock-dialogs"

/** productId → counted quantity as typed (digits only; "" = not counted yet). */
export type StocktakeCounts = Record<string, string>

/** One stocktake session of a store: what was counted + which category is being counted. */
export interface StocktakeSession {
  counts: StocktakeCounts
  categoryId: string
}

type View = "all" | "pending" | "diff"

interface Line {
  product: Product
  system: number
  counted: boolean
  actual: number
  diff: number
}

function EmptyStore() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-card px-6 py-14 text-center ring-1 ring-border">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ClipboardCheckIcon className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">Chọn một cửa hàng để kiểm kho</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Kiểm kho luôn đếm hàng thực tế trên kệ của một cửa hàng. Chọn cửa hàng ở ô chọn cửa hàng trên thanh tiêu đề.
      </p>
    </div>
  )
}

function focusInput(index: number) {
  const input = document.querySelector<HTMLInputElement>(`[data-stocktake-index="${index}"]`)
  input?.focus()
  input?.select()
}

function StocktakeBoard({
  storeId,
  storeLabel,
  session: { counts, categoryId },
  onSessionChange,
}: {
  storeId: string
  storeLabel: string
  session: StocktakeSession
  onSessionChange: (updater: (prev: StocktakeSession) => StocktakeSession) => void
}) {
  const products = useProducts()
  const productMap = useProductMap()
  const categories = useCategories()
  const stock = useDb((s) => s.stock)

  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>("all")
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)

  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.sortOrder - b.sortOrder), [categories])
  const category = sortedCategories.find((c) => c.id === categoryId)

  const levels = useMemo(
    () => new Map(stock.filter((l) => l.storeId === storeId).map((l) => [l.productId, l.quantity] as const)),
    [stock, storeId],
  )

  const lines = useMemo<Line[]>(
    () =>
      products
        .filter((p) => categoryId === "all" || p.categoryId === categoryId)
        .map((product) => {
          const system = levels.get(product.id) ?? 0
          const raw = counts[product.id] ?? ""
          const counted = raw !== ""
          const actual = counted ? Number(raw) : 0
          return { product, system, counted, actual, diff: counted ? actual - system : 0 }
        }),
    [products, categoryId, levels, counts],
  )

  const countedHere = lines.filter((l) => l.counted).length
  const diffHere = lines.filter((l) => l.counted && l.diff !== 0).length

  const visible = useMemo(() => {
    let list = lines
    if (view === "pending") list = list.filter((l) => !l.counted)
    if (view === "diff") list = list.filter((l) => l.counted && l.diff !== 0)
    const q = normalizeText(query)
    if (q) {
      list = list.filter(
        (l) =>
          normalizeText(`${l.product.name} ${l.product.brand}`).includes(q) ||
          l.product.sku.toLowerCase().includes(q) ||
          l.product.barcode.includes(query.trim()),
      )
    }
    return list
  }, [lines, view, query])

  const onCountsChange = (updater: (prev: StocktakeCounts) => StocktakeCounts) =>
    onSessionChange((prev) => ({ ...prev, counts: updater(prev.counts) }))
  const setCategoryId = (next: string) => onSessionChange((prev) => ({ ...prev, categoryId: next }))

  /** Every counted product of this store (all categories) — what "Cân bằng kho" applies. */
  const session = useMemo(() => {
    const entries: Line[] = []
    for (const [productId, raw] of Object.entries(counts)) {
      const product = productMap.get(productId)
      if (!product || raw === "") continue
      const system = levels.get(productId) ?? 0
      entries.push({ product, system, counted: true, actual: Number(raw), diff: Number(raw) - system })
    }
    const changed = entries.filter((e) => e.diff !== 0)
    const surplus = changed.filter((e) => e.diff > 0)
    const shortage = changed.filter((e) => e.diff < 0)
    return {
      entries,
      changed,
      matched: entries.length - changed.length,
      surplusCount: surplus.length,
      surplusUnits: surplus.reduce((s, e) => s + e.diff, 0),
      shortageCount: shortage.length,
      shortageUnits: shortage.reduce((s, e) => s + e.diff, 0),
      value: changed.reduce((s, e) => s + e.diff * e.product.costPrice, 0),
    }
  }, [counts, productMap, levels])

  const setCount = (productId: string, value: string) =>
    onCountsChange((prev) => ({ ...prev, [productId]: value.replace(/\D/g, "").slice(0, 5) }))

  const balance = () => {
    const db = useDb.getState()
    for (const e of session.changed) db.setStockLevel(storeId, e.product.id, { quantity: e.actual })
    toast.success(
      session.changed.length
        ? `Đã cân bằng kho ${formatNumber(session.changed.length)} mặt hàng`
        : "Kiểm kho hoàn tất, không có chênh lệch",
      {
        description: session.changed.length
          ? `Thừa ${signed(session.surplusUnits)} · thiếu ${signed(session.shortageUnits)} · giá trị lệch ${formatVND(session.value)}`
          : `${formatNumber(session.entries.length)} mặt hàng đã đếm đều khớp tồn hệ thống`,
      },
    )
    onCountsChange(() => ({}))
    setConfirming(false)
  }

  const percent = lines.length ? Math.round((countedHere / lines.length) * 100) : 0

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-border lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm">
              Đã đếm{" "}
              <span className="tabular font-semibold">
                {formatNumber(countedHere)}/{formatNumber(lines.length)}
              </span>{" "}
              mặt hàng{category ? ` · ${category.name}` : " · tất cả danh mục"}
            </p>
            <span className="tabular text-xs text-muted-foreground">{percent}%</span>
          </div>
          <Progress value={percent} className="mt-2 h-2" aria-label="Tiến độ kiểm kho" />
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Phiên kiểm kho {storeLabel.toLowerCase()}:</span>
            {session.entries.length ? (
              <>
                <StatusBadge tone="neutral">Khớp {formatNumber(session.matched)}</StatusBadge>
                <StatusBadge tone="fresh">
                  Thừa {formatNumber(session.surplusCount)} ({signed(session.surplusUnits)})
                </StatusBadge>
                <StatusBadge tone="danger">
                  Thiếu {formatNumber(session.shortageCount)} ({signed(session.shortageUnits)})
                </StatusBadge>
              </>
            ) : (
              <span>chưa đếm mặt hàng nào. Nhập số lượng thực tế vào cột “Thực tế”.</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" disabled={!session.entries.length} onClick={() => setResetting(true)}>
            <RotateCcwIcon /> Làm lại
          </Button>
          <Button disabled={!session.entries.length} onClick={() => setConfirming(true)}>
            <ScaleIcon /> Cân bằng kho
            {session.entries.length ? (
              <span className="tabular rounded-full bg-white/20 px-1.5 text-xs">
                {formatNumber(session.entries.length)}
              </span>
            ) : null}
          </Button>
        </div>
      </section>

      <Toolbar>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full bg-card sm:w-[210px]" aria-label="Chọn danh mục kiểm kho">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {sortedCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm tên, SKU hoặc mã vạch" />
        <FilterChips
          label="Lọc dòng kiểm kho"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "Tất cả", count: lines.length },
            { value: "pending", label: "Chưa đếm", count: lines.length - countedHere },
            { value: "diff", label: "Có chênh lệch", count: diffHere },
          ]}
        />
        <ResultCount>{formatNumber(visible.length)} dòng</ResultCount>
      </Toolbar>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 pl-4 text-xs font-semibold text-muted-foreground">Sản phẩm</TableHead>
              <TableHead className="h-10 text-right text-xs font-semibold text-muted-foreground">
                Tồn hệ thống
              </TableHead>
              <TableHead className="h-10 w-[170px] text-xs font-semibold text-muted-foreground">Thực tế</TableHead>
              <TableHead className="h-10 text-right text-xs font-semibold text-muted-foreground">Chênh lệch</TableHead>
              <TableHead className="h-10 pr-4 text-right text-xs font-semibold text-muted-foreground">
                Giá trị lệch
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((line, index) => (
                <TableRow key={line.product.id} className={cn(line.counted && line.diff !== 0 && "bg-muted/30")}>
                  <TableCell className="py-2 pl-4">
                    <ProductCell
                      product={line.product}
                      size={32}
                      meta={
                        <span>
                          <span className="font-mono">{line.product.sku}</span> · {line.product.unit}
                        </span>
                      }
                    />
                  </TableCell>
                  <TableCell className="tabular py-2 text-right font-medium">{formatNumber(line.system)}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1">
                      <Input
                        value={counts[line.product.id] ?? ""}
                        onChange={(event) => setCount(line.product.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "ArrowDown") {
                            event.preventDefault()
                            focusInput(index + 1)
                          } else if (event.key === "ArrowUp") {
                            event.preventDefault()
                            focusInput(index - 1)
                          }
                        }}
                        data-stocktake-index={index}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="—"
                        aria-label={`Số lượng thực tế: ${line.product.name}`}
                        className={cn(
                          "tabular h-8 w-24 bg-card text-right font-medium",
                          line.counted && "border-brand/40 bg-brand-soft/40",
                        )}
                      />
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground"
                        title="Điền số thực tế bằng tồn hệ thống"
                        aria-label={`Khớp với tồn hệ thống: ${line.product.name}`}
                        onClick={() => setCount(line.product.id, String(line.system))}
                      >
                        <EqualIcon /> Khớp
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    {line.counted ? <DiffBadge diff={line.diff} /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular py-2 pr-4 text-right",
                      !line.counted || line.diff === 0 ? "text-muted-foreground" : "font-medium",
                    )}
                  >
                    {line.counted && line.diff !== 0 ? formatVND(line.diff * line.product.costPrice) : "—"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center">
                  <p className="text-sm font-medium">
                    {view === "diff"
                      ? "Chưa có mặt hàng nào lệch"
                      : view === "pending"
                        ? "Đã đếm hết"
                        : "Không có mặt hàng phù hợp"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Thử bộ lọc hoặc danh mục khác.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cân bằng kho {storeLabel.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              Đã đếm {formatNumber(session.entries.length)} mặt hàng: {formatNumber(session.matched)} khớp,{" "}
              {formatNumber(session.surplusCount)} thừa, {formatNumber(session.shortageCount)} thiếu. Tồn hệ thống của
              các mặt hàng lệch sẽ được cập nhật bằng số đếm thực tế.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="text-xs text-muted-foreground">Mặt hàng lệch</div>
              <div className="tabular mt-1 text-lg font-semibold">{formatNumber(session.changed.length)}</div>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="text-xs text-muted-foreground">Số lượng lệch</div>
              <div className="tabular mt-1 text-lg font-semibold">
                {signed(session.surplusUnits + session.shortageUnits)}
              </div>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="text-xs text-muted-foreground">Giá trị lệch</div>
              <div className="tabular mt-1 text-lg font-semibold">{formatVND(session.value)}</div>
            </div>
          </div>

          {session.changed.length ? (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg ring-1 ring-border">
              {session.changed.map((e) => (
                <li key={e.product.id} className="flex items-center gap-3 px-3 py-2">
                  <ProductCell product={e.product} size={32} showBarcode={false} className="flex-1" />
                  <span className="tabular shrink-0 text-sm text-muted-foreground">
                    {formatNumber(e.system)} →{" "}
                    <span className="font-semibold text-foreground">{formatNumber(e.actual)}</span>
                  </span>
                  <DiffBadge diff={e.diff} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
              Tất cả mặt hàng đã đếm đều khớp tồn hệ thống, không có gì cần điều chỉnh.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Quay lại đếm tiếp
            </Button>
            <Button onClick={balance}>
              <ScaleIcon /> {session.changed.length ? "Cân bằng kho" : "Hoàn tất kiểm kho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetting} onOpenChange={setResetting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Làm lại phiên kiểm kho?</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá {formatNumber(session.entries.length)} số lượng đã đếm. Tồn kho hệ thống không thay đổi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tiếp tục đếm</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onCountsChange(() => ({}))
                toast.success("Đã xoá số đếm, bắt đầu lại phiên kiểm kho")
              }}
            >
              <RotateCcwIcon /> Làm lại
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function StocktakeTab({
  storeId,
  storeLabel,
  session,
  onSessionChange,
}: {
  storeId: string | null
  storeLabel: string
  session: StocktakeSession
  onSessionChange: (updater: (prev: StocktakeSession) => StocktakeSession) => void
}) {
  if (!storeId) return <EmptyStore />
  return (
    <StocktakeBoard storeId={storeId} storeLabel={storeLabel} session={session} onSessionChange={onSessionChange} />
  )
}
