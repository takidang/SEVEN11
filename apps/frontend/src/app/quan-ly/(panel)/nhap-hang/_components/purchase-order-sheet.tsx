"use client"

import {
  BanIcon,
  CheckIcon,
  MailIcon,
  PackageCheckIcon,
  PencilIcon,
  PhoneIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import { Fragment, useState } from "react"
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useProductMap } from "@/hooks/use-catalog"
import { formatDate, formatDateTime, formatNumber, formatPhone, formatVND } from "@/lib/format"
import { PURCHASE_STATUS } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { PurchaseOrder } from "@/types"

import { ProductCell } from "@/components/admin/product-cell"

type Confirm = "receive" | "cancel" | null

const STEPS = [
  { status: "draft", label: "Nháp" },
  { status: "ordered", label: "Đã đặt hàng" },
  { status: "received", label: "Đã nhập kho" },
] as const

function Steps({ purchaseOrder }: { purchaseOrder: PurchaseOrder }) {
  const cancelled = purchaseOrder.status === "cancelled"
  const reached = STEPS.findIndex((s) => s.status === purchaseOrder.status)
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((step, i) => {
        const done = !cancelled && i <= reached
        return (
          <Fragment key={step.status}>
            {i > 0 ? <li aria-hidden className={cn("h-px flex-1", done ? "bg-brand" : "bg-border")} /> : null}
            <li
              className={cn(
                "flex items-center gap-1.5",
                done ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                  done ? "bg-brand text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-3" /> : i + 1}
              </span>
              {step.label}
            </li>
          </Fragment>
        )
      })}
      {cancelled ? (
        <>
          <li aria-hidden className="h-px flex-1 bg-border" />
          <li className="flex items-center gap-1.5 font-medium text-destructive">
            <span className="flex size-5 items-center justify-center rounded-full bg-red-soft">
              <BanIcon className="size-3" />
            </span>
            Đã huỷ
          </li>
        </>
      ) : null}
    </ol>
  )
}

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}

/** Detail of one purchase order + the actions its status allows. */
export function PurchaseOrderSheet({
  purchaseOrder,
  open,
  canEdit,
  onOpenChange,
  onEditDraft,
}: {
  purchaseOrder: PurchaseOrder | null
  open: boolean
  canEdit: boolean
  onOpenChange: (open: boolean) => void
  onEditDraft: (purchaseOrder: PurchaseOrder) => void
}) {
  const productMap = useProductMap()
  const suppliers = useDb((s) => s.suppliers)
  const stores = useDb((s) => s.stores)
  const employees = useDb((s) => s.employees)
  const [confirm, setConfirm] = useState<Confirm>(null)
  // Keep the dialog's text while it animates closed.
  const [lastConfirm, setLastConfirm] = useState<Confirm>(null)
  if (confirm && confirm !== lastConfirm) setLastConfirm(confirm)

  const po = purchaseOrder
  const supplier = po ? suppliers.find((s) => s.id === po.supplierId) : undefined
  const store = po ? stores.find((s) => s.id === po.storeId) : undefined
  const creator = po ? employees.find((e) => e.id === po.createdBy) : undefined
  const units = po ? po.items.reduce((sum, it) => sum + it.quantity, 0) : 0
  const status = po ? PURCHASE_STATUS[po.status] : null

  const sendOrder = () => {
    if (!po) return
    useDb.getState().savePurchaseOrder({ ...po, status: "ordered" })
    toast.success(`Đã gửi đặt hàng ${po.code}`, { description: supplier?.name })
  }

  const receive = () => {
    if (!po) return
    useDb.getState().receivePurchaseOrder(po.id)
    toast.success(`Đã nhập kho ${po.items.length} mặt hàng`, {
      description: `${po.code} · ${formatNumber(units)} sản phẩm vào cửa hàng ${store?.code ?? ""}`,
    })
  }

  const cancel = () => {
    if (!po) return
    const draft = po.status === "draft"
    useDb.getState().cancelPurchaseOrder(po.id)
    toast.success(draft ? `Đã xoá nháp ${po.code}` : `Đã huỷ phiếu ${po.code}`, { description: supplier?.name })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {po && status ? (
          <>
            <SheetHeader className="gap-3 border-b px-5 py-4 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-lg font-semibold">{po.code}</SheetTitle>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <SheetDescription>
                {supplier?.name ?? "Nhà cung cấp"} → {store ? `Cửa hàng ${store.code} – ${store.name}` : ""}
              </SheetDescription>
              <Steps purchaseOrder={po} />
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Info label="Nhà cung cấp">
                  <div className="font-medium">{supplier?.name ?? "—"}</div>
                  {supplier ? (
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      <div>{supplier.contactName}</div>
                      <div className="flex items-center gap-1.5">
                        <PhoneIcon className="size-3" /> {formatPhone(supplier.phone)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MailIcon className="size-3" /> {supplier.email}
                      </div>
                    </div>
                  ) : null}
                </Info>
                <Info label="Cửa hàng nhận">
                  <div className="font-medium">{store ? `${store.code} – ${store.name}` : "—"}</div>
                  {store ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {store.address}, {store.ward}, {store.province}
                    </div>
                  ) : null}
                </Info>
                <Info label="Người tạo">{creator?.fullName ?? "—"}</Info>
                <Info label="Ngày tạo">{formatDateTime(po.createdAt)}</Info>
                <Info label="Ngày giao dự kiến">{po.expectedAt ? formatDate(po.expectedAt) : "Chưa hẹn"}</Info>
                <Info label="Ngày nhập kho">
                  {po.receivedAt ? (
                    formatDateTime(po.receivedAt)
                  ) : (
                    <span className="text-muted-foreground">
                      {po.status === "cancelled" ? "Không nhập (đã huỷ)" : "Chưa nhập kho"}
                    </span>
                  )}
                </Info>
                {po.note ? (
                  <Info label="Ghi chú" className="sm:col-span-2">
                    <p className="rounded-lg bg-muted/60 px-3 py-2">{po.note}</p>
                  </Info>
                ) : null}
              </dl>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Mặt hàng ({po.items.length})</h3>
                <div className="overflow-hidden rounded-lg ring-1 ring-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 pl-3 text-xs font-semibold text-muted-foreground">Sản phẩm</TableHead>
                        <TableHead className="h-9 text-right text-xs font-semibold text-muted-foreground">SL</TableHead>
                        <TableHead className="h-9 text-right text-xs font-semibold text-muted-foreground">
                          Giá vốn
                        </TableHead>
                        <TableHead className="h-9 pr-3 text-right text-xs font-semibold text-muted-foreground">
                          Thành tiền
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {po.items.map((item) => {
                        const product = productMap.get(item.productId)
                        return (
                          <TableRow key={item.productId}>
                            <TableCell className="py-2 pl-3">
                              {product ? (
                                <ProductCell
                                  product={product}
                                  size={32}
                                  meta={
                                    <span>
                                      <span className="font-mono">{product.sku}</span>
                                      {item.lotCode ? (
                                        <>
                                          {" "}
                                          · Lô <span className="font-mono">{item.lotCode}</span>
                                        </>
                                      ) : null}
                                      {item.expiresAt ? <> · HSD {formatDate(item.expiresAt)}</> : null}
                                    </span>
                                  }
                                />
                              ) : (
                                <span className="text-muted-foreground">Sản phẩm không còn trong danh mục</span>
                              )}
                            </TableCell>
                            <TableCell className="tabular py-2 text-right font-medium">
                              {formatNumber(item.quantity)}
                            </TableCell>
                            <TableCell className="tabular py-2 text-right text-muted-foreground">
                              {formatVND(item.costPrice)}
                            </TableCell>
                            <TableCell className="tabular py-2 pr-3 text-right font-medium">
                              {formatVND(item.quantity * item.costPrice)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                    <TableFooter className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="py-2.5 pl-3 text-sm font-semibold">Tổng cộng</TableCell>
                        <TableCell className="tabular py-2.5 text-right font-semibold">{formatNumber(units)}</TableCell>
                        <TableCell />
                        <TableCell className="tabular py-2.5 pr-3 text-right text-base font-semibold">
                          {formatVND(po.total)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </section>
            </div>

            {canEdit && (po.status === "draft" || po.status === "ordered") ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-card px-5 py-3">
                {po.status === "draft" ? (
                  <>
                    <Button variant="ghost" className="mr-auto text-destructive" onClick={() => setConfirm("cancel")}>
                      <Trash2Icon /> Xoá nháp
                    </Button>
                    <Button variant="outline" onClick={() => onEditDraft(po)}>
                      <PencilIcon /> Sửa phiếu
                    </Button>
                    <Button onClick={sendOrder}>
                      <SendIcon /> Gửi đặt hàng
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" className="mr-auto text-destructive" onClick={() => setConfirm("cancel")}>
                      <BanIcon /> Huỷ phiếu
                    </Button>
                    <Button onClick={() => setConfirm("receive")}>
                      <PackageCheckIcon /> Nhận hàng & nhập kho
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
              <AlertDialogContent>
                {(confirm ?? lastConfirm) === "receive" ? (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Nhận hàng & nhập kho {po.code}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {po.items.length} mặt hàng · {formatNumber(units)} sản phẩm sẽ được cộng vào tồn kho cửa hàng{" "}
                        {store?.code}. Hàng có hạn dùng được tạo lô mới để theo dõi.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Chưa nhận</AlertDialogCancel>
                      <AlertDialogAction onClick={receive}>
                        <PackageCheckIcon /> Nhập kho
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                ) : (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {po.status === "draft" ? `Xoá phiếu nháp ${po.code}?` : `Huỷ phiếu nhập ${po.code}?`}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {po.status === "draft"
                          ? "Phiếu nháp sẽ chuyển sang trạng thái Đã huỷ và không thể gửi đặt hàng nữa."
                          : `Đơn đặt hàng với ${supplier?.name ?? "nhà cung cấp"} sẽ bị huỷ. Tồn kho không thay đổi.`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Giữ lại</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={cancel}>
                        {po.status === "draft" ? <Trash2Icon /> : <BanIcon />}
                        {po.status === "draft" ? "Xoá nháp" : "Huỷ phiếu"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                )}
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
