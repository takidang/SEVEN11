"use client"

import { create } from "zustand"

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
import { useCart } from "@/stores/cart"

/** Pending action waiting for the shopper to confirm they are 18+. */
const useAgeGate = create<{ pending: (() => void) | null }>(() => ({ pending: null }))

/** Run `action` now if age is confirmed, otherwise ask first. */
export function requireAdult(action: () => void) {
  if (useCart.getState().ageConfirmed) action()
  else useAgeGate.setState({ pending: action })
}

/** Mount once per layout that sells age-restricted products. */
export function AgeGateDialog() {
  const pending = useAgeGate((s) => s.pending)
  const close = () => useAgeGate.setState({ pending: null })

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sản phẩm giới hạn độ tuổi</AlertDialogTitle>
          <AlertDialogDescription>
            Đồ uống có cồn chỉ bán cho khách từ đủ 18 tuổi trở lên. Nhân viên giao hàng có thể kiểm tra giấy tờ tuỳ thân
            khi nhận hàng.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Để sau</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              useCart.getState().confirmAge()
              pending?.()
              close()
            }}
          >
            Tôi đã đủ 18 tuổi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
