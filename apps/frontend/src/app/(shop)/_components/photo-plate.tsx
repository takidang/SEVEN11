import { ProductImage } from "@/components/shop/product-image"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/types"

import { CLEAN_PHOTO_IDS } from "./clean-photos"

/**
 * A photo on a round white "plate" for banner / collection art. The photo is
 * zoomed so the frames and stickers baked into catalog images fall outside the circle.
 */
export function PhotoPlate({
  src,
  alt,
  size,
  className,
  imageClassName = "scale-125",
  priority,
}: {
  src: string
  alt: string
  /** Largest rendered CSS size in px (for the image CDN). */
  size: number
  /** Size + position classes for the plate. */
  className?: string
  /** Zoom of the photo inside the plate (tall bottles need less). */
  imageClassName?: string
  priority?: boolean
}) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-white", className)}>
      <ProductImage src={src} alt={alt} size={size} priority={priority} className={cn("size-full", imageClassName)} />
    </div>
  )
}

export interface ArtPhoto {
  key: string
  src: string
  alt: string
  /** Zoom class for <PhotoPlate imageClassName>. */
  zoom: string
}

/**
 * Photos for campaign art about a set of products: clean product shots first, then
 * the round icons of their categories, then framed shots zoomed in hard.
 */
export function pickArtPhotos(pool: Product[], categories: Category[], count = 3): ArtPhoto[] {
  const clean = pool
    .filter((p) => CLEAN_PHOTO_IDS.has(p.id))
    .map((p) => ({ key: p.id, src: p.image, alt: p.name, zoom: "scale-[1.18]" }))
  const categoryIds = [...new Set(pool.map((p) => p.categoryId))]
  const icons = categoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c)
    .map((c) => ({ key: c.id, src: c.icon, alt: c.name, zoom: "scale-100" }))
  const framed = pool
    .filter((p) => !CLEAN_PHOTO_IDS.has(p.id))
    .map((p) => ({ key: p.id, src: p.image, alt: p.name, zoom: "scale-150" }))
  return [...clean, ...icons, ...framed].slice(0, count)
}
