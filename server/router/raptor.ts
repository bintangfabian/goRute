// Round-based public transit routing (RAPTOR, Delling et al. 2012).
// Round k finds the earliest arrival at every stop using at most k rides,
// so the journeys it returns form a Pareto set: each extra ride is only
// reported if it gets you there earlier.

import type { Pattern, Timetable } from '../timetable/timetable.ts'

const INF = 0x7fffffff

/** Seconds needed to get from one vehicle to the next. */
export const TRANSFER_SLACK = 60

export type StopWalk = { stop: number; meters: number; sec: number }

export type ServiceDay = {
  /** Added to this day's times to place them on the query day's clock. */
  offset: number
  /** Running services, indexed by service. */
  active: Uint8Array
}

export type RaptorRequest = {
  /** Seconds after midnight of the query day. */
  departure: number
  /** Service days whose trips can be taken, typically yesterday, today, and tomorrow. */
  days: ServiceDay[]
  access: StopWalk[]
  egress: StopWalk[]
  maxRides: number
  maxTransferM: number
  bannedRoutes?: ReadonlySet<number>
}

export type RideLeg = {
  kind: 'ride'
  pattern: number
  trip: number
  /** Service day offset of the trip, see ServiceDay. */
  offset: number
  /** Positions in the pattern. */
  board: number
  alight: number
}

export type WalkLeg = {
  kind: 'access' | 'transfer' | 'egress'
  /** Stop index, or -1 for the origin. */
  from: number
  /** Stop index, or -1 for the destination. */
  to: number
  meters: number
  sec: number
}

export type Journey = { arrival: number; legs: (RideLeg | WalkLeg)[] }

const ACCESS = 1
const RIDE = 2
const WALK = 3

type Round = ReturnType<typeof newRound>

function newRound(n: number) {
  return {
    rideArr: new Int32Array(n).fill(INF),
    ridePattern: new Int32Array(n),
    rideTrip: new Int32Array(n),
    rideOffset: new Int32Array(n),
    rideBoard: new Int32Array(n),
    rideAlight: new Int32Array(n),
    walkArr: new Int32Array(n).fill(INF),
    walkFrom: new Int32Array(n),
    walkMeters: new Int32Array(n),
    walkSec: new Int32Array(n),
    /** Earliest arrival with at most this many rides, and the round and kind of that label. */
    best: new Int32Array(n).fill(INF),
    bestRound: new Int8Array(n),
    bestKind: new Uint8Array(n),
  }
}

export function raptor(tt: Timetable, req: RaptorRequest): Journey[] {
  const n = tt.stopCount
  const bestAny = new Int32Array(n).fill(INF)
  const isMarked = new Uint8Array(n)
  let marked: number[] = []
  const mark = (s: number) => {
    if (!isMarked[s]) {
      isMarked[s] = 1
      marked.push(s)
    }
  }

  const first = newRound(n)
  for (const a of req.access) {
    const t = req.departure + a.sec
    if (t < first.best[a.stop]) {
      first.best[a.stop] = bestAny[a.stop] = t
      first.bestKind[a.stop] = ACCESS
      first.walkMeters[a.stop] = a.meters
      first.walkSec[a.stop] = a.sec
      mark(a.stop)
    }
  }
  const rounds: Round[] = [first]

  // Bit d is set when the pattern has trips on req.days[d].
  const runsOn = Uint8Array.from(tt.patterns, (p) =>
    req.days.reduce((bits, day, d) => (p.services.some((s) => day.active[s]) ? bits | (1 << d) : bits), 0),
  )
  const queueFrom = new Int32Array(tt.patterns.length).fill(INF)
  const rode = new Uint8Array(n)

  const journeys: Journey[] = []
  let target = INF

  for (let k = 1; k <= req.maxRides && marked.length > 0; k++) {
    const prev = rounds[k - 1]
    const cur = newRound(n)
    cur.best.set(prev.best)
    cur.bestRound.set(prev.bestRound)
    cur.bestKind.set(prev.bestKind)
    rounds.push(cur)

    // Scan each pattern that serves a stop improved last round, starting
    // from the first such stop along the pattern.
    const queue: number[] = []
    for (const s of marked) {
      const serving = tt.stopPatterns[s]
      for (let j = 0; j < serving.length; j += 2) {
        const p = serving[j]
        if (!runsOn[p] || req.bannedRoutes?.has(tt.patterns[p].route)) continue
        if (queueFrom[p] === INF) queue.push(p)
        queueFrom[p] = Math.min(queueFrom[p], serving[j + 1])
      }
      isMarked[s] = 0
    }
    marked = []
    const rodeTo: number[] = []

    for (const p of queue) {
      const pat = tt.patterns[p]
      const last = pat.stops.length - 1
      let trip = -1
      let offset = 0
      let tripStart = 0
      let board = -1

      for (let i = queueFrom[p]; i <= last; i++) {
        const s = pat.stops[i]
        if (trip >= 0) {
          const arr = tripStart + pat.arr[i]
          if (arr < bestAny[s] && arr < target) {
            cur.rideArr[s] = bestAny[s] = arr
            cur.ridePattern[s] = p
            cur.rideTrip[s] = trip
            cur.rideOffset[s] = offset
            cur.rideBoard[s] = board
            cur.rideAlight[s] = i
            mark(s)
            if (!rode[s]) {
              rode[s] = 1
              rodeTo.push(s)
            }
          }
        }

        // Can we catch this trip, or an earlier one, here?
        const ready = prev.best[s]
        if (ready === INF || i === last) continue
        const readyAt = ready + (prev.bestKind[s] === ACCESS ? 0 : TRANSFER_SLACK)
        if (trip >= 0 && readyAt >= tripStart + pat.dep[i]) continue
        const found = earliestTrip(pat, i, readyAt, req.days, runsOn[p])
        if (found && (trip < 0 || found.start < tripStart)) {
          trip = found.trip
          offset = found.offset
          tripStart = found.start
          board = i
        }
      }
      queueFrom[p] = INF
    }

    // Walking transfers, only from stops reached by a ride this round, so
    // a journey never walks twice in a row.
    for (const s of rodeTo) {
      rode[s] = 0
      const t0 = cur.rideArr[s]
      const transfers = tt.transfers[s]
      for (let j = 0; j < transfers.length; j += 3) {
        const meters = transfers[j + 1]
        if (meters > req.maxTransferM) continue
        const q = transfers[j]
        const t = t0 + transfers[j + 2]
        if (t < bestAny[q] && t < target) {
          cur.walkArr[q] = bestAny[q] = t
          cur.walkFrom[q] = s
          cur.walkMeters[q] = meters
          cur.walkSec[q] = transfers[j + 2]
          mark(q)
        }
      }
    }

    for (const s of marked) {
      const ride = cur.rideArr[s]
      const walk = cur.walkArr[s]
      if (Math.min(ride, walk) < cur.best[s]) {
        cur.best[s] = Math.min(ride, walk)
        cur.bestRound[s] = k
        cur.bestKind[s] = walk < ride ? WALK : RIDE
      }
    }

    let arrival = INF
    let end: StopWalk | null = null
    let endKind = RIDE
    for (const e of req.egress) {
      for (const [kind, at] of [
        [RIDE, cur.rideArr[e.stop]],
        [WALK, cur.walkArr[e.stop]],
      ]) {
        if (at < INF && at + e.sec < arrival) {
          arrival = at + e.sec
          end = e
          endKind = kind
        }
      }
    }
    if (end && arrival < target) {
      target = arrival
      journeys.push({ arrival, legs: reconstruct(tt, rounds, k, end, endKind) })
    }
  }
  return journeys
}

function earliestTrip(pat: Pattern, pos: number, readyAt: number, days: ServiceDay[], runsOn: number) {
  let best: { trip: number; offset: number; start: number } | null = null
  for (let d = 0; d < days.length; d++) {
    if (!(runsOn & (1 << d))) continue
    const { offset, active } = days[d]
    for (let t = lowerBound(pat.starts, readyAt - pat.dep[pos] - offset); t < pat.starts.length; t++) {
      if (!active[pat.service[t]]) continue
      const start = pat.starts[t] + offset
      if (!best || start < best.start) best = { trip: t, offset, start }
      break
    }
  }
  return best
}

/** First index whose value is >= x. */
function lowerBound(a: Int32Array, x: number): number {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (a[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

function reconstruct(tt: Timetable, rounds: Round[], k: number, end: StopWalk, endKind: number) {
  const legs: (RideLeg | WalkLeg)[] = [{ kind: 'egress', from: end.stop, to: -1, meters: end.meters, sec: end.sec }]
  let r = k
  let s = end.stop
  let kind = endKind
  for (;;) {
    const round = rounds[r]
    if (kind === ACCESS) {
      legs.push({ kind: 'access', from: -1, to: s, meters: rounds[0].walkMeters[s], sec: rounds[0].walkSec[s] })
      break
    }
    if (kind === WALK) {
      const from = round.walkFrom[s]
      legs.push({ kind: 'transfer', from, to: s, meters: round.walkMeters[s], sec: round.walkSec[s] })
      s = from
      kind = RIDE
      continue
    }
    const pattern = round.ridePattern[s]
    const board = round.rideBoard[s]
    legs.push({
      kind: 'ride',
      pattern,
      trip: round.rideTrip[s],
      offset: round.rideOffset[s],
      board,
      alight: round.rideAlight[s],
    })
    s = tt.patterns[pattern].stops[board]
    const before = rounds[r - 1]
    kind = before.bestKind[s]
    r = before.bestRound[s]
  }
  return legs.reverse()
}
