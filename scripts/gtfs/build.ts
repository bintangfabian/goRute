// Compiles GTFS feeds into the compact timetable the router loads.

import { distanceM, encodePolyline, type LonLat } from '../../server/geo.ts'
import {
  TIMETABLE_VERSION,
  type FareProduct,
  type PatternRecord,
  type RouteRecord,
  type ServiceRecord,
  type TimetableFile,
} from '../../server/timetable/format.ts'
import { parseCsv, type Row } from './csv.ts'

export type FeedFiles = {
  id: string
  name: string
  /** GTFS file name (e.g. "stops.txt") → contents. */
  files: Map<string, string>
}

export function buildTimetable(feeds: FeedFiles[], builtAt: Date): { timetable: TimetableFile; warnings: string[] } {
  const b = new Builder()
  for (const feed of feeds) b.addFeed(feed)
  return {
    timetable: {
      version: TIMETABLE_VERSION,
      builtAt: builtAt.toISOString(),
      feeds: feeds.map((f) => ({ id: f.id, name: f.name })),
      stops: b.stops,
      routes: b.routes,
      fares: b.fares,
      services: b.services,
      patterns: b.finishPatterns(),
      shapes: b.shapes.map(encodePolyline),
    },
    warnings: b.warnings,
  }
}

type StopTime = { seq: number; stop: string; arr: number | null; dep: number | null }

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

class Builder {
  stops: TimetableFile['stops'] = { id: [], name: [], lat: [], lon: [] }
  routes: RouteRecord[] = []
  fares: FareProduct[] = []
  services: ServiceRecord[] = []
  shapes: LonLat[][] = []
  warnings: string[] = []
  private patterns: PatternRecord[] = []
  private stopIndex = new Map<string, number>()
  private shapeIndex = new Map<string, number>()
  private patternIndex = new Map<string, number>()

  addFeed(feed: FeedFiles) {
    const table = (name: string): Row[] => {
      const text = feed.files.get(name)
      return text ? parseCsv(text) : []
    }
    const scoped = (id: string) => `${feed.id}:${id}`
    const warn = (msg: string) => this.warnings.push(`${feed.id}: ${msg}`)

    const agencies = new Map(table('agency.txt').map((r) => [r.agency_id, r.agency_name]))
    const soleAgency = agencies.size === 1 ? [...agencies.values()][0] : ''

    const productIndex = new Map<string, number>()
    for (const r of table('fare_attributes.txt')) {
      productIndex.set(r.fare_id, this.fares.length)
      this.fares.push({
        id: scoped(r.fare_id),
        price: Math.round(Number(r.price)),
        transfers: r.transfers === '' ? -1 : Number(r.transfers),
        transferDurationSec: r.transfer_duration === '' ? 0 : Number(r.transfer_duration),
      })
    }
    const routeFare = new Map<string, number>()
    for (const r of table('fare_rules.txt')) {
      // Only route-based rules: zone-based ones need stop zones that no
      // Jabodetabek feed publishes yet.
      if (r.origin_id || r.destination_id || r.contains_id || !r.route_id) continue
      const product = productIndex.get(r.fare_id)
      if (product !== undefined) routeFare.set(r.route_id, product)
    }

    const routeIndex = new Map<string, number>()
    for (const r of table('routes.txt')) {
      routeIndex.set(r.route_id, this.routes.length)
      this.routes.push({
        id: scoped(r.route_id),
        shortName: r.route_short_name,
        longName: r.route_long_name,
        category: r.route_desc,
        color: hexColor(r.route_color),
        textColor: hexColor(r.route_text_color),
        agency: agencies.get(r.agency_id) ?? soleAgency,
        mode: modeOf(Number(r.route_type)),
        fare: routeFare.get(r.route_id) ?? -1,
      })
    }

    const serviceIndex = new Map<string, number>()
    const service = (id: string) => {
      let i = serviceIndex.get(id)
      if (i === undefined) {
        i = this.services.length
        serviceIndex.set(id, i)
        this.services.push({ id: scoped(id), days: 0, start: 0, end: 0, added: [], removed: [] })
      }
      return this.services[i]
    }
    for (const r of table('calendar.txt')) {
      const s = service(r.service_id)
      s.days = WEEKDAYS.reduce((days, day, bit) => (r[day] === '1' ? days | (1 << bit) : days), 0)
      s.start = Number(r.start_date)
      s.end = Number(r.end_date)
    }
    for (const r of table('calendar_dates.txt')) {
      const s = service(r.service_id)
      const dates = r.exception_type === '1' ? s.added : s.removed
      dates.push(Number(r.date))
    }

    const stopRows = new Map(table('stops.txt').map((r) => [r.stop_id, r]))
    const trips = new Map(table('trips.txt').map((r) => [r.trip_id, r]))

    const shapeRows = new Map<string, { seq: number; lon: number; lat: number }[]>()
    for (const r of table('shapes.txt')) {
      let points = shapeRows.get(r.shape_id)
      if (!points) shapeRows.set(r.shape_id, (points = []))
      points.push({ seq: Number(r.shape_pt_sequence), lon: Number(r.shape_pt_lon), lat: Number(r.shape_pt_lat) })
    }

    const frequencies = new Map<string, number[]>()
    for (const r of table('frequencies.txt')) {
      const start = parseTime(r.start_time)
      const end = parseTime(r.end_time)
      const headway = Number(r.headway_secs)
      if (start === null || end === null || !(headway > 0)) {
        warn(`frequencies.txt: invalid row for trip ${r.trip_id}`)
        continue
      }
      let starts = frequencies.get(r.trip_id)
      if (!starts) frequencies.set(r.trip_id, (starts = []))
      for (let t = start; t < end; t += headway) starts.push(t)
    }

    const stopTimes = new Map<string, StopTime[]>()
    for (const r of table('stop_times.txt')) {
      let list = stopTimes.get(r.trip_id)
      if (!list) stopTimes.set(r.trip_id, (list = []))
      list.push({
        seq: Number(r.stop_sequence),
        stop: r.stop_id,
        arr: parseTime(r.arrival_time),
        dep: parseTime(r.departure_time),
      })
    }

    for (const [tripId, list] of stopTimes) {
      const trip = trips.get(tripId)
      const route = trip && routeIndex.get(trip.route_id)
      const svc = trip && serviceIndex.get(trip.service_id)
      if (!trip || route === undefined || svc === undefined) {
        warn(`trip ${tripId}: unknown trip, route, or service`)
        continue
      }
      list.sort((a, b) => a.seq - b.seq)
      if (list.length < 2 || !fillTimes(list)) {
        warn(`trip ${tripId}: needs at least two stops with times`)
        continue
      }

      const stops = list.map((st) => this.stop(scoped(st.stop), stopRows.get(st.stop)))
      if (stops.includes(-1)) {
        warn(`trip ${tripId}: references a stop missing from stops.txt`)
        continue
      }
      const base = list[0].dep!
      const arr = list.map((st) => st.arr! - base)
      const dep = list.map((st) => st.dep! - base)
      const shape = trip.shape_id ? this.shape(scoped(trip.shape_id), shapeRows.get(trip.shape_id)) : -1

      const key = [route, shape, stops.join(','), arr.join(','), dep.join(',')].join('|')
      let p = this.patternIndex.get(key)
      if (p === undefined) {
        p = this.patterns.length
        this.patternIndex.set(key, p)
        this.patterns.push({
          route,
          headsign: trip.trip_headsign,
          stops,
          arr,
          dep,
          shape,
          shapeAt: [],
          starts: [],
          service: [],
        })
      }
      const pattern = this.patterns[p]
      for (const start of frequencies.get(tripId) ?? [base]) {
        pattern.starts.push(start)
        pattern.service.push(svc)
      }
    }
  }

  /** Sorts trips, drops duplicates, and snaps stops onto shapes. */
  finishPatterns(): PatternRecord[] {
    for (const p of this.patterns) {
      const trips = p.starts
        .map((start, i) => ({ start, service: p.service[i] }))
        .sort((a, b) => a.start - b.start || a.service - b.service)
        .filter((t, i, all) => i === 0 || t.start !== all[i - 1].start || t.service !== all[i - 1].service)
      p.starts = trips.map((t) => t.start)
      p.service = trips.map((t) => t.service)

      if (p.shape >= 0) {
        const at = p.stops.map((s): LonLat => [this.stops.lon[s], this.stops.lat[s]])
        p.shapeAt = snapToShape(this.shapes[p.shape], at)
      }
    }
    return this.patterns
  }

  private stop(id: string, row: Row | undefined): number {
    let i = this.stopIndex.get(id)
    if (i !== undefined) return i
    const lat = Number(row?.stop_lat)
    const lon = Number(row?.stop_lon)
    if (!row || !Number.isFinite(lat) || !Number.isFinite(lon)) return -1
    i = this.stops.id.length
    this.stopIndex.set(id, i)
    this.stops.id.push(id)
    this.stops.name.push(row.stop_name)
    this.stops.lat.push(round6(lat))
    this.stops.lon.push(round6(lon))
    return i
  }

  private shape(id: string, rows: { seq: number; lon: number; lat: number }[] | undefined): number {
    let i = this.shapeIndex.get(id)
    if (i !== undefined) return i
    if (!rows || rows.length < 2) return -1
    i = this.shapes.length
    this.shapeIndex.set(id, i)
    this.shapes.push(rows.sort((a, b) => a.seq - b.seq).map((r): LonLat => [r.lon, r.lat]))
    return i
  }
}

/**
 * Returns, for each stop in travel order, the index of the nearest shape
 * point. The search only moves forward so loop routes that pass the same
 * street twice snap to the right pass.
 */
export function snapToShape(shape: LonLat[], stops: LonLat[]): number[] {
  let from = 0
  return stops.map(([lon, lat]) => {
    let best = from
    let bestD = Infinity
    for (let j = from; j < shape.length; j++) {
      const d = distanceM(lat, lon, shape[j][1], shape[j][0])
      if (d < bestD) {
        best = j
        bestD = d
      } else if (bestD < 150 && d > bestD + 500) {
        break // passed the stop
      }
    }
    from = best
    return best
  })
}

/** Fills missing arrival/departure times; false if the trip cannot be timed. */
function fillTimes(list: StopTime[]): boolean {
  for (const st of list) {
    st.arr ??= st.dep
    st.dep ??= st.arr
  }
  let last = -1
  for (let i = 0; i < list.length; i++) {
    if (list[i].arr === null) continue
    if (last === -1 && i > 0) return false
    // Interpolate stops without times evenly between timed neighbours.
    for (let j = last + 1; j < i; j++) {
      const t = Math.round(list[last].dep! + ((list[i].arr! - list[last].dep!) * (j - last)) / (i - last))
      list[j].arr = list[j].dep = t
    }
    last = i
  }
  return last === list.length - 1
}

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

function hexColor(c: string) {
  return /^[0-9a-f]{6}$/i.test(c) ? `#${c.toUpperCase()}` : ''
}

function modeOf(routeType: number): string {
  if (routeType === 12 || routeType === 405) return 'MONORAIL'
  if (routeType === 0 || (routeType >= 900 && routeType < 1000)) return 'TRAM'
  if (routeType === 1 || (routeType >= 400 && routeType < 500)) return 'SUBWAY'
  if (routeType === 2 || (routeType >= 100 && routeType < 200)) return 'RAIL'
  if (routeType === 4 || (routeType >= 1000 && routeType < 1100) || routeType === 1200) return 'FERRY'
  return 'BUS'
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
