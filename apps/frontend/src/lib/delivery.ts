/**
 * Delivery is done by the store's own staff, so there is no platform fee to account for — the
 * riders are on the payroll like every other employee. All that is left is how long a trip takes.
 */

/** Packing before a rider leaves, minutes. */
const PREP_MINUTES = 8
/** City riding speed, minutes per km. */
const MINUTES_PER_KM = 4
/** What the storefront promises for a nearby order. */
export const PROMISED_MINUTES = 24

/** Delivery time for a trip, never quicker than the promised 24 phút. */
export function deliveryMinutes(distanceKm: number | undefined): number {
  if (distanceKm === undefined) return PROMISED_MINUTES
  return Math.max(PROMISED_MINUTES, Math.round(PREP_MINUTES + distanceKm * MINUTES_PER_KM))
}
