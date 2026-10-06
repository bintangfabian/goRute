// Shape of data/timetable.json, written by scripts/build-timetable.ts and
// loaded by the router. Times are seconds after midnight of the service
// day in WIB; GTFS allows values past 24:00 for trips that run overnight.

export const TIMETABLE_VERSION = 1

export type TimetableFile = {
  version: typeof TIMETABLE_VERSION
  builtAt: string
  feeds: { id: string; name: string }[]
  /** Columnar to keep the file small. */
  stops: { id: string[]; name: string[]; lat: number[]; lon: number[] }
  routes: RouteRecord[]
  fares: FareProduct[]
  services: ServiceRecord[]
  patterns: PatternRecord[]
  /** Encoded polylines (precision 5). */
  shapes: string[]
}

export type RouteRecord = {
  /** "feedId:route_id" */
  id: string
  shortName: string
  longName: string
  category: string
  /** "#rrggbb" or empty. */
  color: string
  textColor: string
  agency: string
  /** Leg mode for rides on this route: BUS, RAIL, SUBWAY, TRAM, ... */
  mode: string
  /** Index into fares, or -1 when the fare is unknown. */
  fare: number
}

/** A GTFS fare_attributes row. */
export type FareProduct = {
  id: string
  price: number
  /** Transfers allowed on one ticket; -1 means unlimited. */
  transfers: number
  /** How long the ticket stays valid for transfers; 0 means no limit. */
  transferDurationSec: number
}

export type ServiceRecord = {
  id: string
  /** Bit 0 is Monday, bit 6 is Sunday. */
  days: number
  /** Dates as YYYYMMDD numbers. */
  start: number
  end: number
  added: number[]
  removed: number[]
}

/**
 * Trips of one route that serve the same stops with the same running
 * times. Because the times are shared, trips never overtake each other and
 * the earliest trip from any stop can be found by binary search.
 */
export type PatternRecord = {
  route: number
  headsign: string
  stops: number[]
  /** Seconds from trip start to arrival / departure at each stop. */
  arr: number[]
  dep: number[]
  /** Index into shapes, or -1. */
  shape: number
  /** Index of the shape point nearest to each stop. */
  shapeAt: number[]
  /** Trip start times, ascending. */
  starts: number[]
  /** Service index of each trip. */
  service: number[]
}
