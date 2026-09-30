"use client"

import { PackageIcon } from "lucide-react"
import { useState } from "react"

import { imageUrl } from "@/lib/images"
import { cn } from "@/lib/utils"

/**
 * Product photo from the image CDN, sized for how big it renders, with a quiet
 * placeholder when the image can't load.
 */
export function ProductImage({
  src,
  alt,
  size,
  className,
  priority = false,
}: {
  src?: string
  alt: string
  /** Rendered CSS size in px (the CDN serves 2x). */
  size: number
  className?: string
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        className={cn("flex items-center justify-center bg-muted text-muted-foreground/60", className)}
        aria-label={alt}
      >
        <PackageIcon className="size-1/3 max-h-10 max-w-10" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- the image CDN already resizes/converts to WebP
    <img
      src={imageUrl(src, size)}
      alt={alt}
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("object-contain", className)}
    />
  )
}
