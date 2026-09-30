"use client"

import {
  BriefcaseBusinessIcon,
  HouseIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  SchoolIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
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
import { formatPhone } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDb } from "@/stores/db"
import type { Address, Customer } from "@/types"

import { AddressFormDialog } from "./address-form-dialog"

function labelIcon(label: string) {
  const l = label.toLowerCase()
  if (l.includes("nhà")) return HouseIcon
  if (l.includes("công ty") || l.includes("văn phòng")) return BriefcaseBusinessIcon
  if (l.includes("trường")) return SchoolIcon
  return MapPinIcon
}

export function AddressesTab({ customer }: { customer: Customer }) {
  // Target and open state are separate so the dialog doesn't flash another form while closing.
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Address | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removing, setRemoving] = useState<Address | null>(null)

  const openForm = (address: Address | null) => {
    setEditing(address)
    setFormOpen(true)
  }

  const setDefault = (address: Address) => {
    useDb.getState().saveAddress(customer.id, { ...address, isDefault: true })
    toast.success("Đã đổi địa chỉ mặc định", { description: `${address.label}: ${address.line}, ${address.ward}` })
  }

  const askRemove = (address: Address) => {
    setRemoving(address)
    setRemoveOpen(true)
  }

  const confirmRemove = () => {
    if (!removing) return
    useDb.getState().removeAddress(customer.id, removing.id)
    toast.success("Đã xoá địa chỉ", { description: removing.label })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Sổ địa chỉ</h2>
          <p className="text-sm text-muted-foreground">Địa chỉ mặc định được điền sẵn khi bạn đặt hàng.</p>
        </div>
        <Button className="h-9" onClick={() => openForm(null)}>
          <PlusIcon /> Thêm địa chỉ
        </Button>
      </div>

      {customer.addresses.length ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {customer.addresses.map((address) => {
            const Icon = labelIcon(address.label)
            return (
              <li
                key={address.id}
                className={cn(
                  "flex flex-col rounded-xl bg-card p-4 ring-1",
                  address.isDefault ? "ring-brand/40" : "ring-border",
                )}
              >
                <div className="flex flex-1 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {address.label}
                      {address.isDefault ? <StatusBadge tone="brand">Mặc định</StatusBadge> : null}
                    </p>
                    <p className="mt-1 text-sm">
                      {address.recipient} <span className="text-muted-foreground">·</span>{" "}
                      <span className="tabular">{formatPhone(address.phone)}</span>
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {address.line}, {address.ward}, {address.province}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => openForm(address)}>
                    <PencilIcon /> Sửa
                  </Button>
                  {!address.isDefault ? (
                    <Button variant="ghost" size="sm" onClick={() => setDefault(address)}>
                      Đặt làm mặc định
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-muted-foreground hover:bg-red-soft hover:text-red"
                    onClick={() => askRemove(address)}
                    aria-label={`Xoá địa chỉ ${address.label}`}
                  >
                    <Trash2Icon /> Xoá
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-xl px-6 py-12 text-center ring-1 ring-border">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MapPinIcon className="size-6" />
          </span>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Bạn chưa lưu địa chỉ nào. Thêm địa chỉ để đặt hàng nhanh hơn lần sau.
          </p>
          <Button className="mt-4 h-9" onClick={() => openForm(null)}>
            <PlusIcon /> Thêm địa chỉ
          </Button>
        </div>
      )}

      <AddressFormDialog customer={customer} address={editing} open={formOpen} onOpenChange={setFormOpen} />

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá địa chỉ “{removing?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? `${removing.line}, ${removing.ward}, ${removing.province}. ` : ""}
              {removing?.isDefault && customer.addresses.length > 1
                ? "Đây là địa chỉ mặc định, địa chỉ tiếp theo trong sổ sẽ được đặt làm mặc định."
                : "Thao tác này không thể hoàn tác."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove}>
              Xoá địa chỉ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
