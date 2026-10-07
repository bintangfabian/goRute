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

/** Arrival and travel times this close count as the same: the timetable is headway-based, so minutes are estimates. */
const SAME_TIME_MAX_SEC = 5 * 60
/** Shorter trips get a tighter margin: a fraction of the shorter one's travel time. */
const SAME_TIME_SHARE = 0.1
/** Walks this close count as the same: walking is straight-line distance times 1.3. */
export const SAME_WALK_M = 200

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

/**
 * Like `dominates`, but differences too small to matter count as ties: `b` is
 * a near copy of `a` when it is at most a few minutes faster and a short walk
 * lighter, and `a` is cheaper, has fewer transfers, or is clearly ahead on time
 * or walking. Riders read such pairs as the same trip twice.
 */
export function outshines(a: Trip, b: Trip): boolean {
  if (!a.fare.complete) return false
  const slackMs = Math.min(SAME_TIME_MAX_SEC, SAME_TIME_SHARE * Math.min(a.durationSec, b.durationSec)) * 1000
  const arrival = Date.parse(b.end) - Date.parse(a.end)
  const travel = (b.durationSec - a.durationSec) * 1000
  const walk = b.walkDistanceM - a.walkDistanceM
  const fare = b.fare.totalIdr - a.fare.totalIdr
  const transfers = b.transfers - a.transfers
  const noWorse = arrival >= -slackMs && travel >= -slackMs && walk >= -SAME_WALK_M && fare >= 0 && transfers >= 0
  const clearlyBetter = arrival > slackMs || travel > slackMs || walk > SAME_WALK_M || fare > 0 || transfers > 0
  return noWorse && clearlyBetter
}

/**
 * Drops every option another kept one dominates or outshines. Kept options are
 * checked against each newcomer and the other way round, so the result never
 * holds a pair where one beats the other, and it is never empty.
 */
export function keepDistinct<T extends Trip>(trips: T[]): T[] {
  const beats = (a: T, b: T) => dominates(a, b) || outshines(a, b)
  const kept: T[] = []
  for (const trip of trips) {
    if (kept.some((k) => beats(k, trip))) continue
    for (let i = kept.length - 1; i >= 0; i--) if (beats(trip, kept[i])) kept.splice(i, 1)
    kept.push(trip)
  }
  return kept
}
