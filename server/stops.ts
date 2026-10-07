// Finds haltes by name straight from the timetable, so place search
// answers at once and keeps working when Photon is slow or down.

import type { PlaceResult } from '../shared/api.ts'
import { distanceM } from './geo.ts'
import type { Timetable } from './timetable/timetable.ts'

const MAX_RESULTS = 4
/** Same-named stops closer than this are one place: platforms, both sides of a road. */
const SAME_PLACE_M = 600
/** A BRT halte farther than this makes a misleading "Dekat Halte …" hint. */
const MAX_BRT_HINT_M = 1500

/** Halte and place names abbreviate a lot; spelled out, "stasiun gambir" finds "St. Gambir 1" and "rs" a Rumah Sakit. */
const ABBREVIATIONS: Record<string, string> = {
  apt: 'apartemen',
  gg: 'gang',
  jl: 'jalan',
  jln: 'jalan',
  kb: 'kebon',
  kec: 'kecamatan',
  kel: 'kelurahan',
  komp: 'komplek',
  kp: 'kampung',
  mal: 'mall',
  perum: 'perumahan',
  ps: 'pasar',
  rs: 'rumah sakit',
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
  /** Words of each stop name merged into it, so typing "Gambir 2" still finds "Gambir". */
  stopWords: string[][]
  /** A nearby halte that tells it apart from haltes of the same name elsewhere. */
  near?: string
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
    address: describe(tt, halte.routes, halte.near),
    lat: halte.lat,
    lon: halte.lon,
  }))
}

/** The best match of the query against the halte's name or any of its stop names. */
function matchScore(halte: Halte, q: string[], text: string): number {
  return Math.min(...[halte.words, ...halte.stopWords].map((name) => nameScore(name, q, text)))
}

/** 0 for the whole name, 1 when the name starts with the query, 2 when every query word starts a word of the name. */
function nameScore(name: string[], q: string[], text: string): number {
  const full = name.join(' ')
  if (full === text) return 0
  if (full.startsWith(text)) return 1
  return q.every((w) => name.some((nw) => nw.startsWith(w))) ? 2 : Infinity
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

/** "Halte Transjakarta · 1, 6A, 9 +4", BRT corridors first, or "Dekat Halte Blok M · 1" for a name used elsewhere too. */
function describe(tt: Timetable, routes: number[], near: string | undefined): string {
  const sorted = routes
    .map((r) => tt.routes[r])
    .sort(
      (a, b) =>
        Number(b.category === 'BRT') - Number(a.category === 'BRT') ||
        a.shortName.localeCompare(b.shortName, 'id', { numeric: true }),
    )
  const names = [...new Set(sorted.map((r) => r.shortName))]
  const shown = `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` +${names.length - 4}` : ''}`
  // The hint leads, so a narrow screen that cuts the line still shows where it is.
  return near ? `Dekat Halte ${near} · ${shown}` : `Halte ${sorted[0]?.agency ?? ''} · ${shown}`
}

/** Lowercase words with abbreviations spelled out: "Sbr. St. Gambir" → seberang stasiun gambir. */
export function words(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (ABBREVIATIONS[w] ?? w).split(' '))
}

/**
 * A stop name from most to least specific, dropping the side of the road,
 * then the direction or platform at the end, one at a time:
 * "Sbr. Monas 2" → ["Sbr. Monas 2", "Monas 2", "Monas"]. Platforms are
 * numbered 1 to 9; longer or zero-padded numbers name the place itself
 * ("SMAN 85", "SDN Lebak Bulus 01") and stay.
 */
export function nameForms(stopName: string): string[] {
  const forms = [stopName.trim()]
  const next = (s: string) => {
    const unprefixed = s.replace(/^Sbr\.\s+/i, '')
    return unprefixed !== s ? unprefixed : s.replace(/\s+(Arah \S+|Jalur \d+|[1-9])$/i, '')
  }
  for (let s = next(forms[0]); s !== forms.at(-1); s = next(s)) forms.push(s)
  return forms
}

/** The least specific form of a stop name: "Sbr. St. Gambir 2" → "St. Gambir". */
export function placeName(stopName: string): string {
  return nameForms(stopName).at(-1)!
}

/**
 * The most specific name every stop of one place shares: "Monas 1" and
 * "Monas 2" → "Monas", "SMAN 85" and "Sbr. SMAN 85" → "SMAN 85".
 */
function sharedName(names: string[]): string {
  const key = (s: string) => words(s).join(' ')
  const others = names.slice(1).map((n) => new Set(nameForms(n).map(key)))
  // The least specific form is what grouped the stops, so one always matches.
  return nameForms(names[0]).find((form) => others.every((forms) => forms.has(key(form))))!
}

const cache = new WeakMap<Timetable, Halte[]>()

/** Stops grouped into haltes, built once per timetable. */
function haltes(tt: Timetable): Halte[] {
  const cached = cache.get(tt)
  if (cached) return cached

  // Group stops by base name within walking distance first: only then is it
  // clear whether a number tells platforms apart ("Monas 1", "Monas 2") or
  // places ("SMAN 73", "SMAN 85").
  const groups = new Map<string, { anchor: number; stops: number[] }[]>()
  for (let s = 0; s < tt.stopCount; s++) {
    const base = words(placeName(tt.stopName[s])).join(' ')
    if (!base) continue
    let same = groups.get(base)
    if (!same) groups.set(base, (same = []))
    const near = (g: { anchor: number }) =>
      distanceM(tt.stopLat[g.anchor], tt.stopLon[g.anchor], tt.stopLat[s], tt.stopLon[s]) < SAME_PLACE_M
    const group = same.find(near)
    if (group) group.stops.push(s)
    else same.push({ anchor: s, stops: [s] })
  }

  const list: Halte[] = []
  for (const [base, same] of groups) {
    for (const g of same) {
      const stopNames = [...new Set(g.stops.map((s) => tt.stopName[s]))]
      const name = sharedName(stopNames)
      const text = words(name).join(' ')
      const routes = new Set<number>()
      for (const s of g.stops) {
        const serving = tt.stopPatterns[s]
        for (let j = 0; j < serving.length; j += 2) routes.add(tt.patterns[serving[j]].route)
      }
      const mean = (values: Float64Array) => g.stops.reduce((sum, s) => sum + values[s], 0) / g.stops.length
      list.push({
        id: `halte${list.length}`,
        name,
        words: text.split(' '),
        text,
        base,
        stopWords: stopNames.length > 1 ? stopNames.map(words) : [],
        lat: Math.round(mean(tt.stopLat) * 1e6) / 1e6,
        lon: Math.round(mean(tt.stopLon) * 1e6) / 1e6,
        routes: [...routes],
      })
    }
  }
  addHints(tt, list)
  cache.set(tt, list)
  return list
}

/**
 * Haltes sharing a name, such as two "Masjid At Taqwa" 22 km apart, get a
 * hint: the nearest BRT halte within MAX_BRT_HINT_M, as it is the better
 * known landmark, else the nearest halte of any kind. Hints that would not
 * tell the haltes apart fall back to the nearest halte of any kind too.
 */
function addHints(tt: Timetable, list: Halte[]) {
  const byName = new Map<string, Halte[]>()
  for (const h of list) byName.set(h.text, [...(byName.get(h.text) ?? []), h])
  const brt = list.filter((h) => h.routes.some((r) => tt.routes[r].category === 'BRT'))
  const nearest = (h: Halte, candidates: Halte[], maxM = Infinity) => {
    let best: Halte | undefined
    let bestM = maxM
    for (const c of candidates) {
      if (c.base === h.base) continue
      const m = distanceM(h.lat, h.lon, c.lat, c.lon)
      if (m < bestM) {
        best = c
        bestM = m
      }
    }
    return best && placeName(best.name)
  }
  for (const same of byName.values()) {
    if (same.length < 2) continue
    for (const h of same) h.near = nearest(h, brt, MAX_BRT_HINT_M) ?? nearest(h, list)
    if (new Set(same.map((h) => h.near)).size < same.length) {
      for (const h of same) h.near = nearest(h, list)
    }
  }
}
