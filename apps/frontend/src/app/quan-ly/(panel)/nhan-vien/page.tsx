"use client"

import { CalendarDaysIcon, ReceiptTextIcon, UserRoundPlusIcon, UsersRoundIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { PageHeader } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toDateKey } from "@/lib/format"
import { canManage } from "@/lib/permissions"
import { useStoreScope } from "@/stores/admin-ui"
import { useDb } from "@/stores/db"
import { useNow } from "@/stores/hydration"
import { useCurrentStaff } from "@/stores/session"

import { ClosingTab } from "./_components/closing-tab"
import { EmployeeSheet, type EmployeeSheetState } from "./_components/employee-sheet"
import { EmployeesTab } from "./_components/employees-tab"
import { ScheduleTab } from "./_components/schedule-tab"
import { STAFF_TABS, type StaffTab } from "./_components/staff-meta"
import { StoreRequired } from "./_components/store-required"

const TAB_TRIGGER =
  "flex-none gap-1.5 px-3 text-muted-foreground after:bg-brand data-active:text-foreground [&_svg]:text-muted-foreground data-active:[&_svg]:text-brand"

export default function StaffPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StaffView />
    </Suspense>
  )
}

function StaffView() {
  const now = useNow(30_000)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const staff = useCurrentStaff()
  const { storeId } = useStoreScope()
  const stores = useDb((s) => s.stores)
  const [sheet, setSheet] = useState<EmployeeSheetState>(null)

  const rawTab = params.get("tab")
  const tab: StaffTab = STAFF_TABS.includes(rawTab as StaffTab) ? (rawTab as StaffTab) : "nhan-vien"

  const navigate = (next: { tab?: StaffTab; date?: string | null }) => {
    const query = new URLSearchParams(params.toString())
    if (next.tab) query.set("tab", next.tab)
    if (next.date === null) query.delete("ngay")
    else if (next.date) query.set("ngay", next.date)
    router.replace(`${pathname}?${query.toString()}`, { scroll: false })
  }

  if (!now || !staff) return <PageSkeleton />

  const store = storeId ? stores.find((s) => s.id === storeId) : undefined
  const manage = canManage(staff.role, "employees")
  const todayKey = toDateKey(now)
  const dateParam = params.get("ngay")
  const closingDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= todayKey ? dateParam : todayKey

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhân viên & ca làm"
        description={
          store
            ? `Cửa hàng ${store.code} – ${store.name}: nhân sự, lịch ca theo tuần và chốt tiền két cuối ca.`
            : "Nhân sự toàn chuỗi. Chọn một cửa hàng để xếp lịch ca và chốt tiền két."
        }
        actions={
          tab === "nhan-vien" && manage ? (
            <Button onClick={() => setSheet({ mode: "create", nonce: Date.now() })}>
              <UserRoundPlusIcon /> Thêm nhân viên
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={(v) => navigate({ tab: v as StaffTab })} className="gap-5">
        <div className="no-scrollbar overflow-x-auto border-b">
          <TabsList variant="line" className="h-10 gap-2 px-0">
            <TabsTrigger value="nhan-vien" className={TAB_TRIGGER}>
              <UsersRoundIcon /> Nhân viên
            </TabsTrigger>
            <TabsTrigger value="lich-ca" className={TAB_TRIGGER}>
              <CalendarDaysIcon /> Lịch ca
            </TabsTrigger>
            <TabsTrigger value="chot-ca" className={TAB_TRIGGER}>
              <ReceiptTextIcon /> Chốt ca
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="nhan-vien">
          <EmployeesTab
            actor={staff}
            storeId={storeId}
            onOpen={(employee) => setSheet({ mode: "view", employeeId: employee.id })}
          />
        </TabsContent>
        <TabsContent value="lich-ca">
          {store ? (
            <ScheduleTab
              store={store}
              canManage={manage}
              now={now}
              onReviewDay={(date) => navigate({ tab: "chot-ca", date: date === todayKey ? null : date })}
            />
          ) : (
            <StoreRequired what="lịch ca" />
          )}
        </TabsContent>
        <TabsContent value="chot-ca">
          {store ? (
            <ClosingTab
              store={store}
              canManage={manage}
              now={now}
              date={closingDate}
              onDateChange={(date) => navigate({ date: date === todayKey ? null : date })}
            />
          ) : (
            <StoreRequired what="chốt ca" />
          )}
        </TabsContent>
      </Tabs>

      <EmployeeSheet state={sheet} onStateChange={setSheet} actor={staff} defaultStoreId={storeId} now={now} />
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-80" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
