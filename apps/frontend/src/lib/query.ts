"use client"

/**
 * Update some query params in place (no navigation, no scroll jump). Next.js syncs
 * `useSearchParams()` with `history.replaceState`, so pages can keep the URL as the
 * source of truth for tabs, filters and the open detail sheet.
 */
export function replaceQuery(patch: Record<string, string | null | undefined>) {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") params.delete(key)
    else params.set(key, value)
  }
  const query = params.toString()
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`)
}
