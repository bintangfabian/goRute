import { distanceM } from '../geo.ts'

// Walking speed, and the straight-line estimate used where there are no paths
// to follow: test networks, and trip ends far from every mapped path. A detour
// factor turns the straight line into a typical street distance.

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
