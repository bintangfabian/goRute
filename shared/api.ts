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
  /** [lon, lat] pairs. */
  geometry: [number, number][]
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

export type PlaceResult = Place & { id: string; address: string }

export type ApiError = { error: string }
