"use client"

import { RotateCcwIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { requireAdult } from "@/components/shop/age-gate"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useProductMap } from "@/hooks/use-catalog"
import { useCart } from "@/stores/cart"
import { useDb } from "@/stores/db"
import type { Order } from "@/types"

/** "Mua lại": put every item that is still sold back into the cart, then open it. */
export function ReorderButton({ order }: { order: Order }) {
  const router = useRouter()
  const productMap = useProductMap()

  const reorder = () => {
    const items = order.items.filter((it) => productMap.get(it.productId)?.isActive)
    if (!items.length) {
      toast.error("Các sản phẩm trong đơn này đã ngừng bán")
      return
    }
    const run = () => {
      const cart = useCart.getState()
      for (const it of items) cart.add(it.productId, it.quantity)
      const skipped = order.items.length - items.length
      toast.success(
        `Đã thêm ${items.length} sản phẩm vào giỏ hàng`,
        skipped ? { description: `${skipped} sản phẩm đã ngừng bán nên không được thêm.` } : undefined,
      )
      router.push("/gio-hang")
    }
    if (items.some((it) => productMap.get(it.productId)?.ageRestricted)) requireAdult(run)
    else run()
  }

  return (
    <Button variant="outline" className="h-9" onClick={reorder}>
      <RotateCcwIcon /> Mua lại
    </Button>
  )
}

/** Shoppers can cancel only while the store has not confirmed the order. */
export function CancelOrderButton({ order, customerName }: { order: Order; customerName: string }) {
  const cancel = () => {
    const latest = useDb.getState().orders.find((o) => o.id === order.id)
    if (!latest || latest.status !== "pending") {
      toast.error("Cửa hàng vừa xác nhận đơn nên không thể huỷ trên web", {
        description: "Vui lòng gọi cửa hàng nếu bạn cần hỗ trợ.",
      })
      return
    }
    useDb.getState().updateOrderStatus(order.id, "cancelled", customerName, "Khách huỷ trên web")
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="h-9">
          <XIcon /> Huỷ đơn
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Huỷ đơn hàng {order.code}?</AlertDialogTitle>
          <AlertDialogDescription>
            Cửa hàng chưa xác nhận nên bạn có thể huỷ miễn phí.
            {order.paymentStatus === "paid"
              ? " Số tiền đã thanh toán sẽ được hoàn lại trong 1–3 ngày làm việc."
              : ""}{" "}
            Thao tác này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Giữ đơn</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={cancel}>
            Huỷ đơn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
