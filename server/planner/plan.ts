// Turns router journeys into priced, ranked trip options.

import type { Itinerary, Leg, Place, Plan } from '../../shared/api.ts'
import { quoteFares } from '../fare.ts'
import { lineLengthM, type LonLat } from '../geo.ts'
import { raptor, type Journey, type ServiceDay, type StopWalk } from '../router/raptor.ts'
import { addDays, wibDay } from '../time.ts'
import type { Pattern, Timetable } from '../timetable/timetable.ts'
import { walkMeters, walkSeconds } from '../walk.ts'
import { rank } from './rank.ts'

export type PlanRequest = { from: Place; to: Place; departure: Date }

type Search = { maxWalkM: number; maxTransferM: number; maxRides: number }

const DEFAULT_SEARCH: Search = { maxWalkM: 1200, maxTransferM: 500, maxRides: 5 }
/** Surfaces options with fewer transfers and shorter walks that the default search prunes as slower. */
const EASY_SEARCH: Search = { maxWalkM: 600, maxTransferM: 200, maxRides: 3 }
/** Walking radius used when no stop is within DEFAULT_SEARCH.maxWalkM of an endpoint. */
const FAR_WALK_M = 2500
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

export function planTrip(tt: Timetable, req: PlanRequest): Plan {
  const day = wibDay(req.departure.getTime())
  const departure = Math.floor((req.departure.getTime() - day.midnightMs) / 1000)
  // Yesterday's late trips and tomorrow's early ones are in reach around midnight.
  const days: ServiceDay[] = [-1, 0, 1].map((delta) => {
    const d = addDays(day, delta)
    return { offset: delta * 86_400, active: tt.activeServices(d.ymd, d.weekday) }
  })

  const search = (s: Search, bannedRoutes?: Set<number>) =>
    raptor(tt, {
      departure,
      days,
      access: nearby(tt, req.from, s),
      egress: nearby(tt, req.to, s),
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

  const options = dedupe(found.map((j) => toOption(tt, j, req, day.midnightMs)))
  const walk = walkOnly(req, departure, day.midnightMs)
  if (walk) options.push(walk)

  const leaveMs = req.departure.getTime()
  const fastestMs = Math.min(...options.map((o) => Date.parse(o.itinerary.end) - leaveMs))
  const limitMs = leaveMs + fastestMs * MAX_SLOWDOWN + SLOWDOWN_SLACK_SEC * 1000
  const itineraries = options
    .filter((o) => Date.parse(o.itinerary.end) <= limitMs)
    .map((o, i): Itinerary => ({ ...o.itinerary, id: `r${i + 1}` }))
  return { itineraries, ranking: rank(itineraries) }
}

function nearby(tt: Timetable, p: Place, s: Search): StopWalk[] {
  const stops = tt.stopsNear(p.lat, p.lon, s.maxWalkM)
  return stops.length > 0 || s !== DEFAULT_SEARCH ? stops : tt.stopsNear(p.lat, p.lon, FAR_WALK_M)
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

function toOption(tt: Timetable, journey: Journey, req: PlanRequest, midnightMs: number): Option {
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
    const prev = legs.at(-1)
    if (prev?.mode === 'WALK') {
      // A transfer walk followed by the walk to the destination reads as one walk.
      prev.to = to
      prev.durationSec += l.sec
      prev.distanceM += l.meters
      prev.end = at(clock + l.sec)
      prev.geometry.push([to.lon, to.lat])
    } else {
      legs.push({
        mode: 'WALK',
        start: at(clock),
        end: at(clock + l.sec),
        durationSec: l.sec,
        distanceM: l.meters,
        from,
        to,
        route: null,
        fareIdr: null,
        geometry: [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ],
      })
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

function walkOnly(req: PlanRequest, departure: number, midnightMs: number): Option | null {
  const meters = walkMeters(req.from.lat, req.from.lon, req.to.lat, req.to.lon)
  const sec = walkSeconds(meters)
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
          geometry: [
            [req.from.lon, req.from.lat],
            [req.to.lon, req.to.lat],
          ],
        },
      ],
    },
  }
}
