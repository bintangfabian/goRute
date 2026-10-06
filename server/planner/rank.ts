import type { Itinerary, Plan } from '../../shared/api.ts'

type Compare = (a: Itinerary, b: Itinerary) => number

export function rank(its: Itinerary[]): Plan['ranking'] {
  return {
    tercepat: order(its, compareFastest),
    termurah: order(its, compareCheapest),
    termudah: order(its, compareEasiest),
  }
}

// Array.prototype.sort is stable, so ties keep the search order.
const order = (its: Itinerary[], compare: Compare) => its.toSorted(compare).map((it) => it.id)

const byArrival: Compare = (a, b) => Date.parse(a.end) - Date.parse(b.end)

/** Earliest arrival first. */
export const compareFastest: Compare = (a, b) => byArrival(a, b) || a.transfers - b.transfers

/** Lowest known fare first; trips with unknown fares go last because their total is only a lower bound. */
export const compareCheapest: Compare = (a, b) =>
  Number(!a.fare.complete) - Number(!b.fare.complete) || a.fare.totalIdr - b.fare.totalIdr || byArrival(a, b)

/** Fewest transfers, then least walking. */
export const compareEasiest: Compare = (a, b) =>
  a.transfers - b.transfers || a.walkDistanceM - b.walkDistanceM || byArrival(a, b)

type Trip = Omit<Itinerary, 'id'>

/**
 * True when `a` is no worse than `b` on arrival, travel time, fare,
 * transfers, and walking, and better on at least one: then `b` is not worth
 * showing, whichever preference the rider picks.
 */
export function dominates(a: Trip, b: Trip): boolean {
  // An incomplete fare is only a lower bound, so it never proves `a` cheaper.
  if (!a.fare.complete) return false
  const gains = [
    Date.parse(b.end) - Date.parse(a.end),
    b.durationSec - a.durationSec,
    b.fare.totalIdr - a.fare.totalIdr,
    b.transfers - a.transfers,
    b.walkDistanceM - a.walkDistanceM,
  ]
  return gains.every((g) => g >= 0) && gains.some((g) => g > 0)
}
