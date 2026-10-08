import type { Place } from '../shared/api.ts'
import { inServiceArea } from '../shared/region.ts'
import type { PlanRequest } from './planner/plan.ts'

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i
/** Trips are planned from a day back to a week and a day ahead: the app offers today, tomorrow and the next day with service. */
const PAST_MS = 24 * 3600_000
const AHEAD_MS = 8 * 24 * 3600_000
/** Names are echoed back with the plan; no place name is longer. */
const MAX_NAME = 120

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
    const parts = RFC3339.exec(time)
    if (!parts || Number.isNaN(departure.getTime()) || !realDate(Number(parts[1]), Number(parts[2]), Number(parts[3]), Number(parts[4]), Number(parts[5]))) {
      return { error: 'Parameter time harus berformat RFC 3339.' }
    }
    if (departure.getTime() < now.getTime() - PAST_MS || departure.getTime() > now.getTime() + AHEAD_MS) {
      return { error: 'Waktu berangkat hanya bisa dari kemarin sampai seminggu ke depan.' }
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
  return { name: (q.get(`${prefix}Name`) || label).slice(0, MAX_NAME), lat, lon }
}

/** Whether the date and time exist: Date would quietly turn 30 February into 2 March. */
function realDate(year: number, month: number, day: number, hour: number, minute: number): boolean {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return month >= 1 && month <= 12 && day >= 1 && day <= days && hour <= 23 && minute <= 59
}

function parseNumber(v: string | null): number | null {
  if (v === null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
