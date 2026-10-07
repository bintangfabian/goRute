// Place search on our own index of OpenStreetMap places (data/places.json.gz,
// built by scripts/build-osm.ts): answers as fast as the halte search, without
// waiting on a public geocoder.

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { PlaceResult } from '../shared/api.ts'
import { words } from './stops.ts'

export const PLACES_VERSION = 1
const COORD = 1e5
const MAX_RESULTS = 6

export type PlacesFile = {
  version: number
  builtAt: string
  /** What places are ("Mal", "Stasiun", "Jalan"), by index. */
  labels: string[]
  /** Neighbourhood names, by index. */
  areas: string[]
  name: string[]
  /** Other names joined by "|": short, alternative, official, brand. */
  alt: string[]
  /** In 1e-5 degrees. */
  lat: number[]
  lon: number[]
  /** Index into labels. */
  kind: number[]
  /** How much the place usually matters, 1 to 3: stations and malls over shops. */
  weight: number[]
  /** Index into areas, -1 for none. */
  area: number[]
}

export class PlaceIndex {
  readonly file: PlacesFile
  /** Normalized words of each name and its alternatives. */
  private readonly forms: string[][][]

  constructor(file: PlacesFile) {
    if (file.version !== PLACES_VERSION) throw new Error(`places version ${file.version}, expected ${PLACES_VERSION}; run pnpm data:build`)
    this.file = file
    this.forms = file.name.map((name, i) => [name, ...(file.alt[i] ? file.alt[i].split('|') : [])].map(words))
  }

  get size() {
    return this.file.name.length
  }

  /**
   * Places matching a query, best first. Among equally good matches, places
   * near `near` (the other end of the trip, or the map) come first: Kemang in
   * South Jakarta for someone in Jakarta, not the one in Bogor.
   */
  search(query: string, near?: { lat: number; lon: number }, limit = MAX_RESULTS): PlaceResult[] {
    const q = words(query)
    const text = q.join(' ')
    if (text.length < 2) return []
    const f = this.file
    const found: { i: number; score: number; rank: number }[] = []
    for (let i = 0; i < this.forms.length; i++) {
      let score = Infinity
      for (const form of this.forms[i]) score = Math.min(score, matchPenalty(form, q, text))
      if (score < Infinity) found.push({ i, score, rank: 0 })
    }
    // How well the name matches, weighed against how much the place usually matters
    // and how near it is: "jalan sudirman" means the avenue in Jakarta, even though
    // a lane called Jalan Sudirman Indah starts with the very words typed.
    for (const x of found) {
      x.rank = x.score - f.weight[x.i] - (near ? closeness(near, f.lat[x.i] / COORD, f.lon[x.i] / COORD) : 0)
    }
    found.sort((a, b) => a.rank - b.rank || f.name[a.i].length - f.name[b.i].length)
    return found.slice(0, limit).map(({ i }) => ({
      id: `osm${i}`,
      kind: 'place',
      name: f.name[i],
      address: [f.labels[f.kind[i]], f.area[i] >= 0 ? f.areas[f.area[i]] : ''].filter(Boolean).join(' · '),
      category: f.labels[f.kind[i]],
      lat: f.lat[i] / COORD,
      lon: f.lon[i] / COORD,
    }))
  }
}

/**
 * Up to 1.5 extra weight for being near: as much as a mall outweighs a shop
 * when the place is right there, nothing past ~30 km.
 */
function closeness(near: { lat: number; lon: number }, lat: number, lon: number): number {
  const km = Math.hypot((lon - near.lon) * Math.cos(near.lat * (Math.PI / 180)), lat - near.lat) * 111.32
  return 1.5 * Math.max(0, 1 - km / 30)
}

/**
 * How far a name is from what was typed, Infinity for no match: 0 for the
 * whole name, then a name starting with the typed words (1), containing all
 * of them (1.5), starting with the text (2: the last word half typed), and
 * words that only start with what was typed (2.5). "kemang" is the place
 * Kemang before Kemanggisan.
 */
function matchPenalty(name: string[], q: string[], text: string): number {
  const full = name.join(' ')
  if (full === text) return 0
  if (full.startsWith(`${text} `)) return 1
  if (q.every((w) => name.includes(w))) return 1.5
  if (full.startsWith(text)) return 2
  return q.every((w) => name.some((nw) => nw.startsWith(w))) ? 2.5 : Infinity
}

let loaded: PlaceIndex | null | undefined

/** The bundled index, or null without data/places.json.gz (then only the geocoder searches places). */
export function loadPlaces(): PlaceIndex | null {
  if (loaded !== undefined) return loaded
  try {
    const raw = gunzipSync(readFileSync(new URL('../data/places.json.gz', import.meta.url)))
    loaded = new PlaceIndex(JSON.parse(raw.toString('utf8')) as PlacesFile)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    console.warn('data/places.json.gz tidak ada: pencarian tempat hanya lewat geocoder. Jalankan pnpm data:build.')
    loaded = null
  }
  return loaded
}
