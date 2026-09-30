/**
 * Company figures for the demo chain. A convenience-store chain is a company, not just a till:
 * it has share capital and a monthly operating budget. These numbers are the group's assumptions
 * for a 10-store chain, sized from public Vietnamese retail benchmarks — they are NOT real
 * 7-Eleven figures.
 */
export interface BudgetLine {
  id: string
  label: string
  /** How much may be spent each month, whole chain. */
  monthly: number
  /** Where the actual spend comes from. */
  source: "purchase-orders" | "fixed"
  note: string
}

export const company = {
  name: "Công ty Cổ phần 7-Eleven Việt Nam",
  /**
   * Vốn điều lệ. It is not cash sitting in a safe: it turns into fixed assets, into the goods on
   * the shelves, and whatever is left stays as cash — those three always add back up to this.
   */
  charterCapital: 50_000_000_000,
  /** Mặt bằng (đặt cọc, sửa chữa), tủ mát, kệ, máy POS của 10 cửa hàng — khoảng 3 tỷ mỗi cửa hàng. */
  fixedAssets: 30_000_000_000,
}

/** Định mức chi mỗi cửa hàng mỗi tháng (dùng để suy ra số đã chi khi chưa có phân hệ chi phí). */
export const perStoreMonthly = {
  /** 1 quản lý 15 triệu + 3 thu ngân 7,5 triệu. */
  payroll: 37_500_000,
  rent: 20_000_000,
  /** Tủ mát, tủ đông và điều hoà chạy 24/7. */
  utilities: 12_000_000,
}

/** Lương khối văn phòng (giám đốc chuỗi, kế toán, thu mua). */
export const headOfficeMonthlyPayroll = 60_000_000

export const budgetLines: BudgetLine[] = [
  {
    id: "purchasing",
    label: "Nhập hàng",
    monthly: 2_900_000_000,
    source: "purchase-orders",
    note: "Tiền trả nhà cung cấp, lấy từ các phiếu nhập trong tháng",
  },
  {
    id: "payroll",
    label: "Lương nhân viên",
    monthly: 480_000_000,
    source: "fixed",
    note: "41 nhân viên cửa hàng và khối văn phòng",
  },
  { id: "rent", label: "Thuê mặt bằng", monthly: 220_000_000, source: "fixed", note: "10 cửa hàng" },
  { id: "utilities", label: "Điện nước", monthly: 130_000_000, source: "fixed", note: "Tủ mát và điều hoà 24/7" },
  {
    id: "marketing",
    label: "Marketing & khuyến mãi",
    monthly: 60_000_000,
    source: "fixed",
    note: "Quảng cáo, thẻ thành viên, voucher",
  },
]
