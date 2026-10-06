// Compiles the GTFS feeds in data/raw/ into data/timetable.json, the file
// the Vercel Functions route on. Commit the result so deploys need no data step.
// Usage: pnpm data:build

import { readFile, writeFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import { FEEDS, RAW_DIR, TIMETABLE_FILE } from './feeds.ts'
import { buildTimetable, type FeedFiles } from './gtfs/build.ts'

const feeds: FeedFiles[] = []
for (const feed of FEEDS) {
  const zip = await readFile(new URL(feed.file, RAW_DIR)).catch(() => {
    throw new Error(`data/raw/${feed.file} tidak ada. Jalankan dulu: pnpm data:fetch`)
  })
  const files = new Map<string, string>()
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    // Some feeds zip a folder; GTFS file names are what matter.
    files.set(name.split('/').pop()!, strFromU8(bytes))
  }
  feeds.push({ id: feed.id, name: feed.name, files })
}

const { timetable, warnings } = buildTimetable(feeds, new Date())
for (const w of warnings.slice(0, 20)) console.warn(`peringatan: ${w}`)
if (warnings.length > 20) console.warn(`… dan ${warnings.length - 20} peringatan lain`)

const json = JSON.stringify(timetable)
await writeFile(TIMETABLE_FILE, json)

const trips = timetable.patterns.reduce((n, p) => n + p.starts.length, 0)
console.log(
  `data/timetable.json: ${(json.length / 1e6).toFixed(1)} MB · ${timetable.stops.id.length} halte · ` +
    `${timetable.routes.length} rute · ${timetable.patterns.length} pola · ${trips} perjalanan`,
)
