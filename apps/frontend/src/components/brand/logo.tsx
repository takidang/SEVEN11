import Image from "next/image"

import logoMark from "@/assets/brand/logo-mark.png"
import logoWordmark from "@/assets/brand/logo-wordmark.png"
import { cn } from "@/lib/utils"

/*
 * Logo designed for this project (transparent PNGs in src/assets/brand, cut from the team's
 * artwork). Inspired by 7-Eleven — not the official logo.
 */

/** Square app mark: the "7" with a cart on brand green. Size it with a size-* class. */
export function LogoMark({ className, title = "7-Eleven" }: { className?: string; title?: string }) {
  return (
    <Image
      src={logoMark}
      alt={title}
      width={48}
      height={48}
      loading="eager"
      draggable={false}
      className={cn("size-9 shrink-0 select-none", className)}
    />
  )
}

/** "7-ELEVEN" logotype. Its height follows the font size, so scale it with a text-size class. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 leading-none select-none", className)}>
      <Image
        src={logoWordmark}
        alt="7-Eleven"
        width={256}
        height={Math.round((256 * logoWordmark.height) / logoWordmark.width)}
        loading="eager"
        draggable={false}
        className="h-[1em] w-auto max-w-none"
      />
    </span>
  )
}

export function Logo({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col">
        <Wordmark className="text-[22px]" />
        {subtitle ? (
          <span className="mt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  )
}
