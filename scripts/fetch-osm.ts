// Downloads Geofabrik's OpenStreetMap extract of Java and cuts the service area
// out of it with osmium: the ways people walk and the named places, for
// pnpm data:build. Needs osmium-tool (brew install osmium-tool, or
// apt install osmium-tool).
// Usage: pnpm data:fetch

import { execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { JABODETABEK } from '../shared/region.ts'
import { OSM, RAW_DIR } from './feeds.ts'

/** Geofabrik refreshes the extract daily; a copy younger than this is kept. */
const MAX_AGE_DAYS = 7

/**
 * Named features worth searching for (scripts/osm/places.ts decides what each is), named
 * streets, and the outlines of cities, districts and villages that say where they are.
 */
const PLACE_FILTERS = [
  'nwr/amenity',
  'nwr/shop',
  'nwr/office',
  'nwr/tourism',
  'nwr/leisure',
  'nwr/healthcare',
  'nwr/craft',
  'nwr/railway=station,halt',
  'nwr/public_transport=station',
  'nwr/aeroway=aerodrome,terminal',
  'nwr/place',
  'nwr/historic',
  'nwr/building',
  'nwr/landuse=residential,retail,commercial,industrial',
  'w/highway',
  'r/admin_level=5,6,7',
]

const osmium = (...args: string[]) => execFileSync('osmium', args, { stdio: 'inherit' })
const raw = (file: string) => new URL(file, RAW_DIR).pathname

try {
  execFileSync('osmium', ['--version'], { stdio: 'ignore' })
} catch {
  throw new Error('osmium tidak ditemukan. Pasang dulu: brew install osmium-tool (macOS) atau apt install osmium-tool (Linux).')
}

await mkdir(RAW_DIR, { recursive: true })
const java = new URL(OSM.file, RAW_DIR)
const ageDays = await stat(java).then(
  (s) => (Date.now() - s.mtimeMs) / 86_400_000,
  () => Infinity,
)
if (ageDays > MAX_AGE_DAYS) {
  console.log(`OpenStreetMap Jawa: ${OSM.url}`)
  const res = await fetch(OSM.url)
  if (!res.ok || !res.body) throw new Error(`${OSM.url}: ${res.status} ${res.statusText}`)
  // Next to the target first, so a failed download never replaces a good copy.
  const part = raw(`${OSM.file}.part`)
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part))
    await rename(part, java)
  } finally {
    await rm(part, { force: true })
  }
} else {
  console.log(`OpenStreetMap Jawa: data/raw/${OSM.file} (${ageDays.toFixed(0)} hari), tidak diunduh ulang`)
}

const b = JABODETABEK
const area = raw('jabodetabek.osm.pbf')
const named = raw('jabodetabek-named.osm.pbf')
// "smart" keeps whole ways, and the members of areas and boundaries that cross the edge.
osmium('extract', '--overwrite', '--strategy=smart', '-S', 'types=multipolygon,boundary', '-b', `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`, '-o', area, java.pathname)
osmium('tags-filter', '--overwrite', '-o', raw(OSM.highways), area, 'w/highway')
osmium('tags-filter', '--overwrite', '-o', named, area, 'nwr/name')
osmium('tags-filter', '--overwrite', '-o', raw(OSM.places), named, ...PLACE_FILTERS)
await rm(named, { force: true })
console.log(`  → data/raw/${OSM.highways}, data/raw/${OSM.places}`)
