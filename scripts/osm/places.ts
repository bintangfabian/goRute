// Builds the place search index (data/places.json.gz) from named OpenStreetMap
// features: landmarks, shops and offices, neighbourhoods, and streets, each with
// the village, district and city it lies in.

import { words } from '../../server/stops.ts'
import { PLACES_VERSION, type PlacesFile } from '../../server/places.ts'
import { inServiceArea } from '../../shared/region.ts'
import { Areas, joinRings } from './areas.ts'
import { readOsm, type Tags } from './pbf.ts'

/** Same-named places this close are one place: a building and its label, two entrances. */
const SAME_PLACE_M = 150
/** Stretches of a street name this far apart are different streets (every town has a Jalan Merdeka). */
const SAME_STREET_M = 1500
/** A place's neighbourhood is the nearest one within this distance. */
const AREA_M = 3000
/** A bus station this close to a halte of the timetable is that halte, which the halte search already finds. */
const ON_HALTE_M = 150
/** How much more a place matters when it has a Wikipedia article: the national mosque over a village prayer room. */
const NOTABLE = 0.5
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

/** Kinds that only say what a feature is made of; one with the name of a place next to it is that place. */
const OUTLINES = new Set(['Gedung', 'Apartemen', 'Kawasan', 'Lingkungan', 'Perumahan', 'Fasilitas umum', 'Wisata', 'Olahraga & rekreasi'])
/** Offices of an RT or RW, the smallest neighbourhood units, often mapped as government offices. */
const NEIGHBOURHOOD_OFFICE = /\b(rt|rw)\s*\.?\s*\d|^(sekretariat|pos|posko|kantor|balai)\s+(rt|rw)\b/i
const RAIL_MODES = ['train', 'subway', 'light_rail', 'monorail']

type Level = 'village' | 'district' | 'city' | 'estate'
/** The order of a region's areas in the index. */
const LEVELS: Level[] = ['village', 'district', 'city', 'estate']
/** Indonesia's administrative levels in OpenStreetMap: kota or kabupaten, kecamatan, kelurahan or desa. */
const ADMIN_LEVELS: Record<string, Level> = { '5': 'city', '6': 'district', '7': 'village' }
/** Named estates and neighbourhoods drawn as areas, which riders often know better than the village: BSD City, Bintaro Jaya. */
const ESTATES = new Set(['suburb', 'quarter', 'neighbourhood'])
/** Left out of initials: RSCM is Rumah Sakit Dr. Cipto Mangunkusumo, RSJPDHK Rumah Sakit Jantung dan Pembuluh Darah Harapan Kita. */
const UNINITIALED = new Set(['dan', 'di', 'ke', 'dr', 'prof', 'h', 'hj', 'ir'])

/**
 * What riders call places, matched against the whole name spelled out by words().
 * Typed whole, a nickname finds its place first wherever the rider is: "tim" is
 * Taman Ismail Marzuki from Bekasi too, not Bekasi Timur. Initials no other place
 * shares (UNJ) and names mapped in OpenStreetMap (UI, PIM, Sency) need no entry.
 */
const NICKNAMES: [nickname: string, name: RegExp, city?: string][] = [
  ['Ambassador', /^mall ambasador$/],
  // Not the DPRD of every city and regency, which starts with the same words.
  ['DPR', /^dewan perwakilan rakyat( majelis permusyawaratan rakyat)?$/],
  ['Gedung DPR', /^dewan perwakilan rakyat( majelis permusyawaratan rakyat)?$/],
  ['MPR', /\bmajelis permusyawaratan rakyat$/],
  ['FX Sudirman', /^fx mall$/],
  ['Istiqlal', /^masjid istiqlal$/],
  ['GBK', /^stadion utama gelora bung karno$/],
  // The avenue in Jakarta Pusat: Bekasi and Tangerang have a Jalan MH Thamrin too, nearer from Bogor.
  ['Jalan MH Thamrin', /^jalan mohammad husni thamrin$/, 'Jakarta Pusat'],
  ['MH Thamrin', /^jalan mohammad husni thamrin$/, 'Jakarta Pusat'],
  ['McD', /^mcdonald s\b/],
  ['Mekdi', /^mcdonald s\b/],
  ['Jalan Sabang', /^jalan haji agus salim$/, 'Jakarta Pusat'],
  ['Kokas', /^kota kasablanka$/],
  ['KPK', /^komisi pemberantasan korupsi$/],
  ['Museum Gajah', /^museum nasional( indonesia)?$/],
  ['Pasar Tanah Abang', /^tanah abang market$/],
  ['PRJ', /^jiexpo\b/],
  // RS Citra Medika and RS Cibitung Medika spell RSCM too, and are nearer from Depok and Bekasi.
  ['RSCM', /^rumah sakit (dr )?cipto mangunkusumo$/],
  ['Soetta', /^bandar udara internasional soekarno hatta$/],
  ['Tanjung Priok', /^tanjung priuk$/],
  ['TIM', /^taman ismail marzuki$/],
  ['Ubhara Jaya', /^universitas bhayangkara\b/],
  ['Uhamka', /^universitas muhammadiyah prof dr hamka\b/],
  ['UIN Jakarta', /^uin syarif hidayatullah\b/],
  ['Unas', /^universitas nasional\b/],
  ['Unindra', /^universitas indraprasta\b/],
  ['Unpam', /^universitas pamulang\b/],
  ['UPN Veteran Jakarta', /^universitas pembangunan nasional veteran jakarta\b/],
  ['Untar', /^universitas tarumanagara\b/],
  ['Usakti', /^universitas trisakti\b/],
]

/** What a named feature is, in words a rider knows, and how much it usually matters; null to leave it out. */
export function placeKind(t: Tags): Kind | null {
  const has = (k: string, ...vals: string[]) => (vals.length ? vals.includes(t.get(k) ?? '') : t.has(k))
  const amenity = t.get('amenity') ?? ''
  if (has('aeroway', 'aerodrome', 'terminal')) return { label: 'Bandara', weight: 3 }
  // A closed station (Karet, since September 2026) is nowhere to go.
  if (t.has('disused:railway') || t.has('abandoned:railway')) return null
  // Trains only: BRT haltes are mapped as stations too.
  if (has('railway', 'station', 'halt') || (has('public_transport', 'station') && RAIL_MODES.some((m) => t.get(m) === 'yes'))) {
    return { label: 'Stasiun', weight: 3 }
  }
  if (amenity === 'bus_station' || has('public_transport', 'station')) return { label: 'Terminal bus', weight: 3 }
  if (has('shop', 'mall', 'department_store')) return { label: 'Mal', weight: 3 }
  if (amenity === 'hospital') return { label: 'Rumah sakit', weight: 3 }
  if (amenity === 'university' || amenity === 'college') return { label: 'Kampus', weight: 3 }
  if (has('tourism', 'museum')) return { label: 'Museum', weight: 3 }
  if (has('tourism', 'attraction', 'zoo', 'theme_park', 'aquarium', 'viewpoint')) return { label: 'Tempat wisata', weight: 3 }
  if (amenity === 'townhall' || has('office', 'government')) {
    return NEIGHBOURHOOD_OFFICE.test(t.get('name') ?? '') ? { label: 'Kantor', weight: 1 } : { label: 'Kantor pemerintahan', weight: 3 }
  }
  if (has('leisure', 'stadium')) return { label: 'Stadion', weight: 3 }
  if (has('place', 'city')) return { label: 'Kota', weight: 3 }
  if (has('place', 'town', 'suburb', 'city_district', 'quarter')) return { label: 'Kawasan', weight: 2 }
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

/**
 * The initials riders type for a long name: "pim 2" for Pondok Indah Mall 2,
 * "unj" for Universitas Negeri Jakarta. Empty for names too short or too odd
 * to have any (two letters would match too much).
 */
export function initials(name: string): string {
  const w = words(name).filter((x) => !UNINITIALED.has(x))
  const numbers: string[] = []
  while (w.length > 0 && /^\d+$/.test(w[w.length - 1])) numbers.unshift(w.pop()!)
  if (w.length < 3 || w.length > 7 || w.some((x) => !/^[a-z]/.test(x))) return ''
  return [w.map((x) => x[0]).join(''), ...numbers].join(' ')
}

/** City and regency names as riders write them: "Kab. Bogor", while Kota Bogor is just Bogor. */
export function cityName(name: string): string {
  return name.replace(/^Kota\s+(Administrasi\s+|Adm\.?\s+)?/i, '').replace(/^(Kabupaten|Kab\.?)\s+/i, 'Kab. ')
}

function areaLevel(t: Tags): Level | null {
  const type = t.get('type')
  if (type !== 'boundary' && type !== 'multipolygon') return null
  if (t.get('boundary') === 'administrative') return ADMIN_LEVELS[t.get('admin_level') ?? ''] ?? null
  return ESTATES.has(t.get('place') ?? '') ? 'estate' : null
}

type Candidate = { name: string; alt: string[]; nicknames?: string[]; lat: number; lon: number; kind: Kind; notable: boolean }

const notable = (t: Tags) => t.has('wikidata') || t.has('wikipedia')

/**
 * Builds the index from a PBF of named features with the nodes and ways they
 * are made of. `haltes` are the timetable's stops: bus stations on them are left
 * to the halte search.
 */
export function buildPlacesFile(pbfPath: string, builtAt: Date, haltes: { lat: number[]; lon: number[] } = { lat: [], lon: [] }): PlacesFile {
  // Areas mapped as relations (big mosques, stadiums, campuses) are found at the middle of their outer ways.
  const relations: { name: string; alt: string[]; kind: Kind; notable: boolean; ways: number[] }[] = []
  // Cities, districts, villages and estates, by the ways around them.
  const outlines: { name: string; level: Level; ways: number[] }[] = []
  const memberWays = new Set<number>()
  readOsm(pbfPath, {
    relation(_id, members, tags) {
      const name = named(tags)
      const level = name ? areaLevel(tags) : null
      if (level) {
        const ways = members.filter((m) => m.type === 'way').map((m) => m.ref)
        for (const w of ways) memberWays.add(w)
        outlines.push({ name: level === 'city' ? cityName(name) : name, level, ways })
      }
      const kind = name && tags.get('type') === 'multipolygon' ? placeKind(tags) : null
      if (!kind) return
      const ways = members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => m.ref)
      if (ways.length === 0) return
      for (const w of ways) memberWays.add(w)
      relations.push({ name, alt: alts(tags, name), kind, notable: notable(tags), ways })
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
  const streets = new Map<string, { name: string; lat: number; lon: number; length: number; weight: number; ends: [number, number] }[]>()
  const areas: { name: string; lat: number; lon: number }[] = []
  const estateWays: { name: string; nodes: number[] }[] = []

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
      if (kind) places.push({ name, alt: alts(tags, name), lat, lon, kind, notable: notable(tags) })
    },
    way(id, refs, tags) {
      const nodes = refs.map(at).filter((i) => i >= 0)
      if (memberWays.has(id)) wayNodes.set(id, nodes)
      const name = named(tags)
      if (!name || nodes.length === 0) return
      if (ESTATES.has(tags.get('place') ?? '') && nodes.length >= 4 && nodes[0] === nodes[nodes.length - 1]) estateWays.push({ name, nodes })
      const highway = tags.get('highway')
      if (highway) {
        if (!(highway in STREETS)) return
        // The middle node stands for the street piece; its length picks the piece that stands for the street.
        const mid = nodes[nodes.length >> 1]
        let length = 0
        for (let i = 1; i < nodes.length; i++) length += meters(lats[nodes[i - 1]], lons[nodes[i - 1]], lats[nodes[i]], lons[nodes[i]])
        const key = words(name).join(' ')
        const list = streets.get(key) ?? []
        list.push({ name, lat: lats[mid], lon: lons[mid], length, weight: STREETS[highway], ends: [nodes[0], nodes[nodes.length - 1]] })
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
      places.push({ name, alt: alts(tags, name), lat: lat / nodes.length, lon: lon / nodes.length, kind, notable: notable(tags) })
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
    if (n > 0) places.push({ name: r.name, alt: r.alt, lat: lat / n, lon: lon / n, kind: r.kind, notable: r.notable })
  }

  const outlined = Object.fromEntries(LEVELS.map((l) => [l, { areas: new Areas(), names: [] as string[] }])) as Record<
    Level,
    { areas: Areas; names: string[] }
  >
  const addOutline = (level: Level, name: string, rings: number[][]) => {
    const { areas: set, names } = outlined[level]
    names[set.add(rings.map((ring) => ring.flatMap((n) => [lons[n], lats[n]])))] = name
  }
  let unclosed = 0
  for (const o of outlines) {
    const ways = o.ways.map((w) => wayNodes.get(w) ?? [])
    const rings = ways.every((w) => w.length > 0) ? joinRings(ways) : null
    if (rings) addOutline(o.level, o.name, rings)
    else unclosed++
  }
  for (const e of estateWays) addOutline('estate', e.name, [e.nodes])
  if (unclosed > 0) console.warn(`${unclosed} wilayah tanpa batas lengkap dilewati`)

  // Pieces of one street name that meet are one street (every town has a Jalan Merdeka,
  // and they do not meet); a long one is cut in stretches, each found near its middle.
  // The longest piece stands for a stretch, weighted by the street's class and length.
  for (const pieces of streets.values()) {
    const parent = pieces.map((_, i) => i)
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])))
    const atEnd = new Map<number, number>()
    pieces.forEach((piece, i) => {
      for (const node of piece.ends) {
        const other = atEnd.get(node)
        if (other === undefined) atEnd.set(node, i)
        else parent[root(i)] = root(other)
      }
    })
    const streetsOf = new Map<number, typeof pieces>()
    pieces.forEach((piece, i) => streetsOf.set(root(i), [...(streetsOf.get(root(i)) ?? []), piece]))
    for (const street of streetsOf.values()) {
      const stretches: (typeof pieces)[] = []
      for (const piece of street.sort((a, b) => b.length - a.length)) {
        const stretch = stretches.find((g) => meters(g[0].lat, g[0].lon, piece.lat, piece.lon) < SAME_STREET_M)
        if (stretch) stretch.push(piece)
        else stretches.push([piece])
      }
      for (const stretch of stretches) {
        const [longest] = stretch
        const length = stretch.reduce((m, p) => m + p.length, 0)
        const weight = Math.max(...stretch.map((p) => p.weight)) + Math.min(LENGTH_BONUS, (length / 20_000) * LENGTH_BONUS)
        places.push({ name: longest.name, alt: [], lat: longest.lat, lon: longest.lon, kind: { label: 'Jalan', weight }, notable: false })
      }
    }
  }

  // Bus stations on a halte, and the shelters mapped as buildings named after it ("Halte
  // Monumen Nasional"), are that halte, which the halte search finds with its routes.
  const halteGrid = new Map<string, number[]>()
  const halteCell = (lat: number, lon: number) => `${Math.floor(lat / 0.002)},${Math.floor(lon / 0.002)}`
  haltes.lat.forEach((lat, i) => {
    const c = halteCell(lat, haltes.lon[i])
    halteGrid.set(c, [...(halteGrid.get(c) ?? []), i])
  })
  const isHalte = (p: Candidate) => {
    if (p.kind.label !== 'Terminal bus' && (p.kind.label === 'Stasiun' || !/^halte\b/i.test(p.name))) return false
    const [cy, cx] = halteCell(p.lat, p.lon).split(',').map(Number)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const h of halteGrid.get(`${cy + dy},${cx + dx}`) ?? []) if (meters(haltes.lat[h], haltes.lon[h], p.lat, p.lon) < ON_HALTE_M) return true
      }
    }
    return false
  }

  // One entry per name and spot: the weightier kind wins (a mall over the building it
  // is in). Two different kinds of place are both kept: the train station Manggarai
  // and the bus terminal Manggarai next to it.
  places.sort((a, b) => b.kind.weight - a.kind.weight)
  const grid = new Map<string, Candidate[]>()
  const cell = (lat: number, lon: number) => `${Math.floor(lat / 0.005)},${Math.floor(lon / 0.005)}`
  const kept: Candidate[] = []
  for (const p of places) {
    if (!inServiceArea(p.lat, p.lon) || isHalte(p)) continue
    const key = sameKey(p)
    // Big places (a station, a mall) have entrances and outlines far from their middle.
    const within = p.kind.weight >= 3 ? SAME_PLACE_M * 3 : SAME_PLACE_M
    const same = (q: Candidate) =>
      sameKey(q) === key &&
      (q.kind.label === p.kind.label || OUTLINES.has(q.kind.label) || OUTLINES.has(p.kind.label)) &&
      meters(q.lat, q.lon, p.lat, p.lon) < within
    const [cy, cx] = cell(p.lat, p.lon).split(',').map(Number)
    let dup: Candidate | undefined
    for (let dy = -1; dy <= 1 && !dup; dy++) {
      for (let dx = -1; dx <= 1 && !dup; dx++) dup = (grid.get(`${cy + dy},${cx + dx}`) ?? []).find(same)
    }
    if (dup) {
      dup.notable ||= p.notable
      continue
    }
    kept.push(p)
    const c = cell(p.lat, p.lon)
    grid.set(c, [...(grid.get(c) ?? []), p])
  }

  // Without an outline around it (outside the mapped villages), a place's
  // neighbourhood is the nearest named one.
  const areaGrid = new Map<string, number[]>()
  const areaCell = (lat: number, lon: number) => `${Math.floor(lat / 0.03)},${Math.floor(lon / 0.03)}`
  areas.forEach((a, i) => areaGrid.set(areaCell(a.lat, a.lon), [...(areaGrid.get(areaCell(a.lat, a.lon)) ?? []), i]))
  const nearestArea = (p: Candidate) => {
    const [cy, cx] = areaCell(p.lat, p.lon).split(',').map(Number)
    let best = ''
    let bestM = AREA_M
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const i of areaGrid.get(`${cy + dy},${cx + dx}`) ?? []) {
          const d = meters(areas[i].lat, areas[i].lon, p.lat, p.lon)
          if (d < bestM && areas[i].name !== p.name) {
            bestM = d
            best = areas[i].name
          }
        }
      }
    }
    return best
  }

  // The village, district, city and estate of each place.
  const where = kept.map((p) =>
    LEVELS.map((l) => {
      const { areas: set, names } = outlined[l]
      const at = set.at(p.lat, p.lon)
      return at >= 0 ? names[at] : ''
    }),
  )
  kept.forEach((p, i) => {
    const text = words(p.name).join(' ')
    for (const [nickname, name, city] of NICKNAMES) {
      if (name.test(text) && (!city || city === where[i][2])) p.nicknames = [...(p.nicknames ?? []), nickname]
    }
  })

  // Campuses of one university share what people call it: UI is Salemba as well as Depok.
  const sameNamed = new Map<string, Candidate[]>()
  for (const p of kept) {
    if (p.kind.weight < 3) continue
    const key = `${p.kind.label}|${sameKey(p)}`
    sameNamed.set(key, [...(sameNamed.get(key) ?? []), p])
  }
  for (const group of sameNamed.values()) {
    if (group.length < 2 || group.length > 8) continue
    const all = [...new Set(group.flatMap((p) => p.alt))]
    for (const p of group) p.alt = all.filter((a) => a !== p.name)
  }

  // Initials only for places that matter, and none that another such place is already called by:
  // Puri Indah Mall is no "pim", that is Pondok Indah Mall.
  const calledBy = (p: Candidate) => [...p.alt, ...(p.nicknames ?? [])].map((a) => words(a)[0])
  const taken = new Set([...kept.filter((p) => p.kind.weight >= 3).flatMap(calledBy), ...kept.flatMap((p) => (p.nicknames ?? []).map((n) => words(n)[0]))])
  const initialsOf = (p: Candidate) => {
    if (p.kind.weight < 3 || p.kind.label === 'Jalan') return ''
    const found = initials(p.name)
    const letters = found.split(' ')[0]
    return found && taken.has(letters) && !calledBy(p).includes(letters) ? '' : found
  }

  const labels: string[] = []
  const areaNames: string[] = []
  const areaIndex = new Map<string, number>()
  const areaAt = (name: string) => {
    if (!name) return -1
    let i = areaIndex.get(name)
    if (i === undefined) {
      i = areaNames.push(name) - 1
      areaIndex.set(name, i)
    }
    return i
  }
  const regions: number[] = []
  const regionIndex = new Map<string, number>()
  const file: PlacesFile = {
    version: PLACES_VERSION,
    builtAt: builtAt.toISOString(),
    labels,
    areas: areaNames,
    regions,
    name: [],
    alt: [],
    nicknames: [],
    initials: [],
    lat: [],
    lon: [],
    kind: [],
    weight: [],
    area: [],
    region: [],
  }
  kept.forEach((p, i) => {
    let k = labels.indexOf(p.kind.label)
    if (k < 0) k = labels.push(p.kind.label) - 1
    const [village, district, city, estate] = where[i]
    // The line under the name says the estate or village (BSD City, Pondok Cina), not the place itself again.
    const own = words(p.name)
    const area = [estate, village, district].find((a) => a && !own.every((w) => words(a).includes(w))) ?? (village || district ? '' : nearestArea(p))
    const key = [village, district, city, estate].join('|')
    let region = regionIndex.get(key)
    if (region === undefined) {
      region = key === '|||' ? -1 : regions.push(areaAt(village), areaAt(district), areaAt(city), areaAt(estate)) / 4 - 1
      regionIndex.set(key, region)
    }
    file.name.push(p.name)
    file.alt.push(p.alt.join('|'))
    file.nicknames.push((p.nicknames ?? []).join('|'))
    file.initials.push(initialsOf(p))
    file.lat.push(Math.round(p.lat * COORD))
    file.lon.push(Math.round(p.lon * COORD))
    file.kind.push(k)
    file.weight.push(p.kind.weight + (p.notable ? NOTABLE : 0))
    file.area.push(areaAt(area))
    file.region.push(region)
  })
  return file
}

const named = (t: Tags) => (t.get('name') ?? '').replace(/\s+/g, ' ').trim()

const alts = (t: Tags, name: string) =>
  [...new Set(['short_name', 'alt_name', 'official_name', 'brand', 'name:id', 'iata'].flatMap((k) => (t.get(k) ?? '').split(/[;,]/)))]
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
