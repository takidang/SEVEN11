import { cn } from "@/lib/utils"

/**
 * Condensed campaign headline (Roboto width axis at 75%, black, italic, uppercase).
 * Only for banners and big promotional titles.
 */
export function Headline({
  as: Tag = "p",
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3" | "p" | "span"
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag
      // Leading goes last: tailwind-merge drops a line-height that comes before a font-size class.
      className={cn("font-black uppercase italic", className, "leading-[1.02]")}
      style={{ fontStretch: "75%", letterSpacing: "-0.01em" }}
    >
      {children}
    </Tag>
  )
}
