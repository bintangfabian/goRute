// Downloads every feed in scripts/feeds.ts into data/raw/.
// Usage: pnpm data:fetch

import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { FEEDS, RAW_DIR } from './feeds.ts'

await mkdir(RAW_DIR, { recursive: true })

for (const feed of FEEDS) {
  console.log(`${feed.name}: ${feed.url}`)
  const res = await fetch(feed.url, { signal: AbortSignal.timeout(5 * 60_000) })
  if (!res.ok) throw new Error(`${feed.url}: ${res.status} ${res.statusText}`)
  const body = new Uint8Array(await res.arrayBuffer())

  // Write next to the target first so a failed download never replaces a good copy.
  const target = new URL(feed.file, RAW_DIR)
  const part = new URL(`${feed.file}.part`, RAW_DIR)
  try {
    await writeFile(part, body)
    await rename(part, target)
  } finally {
    await rm(part, { force: true })
  }
  console.log(`  → data/raw/${feed.file} (${(body.length / 1e6).toFixed(1)} MB)`)
}
