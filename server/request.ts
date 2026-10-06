import type { Place } from '../shared/api.ts'
import { inServiceArea } from '../shared/region.ts'
import type { PlanRequest } from './planner/plan.ts'

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i

/** Reads /api/v1/plan query parameters; errors are user-facing (Indonesian). */
export function parsePlanRequest(q: URLSearchParams, now: Date): PlanRequest | { error: string } {
  const from = parseEndpoint(q, 'from', 'Lokasi awal')
  if ('error' in from) return from
  const to = parseEndpoint(q, 'to', 'Tujuan')
  if ('error' in to) return to

  let departure = now
  const time = q.get('time')
  if (time) {
    departure = new Date(time)
    if (!RFC3339.test(time) || Number.isNaN(departure.getTime())) {
      return { error: 'Parameter time harus berformat RFC 3339.' }
    }
  }
  return { from, to, departure }
}

function parseEndpoint(q: URLSearchParams, prefix: string, label: string): Place | { error: string } {
  const lat = parseNumber(q.get(`${prefix}Lat`))
  const lon = parseNumber(q.get(`${prefix}Lon`))
  if (lat === null || lon === null) {
    return { error: `Parameter ${prefix}Lat dan ${prefix}Lon wajib berupa angka.` }
  }
  if (!inServiceArea(lat, lon)) {
    return { error: `${label} berada di luar area Jabodetabek.` }
  }
  return { name: q.get(`${prefix}Name`) || label, lat, lon }
}

function parseNumber(v: string | null): number | null {
  if (v === null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
