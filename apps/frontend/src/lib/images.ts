/**
 * Product/category images are stored as their source URL. The 7-Eleven image
 * CDN crops and converts to WebP on the fly, so we ask for exactly the size we
 * render (2x for retina).
 */
const CDN = "https://image-cdn.7-eleven.vn/crop"

export function imageUrl(src: string | undefined, cssSize: number): string {
  if (!src) return ""
  if (!src.startsWith("https://cdn.7-eleven.vn/")) return src
  const px = Math.min(Math.round(cssSize * 2), 800)
  return `${CDN}?type=webp&width=${px}&height=${px}&url=${encodeURIComponent(src)}`
}
