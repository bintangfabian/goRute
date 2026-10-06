// Finds haltes by name straight from the timetable, so place search
// answers at once and keeps working when Photon is slow or down.

import type { PlaceResult } from '../shared/api.ts'
import { distanceM } from './geo.ts'
import type { Timetable } from './timetable/timetable.ts'

const MAX_RESULTS = 4
/** Same-named stops closer than this are one place: platforms, both sides of a road. */
const SAME_PLACE_M = 600

/** GTFS halte names abbreviate a lot; spelled out, "stasiun gambir" finds "St. Gambir 1". */
const ABBREVIATIONS: Record<string, string> = {
  gg: 'gang',
  jl: 'jalan',
  jln: 'jalan',
  kb: 'kebon',
  kec: 'kecamatan',
  kel: 'kelurahan',
  komp: 'komplek',
  kp: 'kampung',
  ps: 'pasar',
  sbr: 'seberang',
  st: 'stasiun',
  term: 'terminal',
  tj: 'tanjung',
  univ: 'universitas',
}

/** What people call places whose halte has another name. */
export const ALIASES: Record<string, string[]> = {
  monas: ['Monumen Nasional'],
  gbk: ['Gelora Bung Karno'],
  kota: ['Kali Besar'],
  'kota tua': ['Museum Sejarah Jakarta', 'Kali Besar'],
  ui: ['Univ. Indonesia'],
  'bunderan hi': ['Bundaran HI Astra'],
  'grand indonesia': ['Bundaran HI Astra'],
  pim: ['Pondok Indah'],
  soetta: ['Imigrasi SHIA'],
  'soekarno hatta': ['Imigrasi SHIA'],
  'bandara soekarno hatta': ['Imigrasi SHIA'],
}

type Halte = {
  id: string
  name: string
  /** Normalized words of the name, see words(). */
  words: string[]
  text: string
  /** The name without platform numbers and the like, which aliases point at. */
  base: string
  lat: number
  lon: number
  /** Routes serving any of its stops. */
  routes: number[]
}

export function searchStops(tt: Timetable, query: string): PlaceResult[] {
  const q = words(query)
  const text = q.join(' ')
  if (text.length < 2) return []

  const aliased = aliasScores(text)
  const found: { halte: Halte; score: number }[] = []
  for (const halte of haltes(tt)) {
    const score = Math.min(aliased.get(halte.base) ?? Infinity, matchScore(halte, q, text))
    if (score < Infinity) found.push({ halte, score })
  }
  // Busier haltes first among equal matches: they are the ones people mean.
  found.sort((a, b) => a.score - b.score || b.halte.routes.length - a.halte.routes.length || a.halte.name.length - b.halte.name.length)

  return found.slice(0, MAX_RESULTS).map(({ halte }) => ({
    id: halte.id,
    kind: 'stop',
    name: halte.name,
    address: describe(tt, halte.routes),
    lat: halte.lat,
    lon: halte.lon,
  }))
}

/** 0 for the whole name, 1 when the name starts with the query, 2 when every query word starts a word of the name. */
function matchScore(halte: Halte, q: string[], text: string): number {
  if (halte.text === text) return 0
  if (halte.text.startsWith(text)) return 1
  return q.every((w) => halte.words.some((hw) => hw.startsWith(w))) ? 2 : Infinity
}

/** Haltes an alias points at, scored like matchScore. */
function aliasScores(text: string): Map<string, number> {
  const scores = new Map<string, number>()
  for (const [alias, targets] of Object.entries(ALIASES)) {
    const a = words(alias).join(' ')
    const score = a === text ? 0 : text.length >= 3 && a.startsWith(text) ? 1 : Infinity
    if (score === Infinity) continue
    for (const target of targets) {
      const t = words(target).join(' ')
      scores.set(t, Math.min(scores.get(t) ?? Infinity, score))
    }
  }
  return scores
}

/** "Halte Transjakarta · 1, 6A, 9 +4": BRT corridors first. */
function describe(tt: Timetable, routes: number[]): string {
  const sorted = routes
    .map((r) => tt.routes[r])
    .sort(
      (a, b) =>
        Number(b.category === 'BRT') - Number(a.category === 'BRT') ||
        a.shortName.localeCompare(b.shortName, 'id', { numeric: true }),
    )
  const names = [...new Set(sorted.map((r) => r.shortName))]
  const more = names.length > 4 ? ` +${names.length - 4}` : ''
  return `Halte ${sorted[0]?.agency ?? ''} · ${names.slice(0, 4).join(', ')}${more}`
}

/** Lowercase words with abbreviations spelled out: "Sbr. St. Gambir" → seberang stasiun gambir. */
export function words(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
}

/**
 * The place a stop belongs to, without its platform, direction, or side of
 * the road: "Sbr. St. Gambir 2" and "Blok M Jalur 3" → "St. Gambir", "Blok M".
 */
export function placeName(stopName: string): string {
  let name = stopName.trim().replace(/^Sbr\.\s+/i, '')
  for (let prev = ''; prev !== name; ) {
    prev = name
    name = name.replace(/\s+(Arah \S+|Jalur \d+|\d+)$/i, '')
  }
  return name
}

const cache = new WeakMap<Timetable, Halte[]>()

/** Stops grouped into haltes, built once per timetable. */
function haltes(tt: Timetable): Halte[] {
  const cached = cache.get(tt)
  if (cached) return cached

  // Platform numbers and the like are dropped only where they tell stops of
  // one place apart ("Monas 1", "Monas 2"); "GBK Pintu 7" keeps its gate.
  const sources = new Map<string, Set<string>>()
  for (const stopName of tt.stopName) {
    const base = words(placeName(stopName)).join(' ')
    let names = sources.get(base)
    if (!names) sources.set(base, (names = new Set()))
    names.add(stopName)
  }

  const groups = new Map<string, { name: string; anchor: number; stops: number[] }[]>()
  for (let s = 0; s < tt.stopCount; s++) {
    const stripped = placeName(tt.stopName[s])
    const name = sources.get(words(stripped).join(' '))!.size > 1 ? stripped : tt.stopName[s]
    const text = words(name).join(' ')
    if (!text) continue
    let same = groups.get(text)
    if (!same) groups.set(text, (same = []))
    const near = (g: { anchor: number }) =>
      distanceM(tt.stopLat[g.anchor], tt.stopLon[g.anchor], tt.stopLat[s], tt.stopLon[s]) < SAME_PLACE_M
    const group = same.find(near)
    if (group) group.stops.push(s)
    else same.push({ name, anchor: s, stops: [s] })
  }

  const list: Halte[] = []
  for (const [text, same] of groups) {
    for (const g of same) {
      const routes = new Set<number>()
      for (const s of g.stops) {
        const serving = tt.stopPatterns[s]
        for (let j = 0; j < serving.length; j += 2) routes.add(tt.patterns[serving[j]].route)
      }
      const mean = (values: Float64Array) => g.stops.reduce((sum, s) => sum + values[s], 0) / g.stops.length
      list.push({
        id: `halte${list.length}`,
        name: g.name,
        words: text.split(' '),
        text,
        base: words(placeName(g.name)).join(' '),
        lat: Math.round(mean(tt.stopLat) * 1e6) / 1e6,
        lon: Math.round(mean(tt.stopLon) * 1e6) / 1e6,
        routes: [...routes],
      })
    }
  }
  cache.set(tt, list)
  return list
}
