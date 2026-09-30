"use client"

import { BanIcon, BikeIcon, PackageCheckIcon, PercentIcon, WalletIcon } from "lucide-react"

import { Panel } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { relativeChange } from "@/lib/analytics"
import { formatCompactVND, formatNumber, formatPercent, formatVND } from "@/lib/format"
import { PAYMENT_METHOD } from "@/lib/order-status"
import { cn } from "@/lib/utils"

import { HorizontalBarChart } from "../../_components/horizontal-bar-chart"
import { DailyRevenueChart } from "./daily-revenue-chart"
import type {
  DeliveryReport,
  ProfitReport,
  PaymentsReport,
  ProductsReport,
  RevenueReport,
  StaffReport,
  StoresReport,
} from "./report-model"
import { ReportTable } from "./report-table"

const ITEM_SALES_NOTE = "Tiền hàng sau khuyến mãi từng dòng, chưa trừ mã giảm giá theo đơn, không gồm phí giao"

export function RevenueTab({ report, now, caption }: { report: RevenueReport; now: Date; caption: string }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Panel title="Doanh thu theo ngày" description={caption}>
        <DailyRevenueChart days={report.days} now={now} />
      </Panel>
      <Panel
        title="Chi tiết theo ngày"
        description="Lợi nhuận gộp = tiền hàng − giá vốn hiện tại; biên % = lợi nhuận gộp / doanh thu"
        bodyClassName="p-0"
      >
        <ReportTable spec={report.table} />
      </Panel>
    </div>
  )
}

export function ProductsTab({ report }: { report: ProductsReport }) {
  const withSales = report.categories.filter((c) => c.revenue > 0)
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-4" title="Doanh thu theo danh mục" description={ITEM_SALES_NOTE}>
        {withSales.length ? (
          <HorizontalBarChart
            data={withSales.map((c) => ({
              key: c.categoryId,
              label: c.name,
              value: c.revenue,
              details: [
                { label: "SL bán", value: formatNumber(c.quantity) },
                { label: "Tỷ trọng", value: formatPercent(c.share) },
                { label: "Biên lợi nhuận", value: formatPercent(c.margin) },
              ],
            }))}
            seriesLabel="Doanh thu"
            formatValue={formatVND}
            formatBarLabel={formatCompactVND}
            labelWidth={150}
            rowHeight={40}
          />
        ) : (
          <EmptyChart />
        )}
      </Panel>
      <Panel className="xl:col-span-8" title="Chi tiết theo danh mục" description={ITEM_SALES_NOTE} bodyClassName="p-0">
        <ReportTable spec={report.categoryTable} />
      </Panel>
      <Panel className="xl:col-span-12" title="Top 20 sản phẩm theo doanh thu" bodyClassName="p-0">
        <ReportTable spec={report.productTable} />
      </Panel>
    </div>
  )
}

export function StoresTab({ report }: { report: StoresReport }) {
  const withSales = report.rows.filter((r) => r.revenue > 0)
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-4" title="Doanh thu theo cửa hàng" description="Từ cao đến thấp">
        {withSales.length ? (
          <HorizontalBarChart
            data={withSales.map((r) => ({
              key: r.storeId,
              label: r.store ? `${r.store.code} · ${r.store.name}` : r.storeId,
              value: r.revenue,
              details: [
                { label: "Số đơn", value: formatNumber(r.orders) },
                { label: "TB/đơn", value: formatVND(r.aov) },
                { label: "Online", value: formatPercent(r.onlineShare) },
              ],
            }))}
            seriesLabel="Doanh thu"
            formatValue={formatVND}
            formatBarLabel={formatCompactVND}
            labelWidth={160}
            rowHeight={54}
          />
        ) : (
          <EmptyChart />
        )}
      </Panel>
      <Panel
        className="xl:col-span-8"
        title="Chi tiết theo cửa hàng"
        description="Online % = tỷ lệ số đơn đặt online"
        bodyClassName="p-0"
      >
        <ReportTable spec={report.table} />
      </Panel>
    </div>
  )
}

export function StaffTab({ report }: { report: StaffReport }) {
  return (
    <Panel
      title="Doanh thu theo nhân viên"
      description="Đơn tại quầy tính cho thu ngân bán, đơn online cho người xác nhận · tỷ lệ tiền mặt = doanh thu thu bằng tiền mặt / doanh thu"
      bodyClassName="p-0"
    >
      <ReportTable spec={report.table} />
    </Panel>
  )
}

/**
 * Profit & loss: gross profit is measured from the orders, running costs come from the monthly
 * rates in `data/company.ts`. This is the only screen that answers "chuỗi này lãi hay lỗ".
 */
export function ProfitTab({ report, caption }: { report: ProfitReport; caption: string }) {
  const profitable = report.netProfit >= 0
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Lãi gộp" value={formatPercent(report.grossMargin)} icon={PercentIcon} hint="trên doanh thu" />
        <StatCard
          label={profitable ? "Lãi thuần" : "Lỗ thuần"}
          value={formatVND(Math.abs(report.netProfit))}
          icon={WalletIcon}
          hint={`${formatPercent(Math.abs(report.netMargin))} doanh thu · ${caption}`}
        />
        <StatCard
          label="Quy ra một tháng"
          value={formatVND(Math.abs(report.monthly.netProfit))}
          icon={WalletIcon}
          hint={`${profitable ? "Lãi" : "Lỗ"} mỗi tháng nếu giữ nhịp này`}
        />
      </div>

      <Panel title="Kết quả kinh doanh" description={caption} bodyClassName="p-0">
        <table className="w-full text-sm">
          <tbody>
            {report.lines.map((line) => (
              <tr
                key={line.id}
                className={cn(
                  "border-b last:border-0",
                  line.total && "bg-muted/40 font-semibold",
                  line.id === "net" && (profitable ? "text-fresh" : "text-sale"),
                )}
              >
                <th scope="row" className="px-4 py-2.5 text-left font-[inherit]">
                  {line.label}
                  {line.note ? (
                    <span className="block text-xs font-normal text-muted-foreground">{line.note}</span>
                  ) : null}
                </th>
                <td className="tabular px-4 py-2.5 text-right">
                  {line.amount < 0 ? `− ${formatVND(-line.amount)}` : formatVND(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <p className="text-xs leading-5 text-muted-foreground">
        Doanh thu và giá vốn lấy từ đơn hàng thật trong kỳ. Lương, mặt bằng, điện nước và marketing tính theo định mức
        hằng tháng của chuỗi (xem `src/data/company.ts`) vì dự án chưa có phân hệ chi phí.
      </p>
    </div>
  )
}

/** Deliveries: how many orders went out, how far, and how much of the delivery fee shoppers paid. */
export function DeliveryTab({ report }: { report: DeliveryReport }) {
  const trips = report.rows.reduce((sum, r) => sum + r.orders, 0)
  const collected = report.rows.reduce((sum, r) => sum + r.collected, 0)
  const free = report.rows.reduce((sum, r) => sum + r.freeTrips, 0)
  const km = report.rows.reduce((sum, r) => sum + r.km, 0)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Đơn đã giao"
          value={formatNumber(trips)}
          icon={BikeIcon}
          hint={trips ? `Quãng trung bình ${formatNumber(Math.round((km / trips) * 10) / 10)} km` : undefined}
        />
        <StatCard
          label="Phí giao thu được"
          value={formatVND(collected)}
          icon={WalletIcon}
          hint={trips ? `Trung bình ${formatVND(Math.round(collected / trips))} mỗi đơn` : undefined}
        />
        <StatCard
          label="Đơn được miễn phí giao"
          value={formatNumber(free)}
          icon={PercentIcon}
          hint={trips ? `${formatPercent(free / trips)} số đơn giao` : undefined}
        />
      </div>
      <ReportTable spec={report.table} />
      <p className="text-xs text-muted-foreground">
        Nhân viên cửa hàng tự giao, nên chi phí giao hàng nằm trong lương chứ không tính riêng theo đơn.
      </p>
    </div>
  )
}

export function PaymentsTab({ report, showCancellation }: { report: PaymentsReport; showCancellation: boolean }) {
  const withSales = report.rows.filter((r) => r.revenue > 0)
  const c = report.cancellation
  const p = report.previousCancellation
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-4" title="Doanh thu theo phương thức thanh toán" description="Từ cao đến thấp">
        {withSales.length ? (
          <HorizontalBarChart
            data={withSales.map((r) => ({
              key: r.method,
              label: PAYMENT_METHOD[r.method],
              value: r.revenue,
              details: [
                { label: "Số đơn", value: formatNumber(r.orders) },
                { label: "Tỷ trọng", value: formatPercent(r.share) },
              ],
            }))}
            seriesLabel="Doanh thu"
            formatValue={formatVND}
            formatBarLabel={formatCompactVND}
            labelWidth={170}
            rowHeight={42}
          />
        ) : (
          <EmptyChart />
        )}
      </Panel>
      <Panel className="xl:col-span-8" title="Chi tiết theo phương thức" bodyClassName="p-0">
        <ReportTable spec={report.table} />
      </Panel>

      <section className="space-y-3 xl:col-span-12">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Huỷ đơn online</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tính trên mọi đơn online đặt trong kỳ{p ? ", so với kỳ trước" : ""}
          </p>
        </div>
        {showCancellation ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Đơn online đã đặt"
              value={formatNumber(c.placed)}
              icon={PackageCheckIcon}
              delta={p ? relativeChange(c.placed, p.placed) : null}
              hint="Không có dữ liệu kỳ trước"
            />
            <StatCard
              label="Đơn bị huỷ"
              value={formatNumber(c.cancelled)}
              icon={BanIcon}
              delta={p ? relativeChange(c.cancelled, p.cancelled) : null}
              upIsGood={false}
              hint={p ? "Kỳ trước không có đơn huỷ" : "Không có dữ liệu kỳ trước"}
            />
            <StatCard
              label="Tỷ lệ huỷ"
              value={c.placed ? formatPercent(c.rate) : "—"}
              icon={PercentIcon}
              hint={p ? `Kỳ trước: ${p.placed ? formatPercent(p.rate) : "—"}` : "Không có dữ liệu kỳ trước"}
            />
            <StatCard
              label="Giá trị đơn bị huỷ"
              value={formatVND(c.cancelledValue)}
              icon={WalletIcon}
              delta={p ? relativeChange(c.cancelledValue, p.cancelledValue) : null}
              upIsGood={false}
              hint={p ? "Kỳ trước không có đơn huỷ" : "Không có dữ liệu kỳ trước"}
            />
          </div>
        ) : (
          <div
            className={cn("rounded-xl bg-card px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-border")}
          >
            Đơn tại quầy không có bước huỷ. Chọn kênh “Tất cả kênh” hoặc “Online” để xem tỷ lệ huỷ đơn online.
          </div>
        )}
      </section>
    </div>
  )
}

function EmptyChart() {
  return <p className="py-16 text-center text-sm text-muted-foreground">Không có doanh thu trong kỳ này.</p>
}
