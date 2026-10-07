// JSON shapes of the /api/v1 endpoints, shared by the Vercel Functions and
// the web app so both sides always agree.

export type Status = {
  api: 'ok'
  /** Transit feeds the router has data for, e.g. ["TransJakarta"]. */
  feeds: string[]
  /** When data/timetable.json was built (ISO 8601). */
  builtAt: string
}

export type Plan = {
  itineraries: Itinerary[]
  /** Itinerary IDs from best to worst for each preference. */
  ranking: Record<'tercepat' | 'termurah' | 'termudah', string[]>
  /**
   * Why there is no itinerary, when there is none: no stop within walking reach
   * of an end, no bus near an end on the departure's day (weekday-only routes
   * on a weekend, say), or no trip at that time.
   */
  reason?: 'far-from-origin' | 'far-from-destination' | 'no-service-near-origin' | 'no-service-near-destination' | 'no-trip'
  /** With a no-service reason: the next day buses run near both ends (YYYY-MM-DD, WIB), if within a week. */
  nextServiceDate?: string
}

export type Itinerary = {
  id: string
  start: string
  end: string
  durationSec: number
  walkDistanceM: number
  transfers: number
  fare: {
    totalIdr: number
    /** False when some ride has no fare data, so totalIdr is a lower bound. */
    complete: boolean
  }
  legs: Leg[]
}

export type Leg = {
  /** WALK, BUS, RAIL, SUBWAY, TRAM, ... */
  mode: string
  start: string
  end: string
  durationSec: number
  distanceM: number
  from: Place
  to: Place
  route: Route | null
  /** Paid when boarding this leg: 0 when an earlier ticket covers it, null for walking or unknown fares. */
  fareIdr: number | null
  /** [lon, lat] pairs; a walk follows the streets when the server has the path network. */
  geometry: [number, number][]
  /** Rides: where the bus is headed, from GTFS trip_headsign (may be empty). */
  headsign?: string
  /** Rides: the stops passed between boarding and alighting, in order. */
  stops?: Place[]
  /** Walks along the path network: turn-by-turn directions. */
  steps?: WalkStep[]
}

/** What a stretch of walk is on, so directions can say "Menyeberang" or "Naik jembatan penyeberangan". */
export type WalkWay =
  | 'road'
  | 'footway'
  | 'crossing'
  | 'footbridge'
  | 'underpass'
  | 'steps'
  | 'path'
  | 'alley'
  | 'pedestrian'
  | 'platform'

export type WalkStep = {
  /** How the step starts: depart for the first, otherwise the turn from the previous one. */
  maneuver: 'depart' | 'straight' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'uturn'
  /** Street or path name; empty for an unnamed way. */
  name: string
  way: WalkWay
  distanceM: number
  /** Compass heading where the step starts, degrees clockwise from north. */
  bearing: number
}

export type Place = { name: string; lat: number; lon: number }

export type Route = {
  id: string
  shortName: string
  longName: string
  /** Service category from GTFS route_desc, e.g. BRT, Mikrotrans, Royaltrans. */
  category: string
  /** Hex color with '#', or empty. */
  color: string
  textColor: string
  agency: string
}

export type PlaceResult = Place & {
  id: string
  /** A halte from the timetable, or a place from the place index or the geocoder. */
  kind: 'stop' | 'place'
  address: string
  /** What a place from the index is: "Stasiun", "Mal", "Jalan", ... */
  category?: string
}

export type ApiError = { error: string }
