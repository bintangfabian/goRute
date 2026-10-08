// Place search on our own index of OpenStreetMap places (data/places.json.gz,
// built by scripts/build-osm.ts): answers as fast as the halte search, without
// waiting on a public geocoder.

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { PlaceResult } from '../shared/api.ts'
import { words } from './stops.ts'

export const PLACES_VERSION = 2
const COORD = 1e5
const MAX_RESULTS = 6
/** What a match costs when words of the query only name the area it is in: "depok" in "ui depok". */
const AREA_PENALTY = 0.5
/** And when the area is only half typed ("ui dep"): enough to lose to a name that matches as well. */
const HALF_AREA_PENALTY = 2
/** What a match gains when the query says what kind of place it is: "rs" in "rs fatmawati" means the hospital, not Jalan RS Fatmawati. */
const KIND_BONUS = 0.75
/** What a match costs when that word is not in its name: Plaza Blok M before Blok M Hub for "blok m plaza". */
const KIND_ONLY_PENALTY = 0.75
/** Initials are a guess at what people type, so a name matching as well comes first. */
const INITIALS_PENALTY = 0.5
/** Other names (short, alternative, official) come after a name matching as well: mapping puts odd ones there. */
const ALT_PENALTY = 0.25
/** A match found by correcting a typo ("grand indonesa") comes after every match of what was typed. */
const TYPO_PENALTY = 1.5
/** With fewer matches than this, typos are looked for. */
const FEW = 3
/** A word this many names use is no typo. */
const COMMON_WORD = 50
/** Other words riders use for a kind of place. */
const KIND_WORDS: Record<string, string[]> = {
  Bandara: ['airport', 'bandar', 'udara'],
  Kampus: ['universitas', 'institut', 'politeknik'],
  Mal: ['plaza'],
  Masjid: ['mesjid'],
  'Rumah sakit': ['rsu', 'rsud', 'rsup', 'rsia', 'rsab', 'hospital'],
  Stasiun: ['mrt', 'krl', 'lrt', 'kereta', 'commuter'],
}
/** Titles in street names that riders leave out: Jalan Jenderal Gatot Subroto is "jalan gatot subroto". */
const TITLES = new Set(
  'jenderal jendral jend letjen mayjen brigjen laksamana laksda marsekal kolonel kol kapten kapt dr dokter doktor ir insinyur haji h hj hajjah prof profesor kh kyai raden r drs mr'.split(' '),
)
/** A street shows again in the results only this far from where it already shows: a long avenue is many pieces. */
const SAME_STREET_KM = 5
/**
 * Initials more than one place has, and the one riders mean wherever they ask
 * from: RS Citra Medika in Depok spells RSCM as well, but "rscm" is Cipto
 * Mangunkusumo, from Bogor too. Matched against the name spelled out by words().
 */
const KNOWN_INITIALS: Record<string, RegExp> = {
  rscm: /^rumah sakit (dr )?cipto mangunkusumo$/,
}
/** What riders call cities. */
const CITY_WORDS: Record<string, string[]> = {
  'Jakarta Pusat': ['jakpus'],
  'Jakarta Utara': ['jakut'],
  'Jakarta Barat': ['jakbar'],
  'Jakarta Selatan': ['jaksel'],
  'Jakarta Timur': ['jaktim'],
  'Tangerang Selatan': ['tangsel'],
}

export type PlacesFile = {
  version: number
  builtAt: string
  /** What places are ("Mal", "Stasiun", "Jalan"), by index. */
  labels: string[]
  /** Names of villages, districts, cities and estates, by index. */
  areas: string[]
  /** Where places are: village, district, city and estate (indices into areas, -1 for none), four per region. */
  regions: number[]
  name: string[]
  /** Other names joined by "|": short, alternative, official, brand. */
  alt: string[]
  /** Initials of a long name ("unj", "pim 2"), found only as whole words; "" for none. */
  initials: string[]
  /** In 1e-5 degrees. */
  lat: number[]
  lon: number[]
  /** Index into labels. */
  kind: number[]
  /** How much the place usually matters, 1 to 3: stations and malls over shops. */
  weight: number[]
  /** Index into areas: the estate or village the line under the name gives, -1 for none. */
  area: number[]
  /** Index into regions, -1 for none. */
  region: number[]
}

export class PlaceIndex {
  readonly file: PlacesFile
  /** Normalized words of each name and its alternatives. */
  private readonly forms: string[][][]
  /** All words of each place's names and initials, each after a space, to rule places out at a glance. */
  private readonly allWords: string[]
  /** All forms of each name without spaces, to find "atma jaya" in Atmajaya at a glance. */
  private readonly compact: string[]
  private readonly initialForms: (string[] | null)[]
  /** Words that say what a place is, per label: "rumah sakit", "kampus". */
  private readonly kindWords: Set<string>[]
  /** Words of the areas a place is in, per region: "pondok cina beji depok". */
  private readonly regionWords: string[][]
  /** Every word of kindWords and regionWords, to skip that search when no word of a query is one. */
  private readonly contextWords: Set<string>
  /** Every word of every name, sorted, with how many names use it: built on the first typo. */
  private vocabulary: { words: string[]; uses: Map<string, number> } | null = null

  constructor(file: PlacesFile) {
    if (file.version !== PLACES_VERSION) throw new Error(`places version ${file.version}, expected ${PLACES_VERSION}; run pnpm data:build`)
    this.file = file
    const street = file.labels.indexOf('Jalan')
    this.forms = file.name.map((name, i) => {
      const forms = [name, ...(file.alt[i] ? file.alt[i].split('|') : [])].map((n) => words(n))
      if (file.kind[i] !== street) return forms
      const untitled = forms.map((form) => form.filter((w) => !TITLES.has(w))).filter((form, k) => form.length !== forms[k].length)
      return [...forms, ...untitled]
    })
    this.compact = this.forms.map((forms) => forms.map((form) => form.join('')).join('|'))
    this.initialForms = file.initials.map((s) => (s ? s.split(' ') : null))
    this.allWords = this.forms.map((forms, i) => ` ${[...forms.flat(), ...(this.initialForms[i] ?? [])].join(' ')}`)
    this.kindWords = file.labels.map((l) => new Set([...words(l), ...(KIND_WORDS[l] ?? [])]))
    this.regionWords = []
    for (let r = 0; r < file.regions.length; r += 4) {
      const names = file.regions.slice(r, r + 4).flatMap((a) => (a >= 0 ? [file.areas[a]] : []))
      this.regionWords.push([...new Set(names.flatMap((n) => [...words(n), ...(CITY_WORDS[n] ?? [])]))])
    }
    this.contextWords = new Set([...this.kindWords.flatMap((k) => [...k]), ...this.regionWords.flat()])
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
    const spelled = words(query)
    const text = spelled.join(' ')
    if (text.length < 2) return []
    // Two letters only find a name or initials typed whole: "ui", "gi".
    const short = text.replaceAll(' ', '').length < 3
    // "rs koja" is RSUD Koja as much as Rumah Sakit Koja: the words as typed count too.
    const asTyped = words(query, false)
    const variants = [typedWords(spelled), ...(asTyped.join(' ') !== text ? [typedWords(asTyped)] : [])]
    const scores = new Map<number, number>()
    this.match(variants, short, 0, scores)
    if (scores.size < FEW && !short) this.match(this.corrected(spelled), false, TYPO_PENALTY, scores)

    // How well the name matches, weighed against how much the place usually matters
    // and how near it is: "jalan sudirman" means the avenue in Jakarta, even though
    // a lane called Jalan Sudirman Indah starts with the very words typed.
    const f = this.file
    const found = [...scores].map(([i, score]) => ({
      i,
      rank: score - f.weight[i] - (near ? closeness(near, f.lat[i] / COORD, f.lon[i] / COORD) : 0),
    }))
    const meant = KNOWN_INITIALS[text]
    if (meant) for (const x of found) if (meant.test(words(f.name[x.i]).join(' '))) x.rank = -Infinity
    found.sort((a, b) => a.rank - b.rank || f.name[a.i].length - f.name[b.i].length)
    const shown: number[] = []
    const streets = new Map<string, number[]>()
    for (const { i } of found) {
      if (shown.length === limit) break
      if (f.labels[f.kind[i]] === 'Jalan') {
        const key = words(f.name[i]).join(' ')
        const same = streets.get(key) ?? []
        if (same.length === 2 || same.some((j) => km(f.lat[j], f.lon[j], f.lat[i], f.lon[i]) < SAME_STREET_KM)) continue
        streets.set(key, [...same, i])
      }
      shown.push(i)
    }
    return shown.map((i) => ({
      id: `osm${i}`,
      kind: 'place',
      name: f.name[i],
      address: [f.labels[f.kind[i]], this.where(i)].filter(Boolean).join(' · '),
      category: f.labels[f.kind[i]],
      lat: f.lat[i] / COORD,
      lon: f.lon[i] / COORD,
    }))
  }

  /** Scores places matching any of the variants of a query into `scores`, keeping each place's best. */
  private match(variants: Typed[], short: boolean, extra: number, scores: Map<number, number>) {
    if (variants.length === 0) return
    const f = this.file
    const q = variants[0].words
    // Words that may say where a place is or what it is rather than name it: "ui depok", "rs fatmawati".
    const last = q.length - 1
    const context =
      !short &&
      q.length > 1 &&
      q.some((w, k) => this.contextWords.has(w) || (k === last && w.length >= 3 && [...this.contextWords].some((c) => c.startsWith(w))))
    // What is left of the query per region and kind of place, worked out once for all places alike.
    const rests = new Map<number, Rest[]>()
    for (let i = 0; i < this.forms.length; i++) {
      let score = Infinity
      for (const typed of variants) score = Math.min(score, short ? this.wholeMatch(i, typed) : this.nameMatch(i, typed))
      if (score === Infinity && context) {
        const key = (f.region[i] + 1) * f.labels.length + f.kind[i]
        let left = rests.get(key)
        if (left === undefined) rests.set(key, (left = this.withoutContext(i, q)))
        for (const rest of left) score = Math.min(score, this.nameMatch(i, rest) + rest.penalty)
      }
      if (score === Infinity) continue
      if (q.some((w) => this.kindWords[f.kind[i]].has(w))) score -= KIND_BONUS
      score += extra
      if (score < (scores.get(i) ?? Infinity)) scores.set(i, score)
    }
  }

  /** Only a whole name or whole initials: for two letters, where anything more would match half the index. */
  private wholeMatch(i: number, typed: Typed): number {
    if (!this.allWords[i].includes(typed.spaced[0])) return Infinity
    const at = this.forms[i].findIndex((form) => form.join(' ') === typed.text)
    if (at >= 0) return at > 0 ? ALT_PENALTY : 0
    return this.initialForms[i]?.join(' ') === typed.text ? INITIALS_PENALTY : Infinity
  }

  /**
   * The query with each word no name uses replaced by a name's word one typo
   * away (two for long words), most used first: "grand indonesa" → grand
   * indonesia. Empty when every word is known.
   */
  private corrected(q: string[]): Typed[] {
    this.vocabulary ??= vocabularyOf(this.forms)
    const { words: known, uses } = this.vocabulary
    const options = q.map((w, k) => {
      // Short words, numbers, and words many names use are what they look like.
      if (w.length < 4 || /\d/.test(w) || (uses.get(w) ?? 0) >= COMMON_WORD) return [w]
      // The last word may still be half typed.
      if (k === q.length - 1 && !uses.has(w) && startsSome(known, w)) return [w]
      const most = w.length >= 8 ? 2 : 1
      const near = known.filter((v) => v !== w && Math.abs(v.length - w.length) <= most && typos(w, v, most) <= most)
      near.sort((a, b) => uses.get(b)! - uses.get(a)!)
      return [w, ...near.slice(0, 2)]
    })
    if (options.every((o, k) => o.length === 1 && o[0] === q[k])) return []
    let queries: string[][] = [[]]
    for (const o of options) queries = queries.flatMap((qq) => o.map((w) => [...qq, w])).slice(0, 6)
    return queries.map(typedWords)
  }

  private nameMatch(i: number, typed: Typed): number {
    const all = this.allWords[i]
    // Every typed word starts a word of the names: most places are ruled out here.
    if (typed.spaced.every((w) => all.includes(w))) {
      let score = Infinity
      this.forms[i].forEach((form, k) => (score = Math.min(score, matchPenalty(form, typed.words, typed.text) + (k > 0 ? ALT_PENALTY : 0))))
      const initials = this.initialForms[i]
      if (initials) score = Math.min(score, initialsPenalty(initials, typed.text))
      if (score < Infinity) return score
    }
    const joined = typed.joined
    return joined.length >= 5 && this.compact[i].includes(joined) && this.forms[i].some((form) => spacedOtherwise(form, joined)) ? 2.5 : Infinity
  }

  /**
   * The query without the words naming the kind of a place ("stasiun duri"),
   * and then without those naming its area as well ("ui" of "ui depok" for the
   * campus in Depok), the last one possibly half typed. A word goes as area only
   * when the name cannot use it: the station Duri lies in Duri Utara.
   */
  private withoutContext(i: number, q: string[]): Rest[] {
    const f = this.file
    const kind = this.kindWords[f.kind[i]]
    const areas = f.region[i] >= 0 ? this.regionWords[f.region[i]] : []
    const out: Rest[] = []
    const named = q.filter((w) => !kind.has(w))
    if (named.length === 0) return out
    if (named.length < q.length) out.push({ ...typedWords(named), penalty: KIND_ONLY_PENALTY })
    const base = named.length < q.length ? KIND_ONLY_PENALTY : 0
    const rest: string[] = []
    let penalty = 0
    named.forEach((w, k) => {
      if (areas.includes(w)) penalty = Math.max(penalty, AREA_PENALTY)
      else if (k === named.length - 1 && w.length >= 3 && areas.some((a) => a.startsWith(w))) penalty = HALF_AREA_PENALTY
      else rest.push(w)
    })
    if (rest.length > 0 && rest.length < named.length) out.push({ ...typedWords(rest), penalty: base + penalty })
    return out
  }

  /** "Pondok Cina, Depok": the estate or village and the city, each once; for a town, the city or regency only. */
  private where(i: number): string {
    const f = this.file
    const cityAt = f.region[i] >= 0 ? f.regions[f.region[i] * 4 + 2] : -1
    const city = cityAt >= 0 ? f.areas[cityAt] : ''
    if (f.labels[f.kind[i]] === 'Kota') return city === f.name[i] ? '' : city
    const area = f.area[i] >= 0 ? f.areas[f.area[i]] : ''
    return [area, city !== area ? city : ''].filter(Boolean).join(', ')
  }
}

const km = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  Math.hypot(((lon2 - lon1) / COORD) * Math.cos((lat1 / COORD) * (Math.PI / 180)), (lat2 - lat1) / COORD) * 111.32

function vocabularyOf(forms: string[][][]): { words: string[]; uses: Map<string, number> } {
  const uses = new Map<string, number>()
  for (const place of forms) for (const form of place) for (const w of form) uses.set(w, (uses.get(w) ?? 0) + 1)
  return { words: [...uses.keys()].sort(), uses }
}

/** Whether a word of the sorted list starts with `w`. */
function startsSome(sorted: string[], w: string): boolean {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] < w) lo = mid + 1
    else hi = mid
  }
  return lo < sorted.length && sorted[lo].startsWith(w)
}

/** Typos between two words (insertions, deletions, substitutions, swaps), counted up to `most` + 1. */
function typos(a: string, b: string, most: number): number {
  let before = new Array<number>(b.length + 1).fill(0)
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1)
      row.push(d)
      best = Math.min(best, d)
    }
    if (best > most) return most + 1
    before = prev
    prev = row
  }
  return prev[b.length]
}

/** A query's words, together and apart, in the shapes the matching needs. */
type Typed = { words: string[]; text: string; joined: string; spaced: string[] }

/** What is left of a query once words of area and kind are set aside, and what setting them aside costs. */
type Rest = Typed & { penalty: number }

const typedWords = (q: string[]): Typed => ({ words: q, text: q.join(' '), joined: q.join(''), spaced: q.map((w) => ` ${w}`) })

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

/**
 * Whether the name holds what was typed (without its spaces) written with other
 * spaces, from the start of one of its words: "atma jaya" in Universitas
 * Atmajaya, "kelapagading" in Mall Kelapa Gading.
 */
function spacedOtherwise(name: string[], typed: string): boolean {
  const joined = name.join('')
  let at = joined.indexOf(typed)
  if (at < 0) return false
  for (let w = 0, start = 0; w < name.length; start += name[w].length, w++) {
    while (at >= 0 && at < start) at = joined.indexOf(typed, at + 1)
    if (at === start) return true
  }
  return false
}

/** Initials only match whole: "pim" and "pim 2" find Pondok Indah Mall 2, "pi" does not. */
function initialsPenalty(initials: string[], text: string): number {
  const full = initials.join(' ')
  if (full === text) return INITIALS_PENALTY
  return full.startsWith(`${text} `) ? 1 + INITIALS_PENALTY : Infinity
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
