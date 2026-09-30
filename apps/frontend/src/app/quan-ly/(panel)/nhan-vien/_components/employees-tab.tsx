"use client"

import { SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { type ColumnDef, DataTable } from "@/components/admin/data-table"
import { StatusBadge } from "@/components/admin/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate, formatNumber, formatPhone, initials, normalizeText } from "@/lib/format"
import { ROLE_LABEL } from "@/lib/permissions"
import { useDb } from "@/stores/db"
import type { Employee, EmployeeStatus, Role, Store } from "@/types"

import { EMPLOYEE_STATUS } from "@/lib/order-status"
import { ROLE_ORDER } from "@/lib/permissions"

function buildColumns(storeById: Map<string, Store>, actorId: string, showStore: boolean) {
  const columns: ColumnDef<Employee, unknown>[] = [
    {
      id: "code",
      accessorFn: (e) => e.code,
      header: "Mã",
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>,
    },
    {
      id: "name",
      accessorFn: (e) => e.fullName,
      header: "Họ tên",
      sortingFn: (a, b) => a.original.fullName.localeCompare(b.original.fullName, "vi"),
      cell: ({ row }) => (
        <div className="flex min-w-40 items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-dark">
              {initials(row.original.fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground">{row.original.fullName}</span>
          {row.original.id === actorId ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Bạn</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "role",
      accessorFn: (e) => ROLE_ORDER[e.role],
      header: "Vai trò",
      cell: ({ row }) => ROLE_LABEL[row.original.role],
    },
  ]
  if (showStore) {
    columns.push({
      id: "store",
      accessorFn: (e) => (e.storeId ? (storeById.get(e.storeId)?.code ?? "") : ""),
      header: "Cửa hàng",
      cell: ({ row }) => {
        const store = row.original.storeId ? storeById.get(row.original.storeId) : undefined
        return store ? (
          <span>
            <span className="tabular">{store.code}</span> – {store.name}
          </span>
        ) : (
          <span className="text-muted-foreground">Toàn chuỗi</span>
        )
      },
    })
  }
  columns.push(
    {
      id: "phone",
      accessorFn: (e) => e.phone,
      header: "SĐT",
      enableSorting: false,
      cell: ({ row }) => <span className="tabular">{formatPhone(row.original.phone)}</span>,
    },
    {
      id: "email",
      accessorFn: (e) => e.email,
      header: "Email",
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
    },
    {
      id: "hiredAt",
      accessorFn: (e) => e.hiredAt,
      header: "Ngày vào làm",
      meta: { align: "right" },
      cell: ({ row }) => formatDate(row.original.hiredAt),
    },
    {
      id: "status",
      accessorFn: (e) => e.status,
      header: "Trạng thái",
      cell: ({ row }) => (
        <StatusBadge tone={EMPLOYEE_STATUS[row.original.status].tone}>
          {EMPLOYEE_STATUS[row.original.status].label}
        </StatusBadge>
      ),
    },
  )
  return columns
}

export function EmployeesTab({
  actor,
  storeId,
  onOpen,
}: {
  actor: Employee
  /** Store in scope; null = whole chain. */
  storeId: string | null
  onOpen: (employee: Employee) => void
}) {
  const employees = useDb((s) => s.employees)
  const stores = useDb((s) => s.stores)
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<Role | "all">("all")
  const [status, setStatus] = useState<EmployeeStatus | "all">("all")

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s] as const)), [stores])
  const columns = useMemo(() => buildColumns(storeById, actor.id, !storeId), [storeById, actor.id, storeId])

  const scoped = useMemo(
    () => (storeId ? employees.filter((e) => e.storeId === storeId) : employees),
    [employees, storeId],
  )

  const rows = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    const digits = query.replace(/\D/g, "")
    return scoped
      .filter((e) => {
        if (role !== "all" && e.role !== role) return false
        if (status !== "all" && e.status !== status) return false
        if (!terms.length) return true
        if (digits.length >= 3 && e.phone.includes(digits)) return true
        const haystack = normalizeText(`${e.fullName} ${e.code} ${e.email}`)
        return terms.every((t) => haystack.includes(t))
      })
      .sort(
        (a, b) =>
          Number(a.status === "inactive") - Number(b.status === "inactive") ||
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          a.code.localeCompare(b.code),
      )
  }, [scoped, query, role, status])

  const counts = useMemo(() => {
    const result: Record<EmployeeStatus, number> = { active: 0, "on-leave": 0, inactive: 0 }
    for (const e of scoped) result[e.status]++
    return result
  }, [scoped])

  const filtered = query.trim() !== "" || role !== "all" || status !== "all"

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên, mã, SĐT hoặc email"
            className="bg-card pl-8"
            aria-label="Tìm nhân viên"
          />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as Role | "all")}>
          <SelectTrigger className="w-44 bg-card" aria-label="Lọc theo vai trò">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả vai trò</SelectItem>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as EmployeeStatus | "all")}>
          <SelectTrigger className="w-44 bg-card" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {(Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {EMPLOYEE_STATUS[s].label} ({counts[s]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">{formatNumber(rows.length)} nhân viên</span>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        onRowClick={onOpen}
        rowClassName={(row) => (row.status === "inactive" ? "text-muted-foreground" : undefined)}
        emptyTitle={filtered ? "Không tìm thấy nhân viên" : "Chưa có nhân viên"}
        emptyDescription={
          filtered ? "Thử từ khoá, vai trò hoặc trạng thái khác." : "Thêm nhân viên đầu tiên cho cửa hàng."
        }
      />
    </div>
  )
}
