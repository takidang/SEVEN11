import type { Store } from "@/types"

/** A point on the map. Delivery addresses only have one after the shopper shares their location. */
export interface LatLng {
  lat: number
  lng: number
}

/**
 * How far an order can be delivered. The storefront promises 24 phút: about 8 minutes to pack
 * plus 16 minutes of riding at roughly 20 km/h in city traffic. Convenience-store chains here
 * deliver within 3–5 km for the same reason.
 */
export const DELIVERY_RADIUS_KM = 5

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Straight-line distance in km (haversine). Good enough to rank nearby stores. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** "850 m" under a kilometre, "1,2 km" above it. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(km)} km`
}

/** Open stores sorted by distance from `from` (nearest first). */
export function storesByDistance<T extends Store>(list: T[], from: LatLng): (T & { distanceKm: number })[] {
  return list
    .map((store) => ({ ...store, distanceKm: distanceKm(from, store) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

/** Reads the browser location once. Resolves to null when the shopper says no or it is unavailable. */
export function requestLocation(): Promise<LatLng | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      // Always measure again: the shopper may have moved since the last reading.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  })
}
