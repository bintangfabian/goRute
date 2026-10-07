// Builds the place search index (data/places.json.gz) from named OpenStreetMap
// features: landmarks, shops and offices, neighbourhoods, and streets.

import { words } from '../../server/stops.ts'
import { PLACES_VERSION, type PlacesFile } from '../../server/places.ts'
import { readOsm, type Tags } from './pbf.ts'

/** Same-named places this close are one place: a building and its label, two entrances. */
const SAME_PLACE_M = 150
/** Stretches of a street name this far apart are different streets (every town has a Jalan Merdeka). */
const SAME_STREET_M = 1500
/** A place's neighbourhood is the nearest one within this distance. */
const AREA_M = 3000
const COORD = 1e5

type Kind = { label: string; weight: number }

const SKIP_AMENITY = new Set([
  'atm',
  'parking',
  'parking_entrance',
  'parking_space',
  'motorcycle_parking',
  'bicycle_parking',
  'toilets',
  'bench',
  'waste_basket',
  'waste_disposal',
  'vending_machine',
  'charging_station',
  'shelter',
  'telephone',
  'drinking_water',
  'recycling',
])
/** Named streets and how much each class usually matters: avenues over alleys. */
const STREETS: Record<string, number> = {
  trunk: 3,
  primary: 3,
  secondary: 2.5,
  tertiary: 2,
  unclassified: 1.5,
  residential: 1.5,
  pedestrian: 1.5,
  living_street: 1,
  service: 1,
}
/** A long street matters more than a short one of its class, up to this bonus at 20 km. */
const LENGTH_BONUS = 0.5
const WORSHIP: Record<string, string> = { muslim: 'Masjid', christian: 'Gereja', buddhist: 'Vihara', hindu: 'Pura', confucian: 'Klenteng' }
const AREA_PLACES = new Set(['suburb', 'city_district', 'quarter', 'village', 'neighbourhood', 'town'])

/** What a named feature is, in words a rider knows, and how much it usually matters; null to leave it out. */
export function placeKind(t: Tags): Kind | null {
  const has = (k: string, ...vals: string[]) => (vals.length ? vals.includes(t.get(k) ?? '') : t.has(k))
  const amenity = t.get('amenity') ?? ''
  if (has('aeroway', 'aerodrome', 'terminal')) return { label: 'Bandara', weight: 3 }
  if (has('railway', 'station', 'halt') || has('public_transport', 'station')) return { label: 'Stasiun', weight: 3 }
  if (amenity === 'bus_station') return { label: 'Terminal bus', weight: 3 }
  if (has('shop', 'mall', 'department_store')) return { label: 'Mal', weight: 3 }
  if (amenity === 'hospital') return { label: 'Rumah sakit', weight: 3 }
  if (amenity === 'university' || amenity === 'college') return { label: 'Kampus', weight: 3 }
  if (has('tourism', 'museum')) return { label: 'Museum', weight: 3 }
  if (has('tourism', 'attraction', 'zoo', 'theme_park', 'aquarium', 'viewpoint')) return { label: 'Tempat wisata', weight: 3 }
  if (amenity === 'townhall' || has('office', 'government')) return { label: 'Kantor pemerintahan', weight: 3 }
  if (has('leisure', 'stadium')) return { label: 'Stadion', weight: 3 }
  if (has('place', 'city', 'town')) return { label: 'Kota', weight: 3 }
  if (has('place', 'suburb', 'city_district', 'quarter')) return { label: 'Kawasan', weight: 2 }
  if (has('place', 'village')) return { label: 'Kelurahan', weight: 2 }
  if (has('place', 'neighbourhood', 'hamlet', 'city_block')) return { label: 'Lingkungan', weight: 1 }
  if (amenity === 'marketplace') return { label: 'Pasar', weight: 2 }
  if (amenity === 'place_of_worship') return { label: WORSHIP[t.get('religion') ?? ''] ?? 'Tempat ibadah', weight: 2 }
  if (amenity === 'school' || amenity === 'kindergarten') return { label: 'Sekolah', weight: 2 }
  if (['clinic', 'doctors', 'dentist'].includes(amenity) || has('healthcare')) return { label: 'Klinik', weight: 2 }
  if (has('tourism', 'hotel', 'guest_house', 'hostel', 'motel')) return { label: 'Hotel', weight: 2 }
  if (has('leisure', 'park', 'garden')) return { label: 'Taman', weight: 2 }
  if (has('historic')) return { label: 'Tempat bersejarah', weight: 2 }
  if (amenity === 'police') return { label: 'Kantor polisi', weight: 2 }
  if (amenity === 'post_office') return { label: 'Kantor pos', weight: 2 }
  if (amenity === 'bank') return { label: 'Bank', weight: 2 }
  if (has('office')) return { label: 'Kantor', weight: 2 }
  if (has('landuse', 'residential')) return { label: 'Perumahan', weight: 2 }
  if (has('shop', 'supermarket')) return { label: 'Supermarket', weight: 1 }
  if (has('shop', 'convenience')) return { label: 'Minimarket', weight: 1 }
  if (['restaurant', 'fast_food', 'food_court'].includes(amenity)) return { label: 'Tempat makan', weight: 1 }
  if (amenity === 'cafe') return { label: 'Kafe', weight: 1 }
  if (amenity === 'fuel') return { label: 'SPBU', weight: 1 }
  if (has('shop') || has('craft')) return { label: 'Toko', weight: 1 }
  if (has('leisure')) return { label: 'Olahraga & rekreasi', weight: 1 }
  if (has('tourism')) return { label: 'Wisata', weight: 1 }
  if (has('landuse')) return { label: 'Kawasan', weight: 1 }
  if (has('building')) return { label: t.get('building') === 'apartments' ? 'Apartemen' : 'Gedung', weight: 1 }
  if (amenity && !SKIP_AMENITY.has(amenity)) return { label: 'Fasilitas umum', weight: 1 }
  return null
}

type Candidate = { name: string; alt: string[]; lat: number; lon: number; kind: Kind }

/** Builds the index from a PBF of named features with the nodes and ways they are made of. */
export function buildPlacesFile(pbfPath: string, builtAt: Date): PlacesFile {
  // Areas mapped as relations (big mosques, stadiums, campuses) are found at the middle of their outer ways.
  const relations: { name: string; alt: string[]; kind: Kind; ways: number[] }[] = []
  const memberWays = new Set<number>()
  readOsm(pbfPath, {
    relation(_id, members, tags) {
      const name = named(tags)
      const kind = name && tags.get('type') === 'multipolygon' ? placeKind(tags) : null
      if (!kind) return
      const ways = members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => m.ref)
      if (ways.length === 0) return
      for (const w of ways) memberWays.add(w)
      relations.push({ name, alt: alts(tags, name), kind, ways })
    },
  })
  const wayNodes = new Map<number, number[]>()

  let ids = new Float64Array(1 << 20)
  let lats = new Float64Array(1 << 20)
  let lons = new Float64Array(1 << 20)
  let count = 0
  const at = (id: number) => {
    let lo = 0
    let hi = count - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (ids[mid] === id) return mid
      if (ids[mid] < id) lo = mid + 1
      else hi = mid - 1
    }
    return -1
  }
  const places: Candidate[] = []
  const streets = new Map<string, { name: string; lat: number; lon: number; length: number; weight: number }[]>()
  const areas: { name: string; lat: number; lon: number }[] = []

  readOsm(pbfPath, {
    node(id, lat, lon, tags) {
      if (count === ids.length) {
        const grow = (a: Float64Array) => {
          const b = new Float64Array(a.length * 2)
          b.set(a)
          return b
        }
        ids = grow(ids)
        lats = grow(lats)
        lons = grow(lons)
      }
      ids[count] = id
      lats[count] = lat
      lons[count] = lon
      count++
      const name = tags && named(tags)
      if (!tags || !name) return
      if (AREA_PLACES.has(tags.get('place') ?? '')) areas.push({ name, lat, lon })
      const kind = placeKind(tags)
      if (kind) places.push({ name, alt: alts(tags, name), lat, lon, kind })
    },
    way(id, refs, tags) {
      const nodes = refs.map(at).filter((i) => i >= 0)
      if (memberWays.has(id)) wayNodes.set(id, nodes)
      const name = named(tags)
      if (!name || nodes.length === 0) return
      const highway = tags.get('highway')
      if (highway) {
        if (!(highway in STREETS)) return
        // The middle node stands for the street piece; its length picks the piece that stands for the street.
        const mid = nodes[nodes.length >> 1]
        let length = 0
        for (let i = 1; i < nodes.length; i++) length += meters(lats[nodes[i - 1]], lons[nodes[i - 1]], lats[nodes[i]], lons[nodes[i]])
        const key = words(name).join(' ')
        const list = streets.get(key) ?? []
        list.push({ name, lat: lats[mid], lon: lons[mid], length, weight: STREETS[highway] })
        streets.set(key, list)
        return
      }
      const kind = placeKind(tags)
      if (!kind) return
      // Areas and buildings are found at the middle of their outline.
      let lat = 0
      let lon = 0
      for (const n of nodes) {
        lat += lats[n]
        lon += lons[n]
      }
      places.push({ name, alt: alts(tags, name), lat: lat / nodes.length, lon: lon / nodes.length, kind })
    },
  })

  for (const r of relations) {
    let lat = 0
    let lon = 0
    let n = 0
    for (const w of r.ways) {
      for (const node of wayNodes.get(w) ?? []) {
        lat += lats[node]
        lon += lons[node]
        n++
      }
    }
    if (n > 0) places.push({ name: r.name, alt: r.alt, lat: lat / n, lon: lon / n, kind: r.kind })
  }

  // Pieces of one street name group into streets; the longest piece stands for each,
  // weighted by the street's class and how long it is.
  for (const pieces of streets.values()) {
    const groups: (typeof pieces)[] = []
    for (const piece of pieces.sort((a, b) => b.length - a.length)) {
      const group = groups.find((g) => meters(g[0].lat, g[0].lon, piece.lat, piece.lon) < SAME_STREET_M)
      if (group) group.push(piece)
      else groups.push([piece])
    }
    for (const group of groups) {
      const [longest] = group
      const length = group.reduce((m, p) => m + p.length, 0)
      const weight = Math.max(...group.map((p) => p.weight)) + Math.min(LENGTH_BONUS, (length / 20_000) * LENGTH_BONUS)
      places.push({ name: longest.name, alt: [], lat: longest.lat, lon: longest.lon, kind: { label: 'Jalan', weight } })
    }
  }

  // One entry per name and spot: the weightier kind wins (a mall over the building it is in).
  places.sort((a, b) => b.kind.weight - a.kind.weight)
  const grid = new Map<string, Candidate[]>()
  const cell = (lat: number, lon: number) => `${Math.floor(lat / 0.005)},${Math.floor(lon / 0.005)}`
  const kept: Candidate[] = []
  for (const p of places) {
    const key = sameKey(p)
    // Big places (a station, a mall) have entrances and outlines far from their middle.
    const within = p.kind.weight >= 3 ? SAME_PLACE_M * 3 : SAME_PLACE_M
    const [cy, cx] = cell(p.lat, p.lon).split(',').map(Number)
    let dup = false
    for (let dy = -1; dy <= 1 && !dup; dy++) {
      for (let dx = -1; dx <= 1 && !dup; dx++) {
        dup = (grid.get(`${cy + dy},${cx + dx}`) ?? []).some((q) => sameKey(q) === key && meters(q.lat, q.lon, p.lat, p.lon) < within)
      }
    }
    if (dup) continue
    kept.push(p)
    const c = cell(p.lat, p.lon)
    grid.set(c, [...(grid.get(c) ?? []), p])
  }

  // The neighbourhood each place is in, for the line under its name.
  const areaGrid = new Map<string, number[]>()
  const areaCell = (lat: number, lon: number) => `${Math.floor(lat / 0.03)},${Math.floor(lon / 0.03)}`
  areas.forEach((a, i) => areaGrid.set(areaCell(a.lat, a.lon), [...(areaGrid.get(areaCell(a.lat, a.lon)) ?? []), i]))
  const nearestArea = (p: Candidate) => {
    const [cy, cx] = areaCell(p.lat, p.lon).split(',').map(Number)
    let best = -1
    let bestM = AREA_M
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const i of areaGrid.get(`${cy + dy},${cx + dx}`) ?? []) {
          const d = meters(areas[i].lat, areas[i].lon, p.lat, p.lon)
          if (d < bestM && areas[i].name !== p.name) {
            bestM = d
            best = i
          }
        }
      }
    }
    return best
  }

  const labels: string[] = []
  const areaNames: string[] = []
  const areaIndex = new Map<number, number>()
  const file: PlacesFile = {
    version: PLACES_VERSION,
    builtAt: builtAt.toISOString(),
    labels,
    areas: areaNames,
    name: [],
    alt: [],
    lat: [],
    lon: [],
    kind: [],
    weight: [],
    area: [],
  }
  for (const p of kept) {
    let k = labels.indexOf(p.kind.label)
    if (k < 0) k = labels.push(p.kind.label) - 1
    const a = nearestArea(p)
    let ai = -1
    if (a >= 0) {
      ai = areaIndex.get(a) ?? areaNames.push(areas[a].name) - 1
      areaIndex.set(a, ai)
    }
    file.name.push(p.name)
    file.alt.push(p.alt.join('|'))
    file.lat.push(Math.round(p.lat * COORD))
    file.lon.push(Math.round(p.lon * COORD))
    file.kind.push(k)
    file.weight.push(p.kind.weight)
    file.area.push(ai)
  }
  return file
}

const named = (t: Tags) => (t.get('name') ?? '').replace(/\s+/g, ' ').trim()

const alts = (t: Tags, name: string) =>
  [...new Set(['short_name', 'alt_name', 'official_name', 'brand', 'name:id'].flatMap((k) => (t.get(k) ?? '').split(';')))]
    .map((s) => s.trim())
    .filter((s) => s && s !== name)

/** A name for spotting duplicates: "Stasiun Bekasi" and "Bekasi" are the same station. */
function sameKey(p: Candidate): string {
  const w = words(p.name)
  const lead = { Stasiun: 'stasiun', 'Terminal bus': 'terminal' }[p.kind.label]
  return (lead && w[0] === lead ? w.slice(1) : w).join(' ')
}

function meters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const k = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  return Math.hypot((lon2 - lon1) * k * 111_320, (lat2 - lat1) * 111_320)
}
