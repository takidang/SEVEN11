import type { LatLng } from "./geo"

/**
 * Turns coordinates into a Vietnamese address (reverse geocoding). The shopper types the address
 * by hand, so this is a convenience: when every provider fails we keep what they typed and only
 * store the coordinates.
 *
 * Two free providers are tried in order — they are the only outside services the app calls, and
 * both allow light browser use like this (one call per button press). A real product would use a
 * paid maps API, or have the backend call and cache it.
 */

export interface LookedUpAddress {
  /** House number + street, e.g. "75/20/11 Huỳnh Văn Cù". */
  line: string
  /** Ward / commune, e.g. "Phường Thủ Dầu Một". */
  ward: string
  /** Province as the provider words it, e.g. "Thành phố Hồ Chí Minh". */
  province: string
  /** Which provider answered — shown in the console to make a failure easy to diagnose. */
  source: string
}

/** Providers return whichever of these fits the place; try them in order of precision. */
function pick(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

const joinLine = (house: string, street: string) => (street ? `${house} ${street}`.trim() : "")

/** Matches the provider's province wording to the names used in the app. */
export function matchProvince(name: string, known: string[]): string | null {
  const plain = name.toLowerCase()
  return known.find((p) => plain.includes(p.replace(/^TP\s+/i, "").toLowerCase())) ?? null
}

async function fromNominatim(point: LatLng): Promise<LookedUpAddress | null> {
  const query = new URLSearchParams({
    format: "jsonv2",
    lat: String(point.lat),
    lon: String(point.lng),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "vi",
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`)
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data = (await res.json()) as { address?: Record<string, unknown> }
  if (!data.address) return null
  const a = data.address
  return {
    line: joinLine(pick(a, ["house_number"]), pick(a, ["road", "pedestrian", "residential", "neighbourhood"])),
    ward: pick(a, ["quarter", "suburb", "village", "town", "city_district"]),
    province: pick(a, ["city", "state", "province"]),
    source: "OpenStreetMap",
  }
}

async function fromPhoton(point: LatLng): Promise<LookedUpAddress | null> {
  const query = new URLSearchParams({ lat: String(point.lat), lon: String(point.lng), lang: "default" })
  const res = await fetch(`https://photon.komoot.io/reverse?${query}`)
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const data = (await res.json()) as { features?: { properties?: Record<string, unknown> }[] }
  const p = data.features?.[0]?.properties
  if (!p) return null
  return {
    line: joinLine(pick(p, ["housenumber"]), pick(p, ["street", "name"])),
    ward: pick(p, ["district", "locality", "city"]),
    province: pick(p, ["state", "county", "city"]),
    source: "Photon",
  }
}

export async function lookupAddress(point: LatLng): Promise<LookedUpAddress | null> {
  for (const provider of [fromNominatim, fromPhoton]) {
    try {
      const found = await provider(point)
      if (found?.province || found?.ward || found?.line) return found
    } catch (error) {
      // Offline, blocked or rate-limited — try the next one, and leave a trace for debugging.
      console.warn("[geocode] không đọc được địa chỉ từ một nguồn bản đồ:", error)
    }
  }
  return null
}
