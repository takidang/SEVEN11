"use client"

import Link from "next/link"
import { useMemo } from "react"

import { SectionHeading } from "@/components/shop/product-rail"
import { useProducts } from "@/hooks/use-catalog"
import { cn } from "@/lib/utils"
import type { Product } from "@/types"

import { PhotoPlate } from "../photo-plate"
import { ScrollRow } from "../scroll-row"

interface Collection {
  title: string
  href: string
  tint: string
  /** Clean catalog shots composed on the tile: [big, left, right]. */
  photoIds: string[]
  /** Tall bottles/cans need less zoom inside the round plate. */
  tall?: boolean
}

/** "Gợi ý cho bạn" — curated shortcuts into categories, like the collection tiles on 7-eleven.vn. */
const COLLECTIONS: Collection[] = [
  {
    title: "Trà sữa & cà phê",
    href: "/danh-muc/tra-sua",
    tint: "bg-orange-soft",
    photoIds: ["p0014", "p0010", "p0021"],
  },
  {
    title: "Món ngon nhà Bảy",
    href: "/danh-muc/mon-ngon",
    tint: "bg-brand-soft",
    photoIds: ["p0047", "p0031", "p0044"],
  },
  {
    title: "Bánh mì & toastie",
    href: "/danh-muc/cac-loai-banh",
    tint: "bg-sale-soft",
    photoIds: ["p0079", "p0070", "p0086"],
  },
  {
    title: "Snack ăn xế",
    href: "/danh-muc/do-an-vat",
    tint: "bg-red-soft",
    photoIds: ["p0114", "p0122", "p0113"],
  },
  {
    title: "Bia lạnh 24/7",
    href: "/danh-muc/do-uong-co-con?nhom=bia",
    tint: "bg-info-soft",
    photoIds: ["p0224", "p0221", "p0223"],
    tall: true,
  },
  {
    title: "Sữa & sữa chua",
    href: "/danh-muc/san-pham-tu-sua",
    tint: "bg-fresh-soft",
    photoIds: ["p0146", "p0161", "p0162"],
    tall: true,
  },
  {
    title: "Nước giải khát",
    href: "/danh-muc/do-uong-dong-chai",
    tint: "bg-orange-soft",
    photoIds: ["p0187", "p0182", "p0197"],
    tall: true,
  },
  {
    title: "Chăm sóc cá nhân",
    href: "/danh-muc/cham-soc-ca-nhan",
    tint: "bg-surface",
    photoIds: ["p0295", "p0301", "p0286"],
    tall: true,
  },
]

export function CollectionTiles() {
  const products = useProducts()
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products])

  return (
    <section>
      <SectionHeading title="Gợi ý cho bạn" />
      <ScrollRow label="Gợi ý cho bạn" arrowClassName="top-[42%] -translate-y-1/2">
        {COLLECTIONS.map((collection) => (
          <CollectionTile
            key={collection.href}
            collection={collection}
            photos={collection.photoIds.map((id) => byId.get(id)).filter((p): p is Product => !!p)}
          />
        ))}
      </ScrollRow>
    </section>
  )
}

function CollectionTile({ collection, photos }: { collection: Collection; photos: Product[] }) {
  const [big, left, right] = photos
  const zoom = collection.tall ? "scale-110" : "scale-125"
  const plate = "absolute shadow-[0_6px_16px_-8px_rgb(0_0_0_/_0.35)] ring-2 ring-white"

  return (
    <Link href={collection.href} className="group w-[38vw] max-w-[172px] shrink-0 snap-start outline-none sm:w-[172px]">
      <div
        aria-hidden
        className={cn(
          "relative aspect-square overflow-hidden rounded-xl ring-1 ring-black/5 transition group-hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
          collection.tint,
        )}
      >
        {big ? (
          <PhotoPlate
            src={big.image}
            alt=""
            size={110}
            imageClassName={zoom}
            className={cn(
              plate,
              "top-[7%] left-1/2 size-[60%] -translate-x-1/2 transition duration-300 group-hover:scale-105",
            )}
          />
        ) : null}
        {left ? (
          <PhotoPlate
            src={left.image}
            alt=""
            size={72}
            imageClassName={zoom}
            className={cn(plate, "bottom-[6%] left-[5%] size-[40%]")}
          />
        ) : null}
        {right ? (
          <PhotoPlate
            src={right.image}
            alt=""
            size={72}
            imageClassName={zoom}
            className={cn(plate, "right-[5%] bottom-[6%] size-[40%]")}
          />
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-center text-sm font-medium text-foreground group-hover:text-brand">
        {collection.title}
      </p>
    </Link>
  )
}
