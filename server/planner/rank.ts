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
