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

/** Earliest arrival first, then every other count the filter weighs, so only identical trips tie. */
const compareSettle = (a: Trip, b: Trip) =>
  Date.parse(a.end) - Date.parse(b.end) ||
  a.durationSec - b.durationSec ||
  a.transfers - b.transfers ||
  a.walkDistanceM - b.walkDistanceM ||
  a.fare.totalIdr - b.fare.totalIdr ||
  Number(!a.fare.complete) - Number(!b.fare.complete)

/**
 * Drops every option another kept one dominates or outshines. Beating is not
 * transitive: from Cibubur to Bundaran HI, P11 > 9D beats P11 > 9A > 6B, which
 * beats the five minutes faster P11 > 9A > 6A, but 9D does not beat 6A. So
 * options are settled in rounds: those nothing left beats stay, and whatever
 * they beat goes. The result does not depend on the order options come in, is
 * never empty, and holds no pair where one beats the other. Every option it
 * drops is beaten by one it keeps, unless options beat each other in a circle.
 */
export function keepDistinct<T extends Trip>(trips: T[]): T[] {
  const beats = (a: T, b: T) => dominates(a, b) || outshines(a, b)
  const kept = new Set<T>()
  let left = trips.toSorted(compareSettle)
  while (left.length > 0) {
    const free = left.filter((t) => !left.some((o) => beats(o, t)))
    // The margins let three or more options beat each other in a circle. The
    // earliest arrival breaks it, and the options it beats or loses to go.
    const stay = free.length > 0 ? free : [left[0]]
    for (const t of stay) kept.add(t)
    left = left.filter((t) => !kept.has(t) && !stay.some((s) => beats(s, t) || beats(t, s)))
  }
  return trips.filter((t) => kept.has(t))
}
