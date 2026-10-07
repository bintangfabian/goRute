// Turns router journeys into priced, ranked trip options.

import type { Itinerary, Leg, Place, Plan } from '../../shared/api.ts'
import { quoteFares } from '../fare.ts'
import { lineLengthM, type LonLat } from '../geo.ts'
import { raptor, type Journey, type ServiceDay, type StopWalk, type WalkLeg } from '../router/raptor.ts'
import { addDays, wibDay, type WibDay } from '../../shared/time.ts'
import type { Pattern, Timetable } from '../timetable/timetable.ts'
import { walkMeters, walkSeconds } from '../walk/estimate.ts'
import type { Reach, Stretch } from '../walk/network.ts'
import { walkSteps } from '../walk/steps.ts'
import { SLOT, type Walking } from '../walk/walking.ts'
import { keepDistinct, rank } from './rank.ts'

export type PlanRequest = { from: Place; to: Place; departure: Date }

type Search = { maxWalkM: number; maxTransferM: number; maxRides: number }

const DEFAULT_SEARCH: Search = { maxWalkM: 1200, maxTransferM: 500, maxRides: 5 }
/** Surfaces options with fewer transfers and shorter walks that the default search prunes as slower. */
const EASY_SEARCH: Search = { maxWalkM: 600, maxTransferM: 200, maxRides: 3 }
/**
 * Walking radius used when no stop within DEFAULT_SEARCH.maxWalkM of an
 * endpoint has a bus that day: there is none, or its routes are off, like the
 * weekday-only Royaltrans S31 at Bintaro Xchange on a Saturday.
 */
const FAR_WALK_M = 2500
/** How many days ahead an empty plan looks for buses near both ends again. */
const NEXT_SERVICE_DAYS = 7
/** The default search is re-run without each route of the fastest journey, up to this many times. */
const MAX_ALTERNATIVES = 3
/** Walk-only trips longer than this are dropped: nobody asks a transit planner to walk for an hour. */
const MAX_WALK_ONLY_SEC = 20 * 60
/**
 * Options taking longer than this multiple of the fastest one's travel
 * time, plus the slack, are dropped: a free bus that arrives hours later
 * is not a real choice.
 */
const MAX_SLOWDOWN = 1.5
const SLOWDOWN_SLACK_SEC = 15 * 60
/**
 * A cheaper option may take longer still, a minute for every Rp250 it saves
 * over the fastest one (about Rp15.000 an hour): a Rp3.500 bus an hour
 * slower than a Rp20.000 Royaltrans stays, a free bus hours later does not.
 */
const RUPIAH_PER_MINUTE = 250

/**
 * Plans a trip. With `walking`, walks follow the path network (and get
 * turn-by-turn steps); without it they are straight-line estimates.
 */
export function planTrip(tt: Timetable, req: PlanRequest, walking: Walking | null = null): Plan {
  const ends: Ends = {
    walking,
    from: { place: req.from, reach: walking?.reach(req.from.lat, req.from.lon, FAR_WALK_M, SLOT.from) ?? null },
    to: { place: req.to, reach: walking?.reach(req.to.lat, req.to.lon, FAR_WALK_M, SLOT.to) ?? null },
  }
  const day = wibDay(req.departure.getTime())
  const departure = Math.floor((req.departure.getTime() - day.midnightMs) / 1000)
  // Yesterday's late trips and tomorrow's early ones are in reach around midnight.
  const days: ServiceDay[] = [-1, 0, 1].map((delta) => {
    const d = addDays(day, delta)
    return { offset: delta * 86_400, active: tt.activeServices(d.ymd, d.weekday) }
  })
  const today = days[1].active

  const search = (s: Search, bannedRoutes?: Set<number>) =>
    raptor(tt, {
      departure,
      days,
      access: nearby(tt, ends, ends.from, s, today),
      egress: nearby(tt, ends, ends.to, s, today),
      maxRides: s.maxRides,
      maxTransferM: s.maxTransferM,
      bannedRoutes,
    })

  const found = search(DEFAULT_SEARCH)
  const fastest = found.at(-1)
  found.push(...search(EASY_SEARCH))
  if (fastest) {
    const routes = new Set(fastest.legs.flatMap((l) => (l.kind === 'ride' ? [tt.patterns[l.pattern].route] : [])))
    for (const route of [...routes].slice(0, MAX_ALTERNATIVES)) {
      found.push(...search(DEFAULT_SEARCH, new Set([route])))
    }
  }
  // The router weighs arrival time and transfers, not fares, so a slower
  // trip at the regular fare never shows up next to premium buses unless
  // they are all banned at once.
  const premium = premiumRoutes(tt)
  if (found.some((j) => j.legs.some((l) => l.kind === 'ride' && premium.has(tt.patterns[l.pattern].route)))) {
    found.push(...search(DEFAULT_SEARCH, premium))
  }

  const options = dedupe(found.map((j) => toOption(tt, j, req, day.midnightMs, ends)))
  const walk = walkOnly(req, departure, day.midnightMs, ends)
  if (walk) options.push(walk)

  const trips = options.map((o) => o.itinerary)
  if (trips.length === 0) return { itineraries: [], ranking: rank([]), ...whyEmpty(tt, ends, day, today) }
  const leaveMs = req.departure.getTime()
  const soonest = trips.reduce((a, b) => (Date.parse(b.end) < Date.parse(a.end) ? b : a))
  const fastestMs = Date.parse(soonest.end) - leaveMs
  const limitMs = (it: Omit<Itinerary, 'id'>) => {
    // A fare that is only a lower bound proves no saving.
    const saved = it.fare.complete ? Math.max(0, soonest.fare.totalIdr - it.fare.totalIdr) : 0
    return leaveMs + fastestMs * MAX_SLOWDOWN + (SLOWDOWN_SLACK_SEC + (saved / RUPIAH_PER_MINUTE) * 60) * 1000
  }
  const itineraries = keepDistinct(trips.filter((it) => Date.parse(it.end) <= limitMs(it))).map(
    (it, i): Itinerary => ({ ...it, id: `r${i + 1}` }),
  )
  return { itineraries, ranking: rank(itineraries) }
}

/**
 * Routes priced above the lowest paid fare of their own feed, such as
 * Royaltrans in TransJakarta. Comparing within a feed keeps a cheaper fare
 * in another feed (an MRT ride, say) from making every regular bus premium.
 */
export function premiumRoutes(tt: Timetable): Set<number> {
  const feedOf = (id: string) => id.slice(0, id.indexOf(':'))
  const regular = new Map<string, number>()
  for (const f of tt.fares) {
    if (f.price > 0) regular.set(feedOf(f.id), Math.min(regular.get(feedOf(f.id)) ?? Infinity, f.price))
  }
  return new Set(
    tt.routes.flatMap((r, i) => (r.fare >= 0 && tt.fares[r.fare].price > (regular.get(feedOf(r.id)) ?? Infinity) ? [i] : [])),
  )
}

/**
 * Why a plan came out empty, so the rider knows whether to move a pin or pick
 * another time: no stop in reach of an end, no bus near an end that day, or no
 * trip. On a day without buses, also the next day with buses near both ends,
 * among every stop within FAR_WALK_M: the default search walks that far
 * whenever the nearer ones are off.
 */
function whyEmpty(tt: Timetable, ends: Ends, day: WibDay, today: Uint8Array): Pick<Plan, 'reason' | 'nextServiceDate'> {
  const from = nearby(tt, ends, ends.from, DEFAULT_SEARCH, today)
  const to = nearby(tt, ends, ends.to, DEFAULT_SEARCH, today)
  if (from.length === 0) return { reason: 'far-from-origin' }
  if (to.length === 0) return { reason: 'far-from-destination' }
  const runs = (stops: StopWalk[], active: Uint8Array) => stops.some((s) => tt.runsAt(s.stop, active))
  const reason = !runs(from, today) ? 'no-service-near-origin' : !runs(to, today) ? 'no-service-near-destination' : null
  if (!reason) return { reason: 'no-trip' }
  const fromFar = stopsWithin(tt, ends, ends.from, FAR_WALK_M)
  const toFar = stopsWithin(tt, ends, ends.to, FAR_WALK_M)
  for (let delta = 1; delta <= NEXT_SERVICE_DAYS; delta++) {
    const d = addDays(day, delta)
    const active = tt.activeServices(d.ymd, d.weekday)
    if (runs(fromFar, active) && runs(toFar, active)) {
      return { reason, nextServiceDate: String(d.ymd).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') }
    }
  }
  return { reason }
}

/** The trip's ends and how they walk to the haltes. */
type Ends = { walking: Walking | null; from: End; to: End }
/** A trip end, with the walks along paths from it when it is near one. */
type End = { place: Place; reach: Reach | null }

/** Stops within a walk of an end: along paths when it has them, otherwise in a straight line plus a detour. */
function stopsWithin(tt: Timetable, ends: Ends, end: End, maxWalkM: number): StopWalk[] {
  if (ends.walking && end.reach) return ends.walking.stopsWithin(end.reach, maxWalkM)
  return tt.stopsNear(end.place.lat, end.place.lon, maxWalkM)
}

/** Stops within the search's walk of an end. The default search walks further when none of them has a bus that day. */
function nearby(tt: Timetable, ends: Ends, end: End, s: Search, today: Uint8Array): StopWalk[] {
  const stops = stopsWithin(tt, ends, end, s.maxWalkM)
  if (s !== DEFAULT_SEARCH || stops.some((st) => tt.runsAt(st.stop, today))) return stops
  return stopsWithin(tt, ends, end, FAR_WALK_M)
}

/** A router walk along paths, from start to end of the leg; null when either end is off the paths. */
function walkPath(ends: Ends, l: WalkLeg): Stretch[] | null {
  const { walking } = ends
  if (!walking) return null
  if (l.kind === 'transfer') return walking.between(l.from, l.to)
  if (l.kind === 'access') {
    const stop = walking.stopSnap[l.to]
    return stop && ends.from.reach ? ends.from.reach.pathTo(stop) : null
  }
  // The end's search started at the destination, so its walk to the stop runs backwards.
  const stop = walking.stopSnap[l.from]
  const back = stop && ends.to.reach ? ends.to.reach.pathTo(stop) : null
  return back && reversed(back)
}

const reversed = (path: Stretch[]): Stretch[] => path.toReversed().map((p) => ({ ...p, from: p.to, to: p.from }))

function pathGeometry(path: Stretch[]): LonLat[] {
  return path.length === 0 ? [] : [path[0].from, ...path.map((p) => p.to)]
}

type Option = {
  itinerary: Omit<Itinerary, 'id'>
  /** Identifies the sequence of rides, ignoring departure time. */
  signature: string
}

/**
 * Keeps the earliest-arriving option for each distinct sequence of rides.
 * Searches overlap, and frequent routes repeat the same rides minutes apart.
 */
function dedupe(options: Option[]): Option[] {
  const bySignature = new Map<string, Option>()
  for (const o of options) {
    const seen = bySignature.get(o.signature)
    const a = o.itinerary
    const b = seen?.itinerary
    if (!b || Date.parse(a.end) < Date.parse(b.end) || (a.end === b.end && a.walkDistanceM < b.walkDistanceM)) {
      bySignature.set(o.signature, o)
    }
  }
  return [...bySignature.values()]
}

function toOption(tt: Timetable, journey: Journey, req: PlanRequest, midnightMs: number, ends: Ends): Option {
  const at = (sec: number) => new Date(midnightMs + sec * 1000).toISOString()
  const place = (stop: number, fallback: Place): Place =>
    stop < 0 ? fallback : { name: tt.stopName[stop], lat: tt.stopLat[stop], lon: tt.stopLon[stop] }

  // Leave just in time for the first ride so the trip starts without a wait.
  const firstRide = journey.legs.find((l) => l.kind === 'ride')!
  const firstPattern = tt.patterns[firstRide.pattern]
  const firstDeparture = firstPattern.starts[firstRide.trip] + firstRide.offset + firstPattern.dep[firstRide.board]
  let clock = firstDeparture - (journey.legs[0].kind === 'access' ? journey.legs[0].sec : 0)

  const legs: Leg[] = []
  const rides: { routeId: string; fare: number; boardMs: number; leg: Leg }[] = []
  const signature: string[] = []
  /** Each walk leg's path, to redo its steps when the next walk joins it. */
  const paths = new Map<Leg, Stretch[]>()

  for (const l of journey.legs) {
    if (l.kind === 'ride') {
      const pat = tt.patterns[l.pattern]
      const route = tt.routes[pat.route]
      const start = pat.starts[l.trip] + l.offset
      const dep = start + pat.dep[l.board]
      const arr = start + pat.arr[l.alight]
      const boardStop = pat.stops[l.board]
      const alightStop = pat.stops[l.alight]
      const geometry = rideGeometry(tt, pat, l.board, l.alight)
      const leg: Leg = {
        mode: route.mode,
        start: at(dep),
        end: at(arr),
        durationSec: arr - dep,
        distanceM: Math.round(lineLengthM(geometry)),
        from: place(boardStop, req.from),
        to: place(alightStop, req.to),
        route: {
          id: route.id,
          shortName: route.shortName,
          longName: route.longName,
          category: route.category,
          color: route.color,
          textColor: route.textColor,
          agency: route.agency,
        },
        fareIdr: null,
        geometry,
        headsign: pat.headsign,
        stops: Array.from({ length: Math.max(0, l.alight - l.board - 1) }, (_, k) => place(pat.stops[l.board + 1 + k], req.from)),
      }
      legs.push(leg)
      rides.push({ routeId: route.id, fare: route.fare, boardMs: midnightMs + dep * 1000, leg })
      signature.push(`${route.id}|${boardStop}|${alightStop}`)
      clock = arr
      continue
    }

    if (l.meters === 0) continue // origin or destination is right at the stop
    const from = place(l.from, req.from)
    const to = place(l.to, req.to)
    const path = walkPath(ends, l)
    const prev = legs.at(-1)
    if (prev?.mode === 'WALK') {
      // A transfer walk followed by the walk to the destination reads as one walk.
      prev.to = to
      prev.durationSec += l.sec
      prev.distanceM += l.meters
      prev.end = at(clock + l.sec)
      const before = paths.get(prev)
      if (before && path && ends.walking) {
        const joined = [...before, ...path]
        paths.set(prev, joined)
        prev.geometry = pathGeometry(joined)
        prev.steps = walkSteps(ends.walking.net, joined)
      } else {
        paths.delete(prev)
        delete prev.steps
        prev.geometry.push(...(path ? pathGeometry(path).slice(1) : [[to.lon, to.lat] as LonLat]))
      }
    } else {
      const leg: Leg = {
        mode: 'WALK',
        start: at(clock),
        end: at(clock + l.sec),
        durationSec: l.sec,
        distanceM: l.meters,
        from,
        to,
        route: null,
        fareIdr: null,
        geometry: path
          ? pathGeometry(path)
          : [
              [from.lon, from.lat],
              [to.lon, to.lat],
            ],
      }
      if (path && ends.walking) {
        leg.steps = walkSteps(ends.walking.net, path)
        paths.set(leg, path)
      }
      legs.push(leg)
    }
    clock += l.sec
  }

  const quote = quoteFares(
    rides.map((r) => ({ routeId: r.routeId, product: tt.fares[r.fare], boardMs: r.boardMs })),
  )
  rides.forEach((r, i) => (r.leg.fareIdr = quote.charges[i]))

  const startMs = Date.parse(legs[0].start)
  const endMs = Date.parse(legs.at(-1)!.end)
  return {
    signature: signature.join('>'),
    itinerary: {
      start: legs[0].start,
      end: legs.at(-1)!.end,
      durationSec: Math.round((endMs - startMs) / 1000),
      walkDistanceM: legs.reduce((m, l) => (l.mode === 'WALK' ? m + l.distanceM : m), 0),
      transfers: Math.max(0, rides.length - 1),
      fare: { totalIdr: quote.total, complete: quote.complete },
      legs,
    },
  }
}

/** The pattern's shape between two stops, or straight lines through its stops without one. */
function rideGeometry(tt: Timetable, pat: Pattern, board: number, alight: number): LonLat[] {
  const stop = (pos: number): LonLat => [tt.stopLon[pat.stops[pos]], tt.stopLat[pat.stops[pos]]]
  const a = pat.shapeAt[board]
  const b = pat.shapeAt[alight]
  if (pat.shape < 0 || !(b > a)) {
    const line: LonLat[] = []
    for (let pos = board; pos <= alight; pos++) line.push(stop(pos))
    return line
  }
  return [stop(board), ...tt.shape(pat.shape).slice(a, b + 1), stop(alight)]
}

function walkOnly(req: PlanRequest, departure: number, midnightMs: number, ends: Ends): Option | null {
  // Along paths when both ends are near them, otherwise in a straight line plus a detour.
  const { reach } = ends.from
  const target = ends.to.reach?.from
  const along = ends.walking && reach && target ? reach.costTo(target) : null
  const path = along && reach && target ? reach.pathTo(target) : null
  if (ends.walking && reach && target && !along) return null // farther than the search went
  const meters = along ? Math.round(along.meters) : walkMeters(req.from.lat, req.from.lon, req.to.lat, req.to.lon)
  const sec = along ? Math.round(along.sec) : walkSeconds(meters)
  if (sec > MAX_WALK_ONLY_SEC) return null
  const start = new Date(midnightMs + departure * 1000).toISOString()
  const end = new Date(midnightMs + (departure + sec) * 1000).toISOString()
  return {
    signature: 'WALK',
    itinerary: {
      start,
      end,
      durationSec: sec,
      walkDistanceM: meters,
      transfers: 0,
      fare: { totalIdr: 0, complete: true },
      legs: [
        {
          mode: 'WALK',
          start,
          end,
          durationSec: sec,
          distanceM: meters,
          from: req.from,
          to: req.to,
          route: null,
          fareIdr: null,
          geometry: path
            ? pathGeometry(path)
            : [
                [req.from.lon, req.from.lat],
                [req.to.lon, req.to.lat],
              ],
          ...(path && ends.walking ? { steps: walkSteps(ends.walking.net, path) } : {}),
        },
      ],
    },
  }
}
