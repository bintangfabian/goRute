import type { PlaceResult } from './api/client'
import { inServiceArea } from './trip'

const KEY = 'gorute:recent'
const MAX = 5

/** Places the rider took from the suggestions, newest first. They stay on this device only. */
export function recentPlaces(): PlaceResult[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter(isPlace).slice(0, MAX) : []
  } catch {
    return []
  }
}

/** Puts a place first in the list, once: picking it again moves it up. */
export function rememberPlace(place: PlaceResult) {
  const { id, kind, name, address, category, lat, lon } = place
  const same = (p: PlaceResult) => p.name === name && Math.abs(p.lat - lat) < 1e-4 && Math.abs(p.lon - lon) < 1e-4
  save([{ id, kind, name, address, category, lat, lon }, ...recentPlaces().filter((p) => !same(p))].slice(0, MAX))
}

export function forgetPlaces() {
  save([])
}

function save(list: PlaceResult[]) {
  try {
    if (list.length > 0) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked (a private window, a full disk): nothing is remembered, nothing breaks.
  }
}

/** Storage can hold anything (an older format, a hand edit): only well-formed places in the service area count. */
function isPlace(value: unknown): value is PlaceResult {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    (p.kind === 'stop' || p.kind === 'place') &&
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    p.name.length <= 200 &&
    typeof p.address === 'string' &&
    (p.category === undefined || typeof p.category === 'string') &&
    typeof p.lat === 'number' &&
    typeof p.lon === 'number' &&
    inServiceArea(p.lat, p.lon)
  )
}
