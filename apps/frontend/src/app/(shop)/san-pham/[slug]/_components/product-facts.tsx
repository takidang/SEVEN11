import Link from "next/link"

import type { Category, Product } from "@/types"

function shelfLifeLabel(days: number) {
  if (days <= 1) return "Trong ngày (hàng tươi nhập mỗi sáng)"
  return `${days} ngày kể từ ngày nhập hàng`
}

/** "Thông tin sản phẩm" — the spec sheet from the real product page. */
export function ProductFacts({
  product,
  category,
  subName,
  subSlug,
}: {
  product: Product
  category?: Category
  subName?: string
  subSlug?: string
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Mã vạch", value: <span className="font-mono tracking-wide">{product.barcode}</span> },
    { label: "SKU", value: <span className="font-mono">{product.sku}</span> },
    { label: "Thương hiệu", value: product.brand },
    { label: "Xuất xứ", value: product.origin },
    { label: "Đơn vị", value: product.unit },
  ]
  if (product.shelfLifeDays) rows.push({ label: "Hạn dùng", value: shelfLifeLabel(product.shelfLifeDays) })
  if (category) {
    rows.push({
      label: "Danh mục",
      value: (
        <span>
          <Link href={`/danh-muc/${category.slug}`} className="text-brand hover:underline">
            {category.name}
          </Link>
          {subName && subSlug ? (
            <>
              {" / "}
              <Link href={`/danh-muc/${category.slug}?nhom=${subSlug}`} className="text-brand hover:underline">
                {subName}
              </Link>
            </>
          ) : null}
        </span>
      ),
    })
  }

  return (
    <section>
      <h2 className="mb-2 text-base font-bold text-foreground">Thông tin sản phẩm</h2>
      <dl className="divide-y rounded-xl text-sm ring-1 ring-border">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
