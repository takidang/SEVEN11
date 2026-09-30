"use client"

import { BanIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatVND } from "@/lib/format"
import { canCancelOrder } from "@/lib/order-status"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import { useCurrentStaff } from "@/stores/session"
import type { Order } from "@/types"

const QUICK_REASONS = [
  "Khách yêu cầu huỷ",
  "Hết hàng tại cửa hàng",
  "Không liên lạc được khách",
  "Ngoài vùng giao hàng",
]

export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        {open ? <CancelForm order={order} onDone={() => onOpenChange(false)} /> : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CancelForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const staff = useCurrentStaff()
  const [reason, setReason] = useState("")
  const [touched, setTouched] = useState(false)
  const invalid = reason.trim().length < 3
  const refund = order.paymentStatus === "paid"

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (invalid || !staff) return
    if (!canCancelOrder(order.status)) {
      toast.error("Đơn đã được giao, không thể huỷ")
      onDone()
      return
    }
    useDb.getState().updateOrderStatus(order.id, "cancelled", staff.fullName, reason.trim())
    toast.success(`Đã huỷ đơn ${order.code}`)
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Huỷ đơn {order.code}?</AlertDialogTitle>
        <AlertDialogDescription>
          Hàng sẽ được hoàn lại tồn kho cửa hàng
          {refund ? ` và hoàn ${formatVND(order.total)} cho khách` : ""}. Thao tác này không thể hoàn tác.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="cancel-reason">Lý do huỷ</Label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setReason(r)
                setTouched(true)
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs ring-1 transition-colors",
                reason === r ? "bg-brand-soft text-brand-dark ring-brand/30" : "ring-border hover:bg-muted",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          id="cancel-reason"
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Nhập lý do để lưu vào lịch sử đơn"
          aria-invalid={touched && invalid}
          rows={3}
        />
        {touched && invalid ? <p className="text-sm text-destructive">Nhập lý do huỷ đơn</p> : null}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel type="button">Không huỷ</AlertDialogCancel>
        <Button type="submit" variant="destructive">
          <BanIcon /> Huỷ đơn
        </Button>
      </AlertDialogFooter>
    </form>
  )
}
