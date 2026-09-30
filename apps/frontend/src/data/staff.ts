import type { Employee } from "@/types"

import { stores } from "./stores"

/**
 * Demo staff. Every store has 1 manager + 3 cashiers; one admin runs the chain.
 *
 * Demo logins (password for all: 123456):
 *   admin@7eleven.demo        Quản trị chuỗi
 *   quanly1006@7eleven.demo   Quản lý cửa hàng 1006
 *   thungan1006@7eleven.demo  Thu ngân cửa hàng 1006
 */
export const DEMO_PASSWORD = "123456"

const MANAGERS = [
  "Trần Thị Mai Anh",
  "Lê Hoàng Phúc",
  "Phạm Ngọc Hân",
  "Võ Thành Đạt",
  "Đặng Thu Trang",
  "Bùi Quốc Huy",
  "Huỳnh Gia Bảo",
  "Nguyễn Thị Lan Hương",
  "Đỗ Minh Khôi",
  "Hoàng Bích Ngọc",
]

const CASHIERS = [
  "Nguyễn Văn An",
  "Trương Mỹ Linh",
  "Phan Tuấn Kiệt",
  "Lý Ngọc Trâm",
  "Châu Minh Nhật",
  "Tạ Thanh Vy",
  "Mai Đức Thịnh",
  "Dương Khánh Linh",
  "Kiều Anh Tú",
  "Hồ Thị Yến Nhi",
  "Lâm Quang Vinh",
  "Ngô Bảo Trân",
  "Tô Hải Đăng",
  "Vương Kim Ngân",
  "Cao Thanh Tùng",
  "Đinh Thảo My",
  "La Hoàng Nam",
  "Quách Phương Thảo",
  "Trịnh Công Thành",
  "Âu Ngọc Diệp",
  "Lục Minh Tâm",
  "Nguyễn Hà My",
  "Phạm Đức Anh",
  "Trần Khánh Vân",
  "Bạch Tuệ Nhi",
  "Vũ Hoàng Long",
  "Thái Bảo Ngọc",
  "Hà Anh Quân",
  "Nghiêm Thu Hà",
  "Lưu Gia Hưng",
]

function phone(n: number) {
  return `09${String(10000000 + n * 7919).slice(-8)}`
}

export const employees: Employee[] = [
  {
    id: "em-admin",
    code: "NV0001",
    fullName: "Nguyễn Minh Quân",
    phone: "0909000001",
    email: "admin@7eleven.demo",
    role: "admin",
    storeId: null,
    status: "active",
    hiredAt: "2017-01-03",
  },
  ...stores.flatMap((store, i): Employee[] => [
    {
      id: `em-m${store.code}`,
      code: `NV${String(100 + i).padStart(4, "0")}`,
      fullName: MANAGERS[i],
      phone: phone(100 + i),
      email: `quanly${store.code}@7eleven.demo`,
      role: "manager",
      storeId: store.id,
      status: "active",
      hiredAt: store.openedAt,
    },
    ...[0, 1, 2].map((k): Employee => ({
      id: `em-c${store.code}-${k + 1}`,
      code: `NV${String(200 + i * 3 + k).padStart(4, "0")}`,
      fullName: CASHIERS[i * 3 + k],
      phone: phone(200 + i * 3 + k),
      email: k === 0 ? `thungan${store.code}@7eleven.demo` : `nv${store.code}.${k + 1}@7eleven.demo`,
      role: "cashier",
      storeId: store.id,
      status: i === 3 && k === 2 ? "on-leave" : "active",
      hiredAt: `2025-0${(k % 9) + 1}-1${k}`,
    })),
  ]),
]
