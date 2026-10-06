import { distanceM } from './geo.ts'

// Walking is estimated from straight-line distance until the router has a
// street network: a detour factor turns it into a typical street distance.

/** Meters per second, about 4.5 km/h. */
export const WALK_SPEED = 1.25
/** Street distance divided by straight-line distance in a city grid. */
export const DETOUR = 1.3

export function walkMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.round(distanceM(lat1, lon1, lat2, lon2) * DETOUR)
}

export function walkSeconds(meters: number): number {
  return Math.round(meters / WALK_SPEED)
}
