// Compiles the OpenStreetMap extracts in data/raw/ (see pnpm data:fetch) into
// data/walk.bin, the paths walks follow. Run after build-timetable.ts: transfers
// between haltes are walked along the paths and stored per timetable stop.
// Usage: pnpm data:build

import { access, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { encodeWalk } from '../server/walk/format.ts'
import { WalkNetwork } from '../server/walk/network.ts'
import { pathTransfers, Walking } from '../server/walk/walking.ts'
import { loadTimetable } from '../server/timetable/timetable.ts'
import { OSM, PLACES_FILE, RAW_DIR, WALK_FILE } from './feeds.ts'
import { buildPlacesFile } from './osm/places.ts'
import { buildWalkFile } from './osm/walk.ts'

const highways = new URL(OSM.highways, RAW_DIR)
const placesPbf = new URL(OSM.places, RAW_DIR)
for (const [url, name] of [[highways, OSM.highways], [placesPbf, OSM.places]] as const) {
  await access(url).catch(() => {
    throw new Error(`data/raw/${name} tidak ada. Jalankan dulu: pnpm data:fetch`)
  })
}

const started = performance.now()
const tt = loadTimetable()
const file = buildWalkFile(highways.pathname, { id: tt.stopId, lat: [...tt.stopLat], lon: [...tt.stopLon] }, new Date())
const walking = new Walking(new WalkNetwork(file), tt)
Object.assign(file, pathTransfers(walking))

const bytes = encodeWalk(file)
await writeFile(WALK_FILE, bytes)

const snapped = walking.stopSnap.filter(Boolean).length
console.log(
  `data/walk.bin: ${(bytes.length / 1e6).toFixed(1)} MB · ${file.lat.length} titik · ` +
    `${file.chainNodes.length - file.chainName.length} ruas · ${file.names.length} nama jalan · ` +
    `${snapped}/${tt.stopCount} halte di jalur · ${file.transferStop.length} transfer · ` +
    `${((performance.now() - started) / 1000).toFixed(0)} detik`,
)

const places = buildPlacesFile(placesPbf.pathname, new Date(), { lat: [...tt.stopLat], lon: [...tt.stopLon] })
const placesBytes = gzipSync(JSON.stringify(places), { level: 9 })
await writeFile(PLACES_FILE, placesBytes)
const byLabel = new Map<string, number>()
for (const k of places.kind) byLabel.set(places.labels[k], (byLabel.get(places.labels[k]) ?? 0) + 1)
console.log(
  `data/places.json.gz: ${(placesBytes.length / 1e6).toFixed(1)} MB · ${places.name.length} tempat · ` +
    [...byLabel].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, n]) => `${n} ${label.toLowerCase()}`).join(', '),
)
