import { readFileSync } from 'node:fs'
import { decodePolyline, type LonLat } from '../geo.ts'
import { DETOUR, walkMeters, walkSeconds } from '../walk.ts'
import {
  TIMETABLE_VERSION,
  type FareProduct,
  type RouteRecord,
  type ServiceRecord,
  type TimetableFile,
} from './format.ts'

/** Stops within this walking distance are linked by transfers. */
export const MAX_TRANSFER_M = 500

const CELL_DEG = 0.005 // ~550 m

export type Pattern = {
  route: number
  headsign: string
  stops: Int32Array
  arr: Int32Array
  dep: Int32Array
  shape: number
  shapeAt: Int32Array
  starts: Int32Array
  service: Uint16Array
  /** Distinct services, to skip patterns that do not run on a day. */
  services: number[]
}

export type NearbyStop = { stop: number; meters: number; sec: number }

/** The timetable with the indexes the router needs. */
export class Timetable {
  readonly builtAt: string
  readonly feeds: { id: string; name: string }[]
  readonly stopCount: number
  readonly stopName: string[]
  readonly stopLat: Float64Array
  readonly stopLon: Float64Array
  readonly routes: RouteRecord[]
  readonly fares: FareProduct[]
  readonly services: ServiceRecord[]
  readonly patterns: Pattern[]
  /** For each stop, flattened (pattern, position) pairs of the patterns serving it. */
  readonly stopPatterns: Int32Array[]
  /** For each stop, flattened (stop, meters, seconds) triples of walking transfers. */
  readonly transfers: Int32Array[]
  private readonly encodedShapes: string[]
  private readonly decodedShapes = new Map<number, LonLat[]>()
  private readonly grid = new Map<number, number[]>()

  constructor(file: TimetableFile) {
    if (file.version !== TIMETABLE_VERSION) {
      throw new Error(`timetable version ${file.version}, expected ${TIMETABLE_VERSION}; run pnpm data:build`)
    }
    this.builtAt = file.builtAt
    this.feeds = file.feeds
    this.stopCount = file.stops.id.length
    this.stopName = file.stops.name
    this.stopLat = Float64Array.from(file.stops.lat)
    this.stopLon = Float64Array.from(file.stops.lon)
    this.routes = file.routes
    this.fares = file.fares
    this.services = file.services
    this.encodedShapes = file.shapes
    this.patterns = file.patterns.map((p) => ({
      route: p.route,
      headsign: p.headsign,
      stops: Int32Array.from(p.stops),
      arr: Int32Array.from(p.arr),
      dep: Int32Array.from(p.dep),
      shape: p.shape,
      shapeAt: Int32Array.from(p.shapeAt),
      starts: Int32Array.from(p.starts),
      service: Uint16Array.from(p.service),
      services: [...new Set(p.service)],
    }))

    const serving: number[][] = Array.from({ length: this.stopCount }, () => [])
    this.patterns.forEach((p, pi) => p.stops.forEach((s, pos) => serving[s].push(pi, pos)))
    this.stopPatterns = serving.map((list) => Int32Array.from(list))

    for (let s = 0; s < this.stopCount; s++) {
      const key = cellKey(Math.floor(this.stopLat[s] / CELL_DEG), Math.floor(this.stopLon[s] / CELL_DEG))
      let cell = this.grid.get(key)
      if (!cell) this.grid.set(key, (cell = []))
      cell.push(s)
    }

    this.transfers = Array.from({ length: this.stopCount }, (_, s) => {
      const flat: number[] = []
      this.forEachNear(this.stopLat[s], this.stopLon[s], MAX_TRANSFER_M, (to, meters) => {
        if (to !== s) flat.push(to, meters, walkSeconds(meters))
      })
      return Int32Array.from(flat)
    })
  }

  /** Stops within a walking distance, nearest first. */
  stopsNear(lat: number, lon: number, maxWalkM: number): NearbyStop[] {
    const out: NearbyStop[] = []
    this.forEachNear(lat, lon, maxWalkM, (stop, meters) => out.push({ stop, meters, sec: walkSeconds(meters) }))
    return out.sort((a, b) => a.meters - b.meters)
  }

  private forEachNear(lat: number, lon: number, maxWalkM: number, fn: (stop: number, meters: number) => void) {
    const reach = maxWalkM / DETOUR // straight-line
    const dLat = reach / 111_320
    const dLon = reach / (111_320 * Math.cos((lat * Math.PI) / 180))
    for (let y = Math.floor((lat - dLat) / CELL_DEG); y <= Math.floor((lat + dLat) / CELL_DEG); y++) {
      for (let x = Math.floor((lon - dLon) / CELL_DEG); x <= Math.floor((lon + dLon) / CELL_DEG); x++) {
        for (const s of this.grid.get(cellKey(y, x)) ?? []) {
          const meters = walkMeters(lat, lon, this.stopLat[s], this.stopLon[s])
          if (meters <= maxWalkM) fn(s, meters)
        }
      }
    }
  }

  shape(i: number): LonLat[] {
    let points = this.decodedShapes.get(i)
    if (!points) this.decodedShapes.set(i, (points = decodePolyline(this.encodedShapes[i])))
    return points
  }

  /** Services running on a date, as flags indexed by service. */
  activeServices(ymd: number, weekday: number): Uint8Array {
    return Uint8Array.from(this.services, (s) => {
      if (s.added.includes(ymd)) return 1
      if (s.removed.includes(ymd)) return 0
      return ymd >= s.start && ymd <= s.end && s.days & (1 << weekday) ? 1 : 0
    })
  }
}

const cellKey = (y: number, x: number) => y * 100_000 + x

let loaded: Timetable | undefined

/** The bundled timetable, parsed once per function instance. */
export function loadTimetable(): Timetable {
  loaded ??= new Timetable(JSON.parse(readFileSync(new URL('../../data/timetable.json', import.meta.url), 'utf8')))
  return loaded
}
