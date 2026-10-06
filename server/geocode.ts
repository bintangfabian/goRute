// Place search through a Photon geocoder (OSM-based). The public instance
// is fine for development; set PHOTON_URL to a self-hosted one for real traffic.

import type { PlaceResult } from '../shared/api.ts'
import { JABODETABEK } from '../shared/region.ts'

const USER_AGENT = 'goRute/0.1 (+https://github.com/bintangfabian/goRute)'
const MAX_RESULTS = 6

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const b = JABODETABEK
  const url = new URL('/api/', process.env.PHOTON_URL || 'https://photon.komoot.io')
  url.search = new URLSearchParams({
    q: query,
    limit: String(MAX_RESULTS * 2), // headroom for duplicates
    bbox: [b.minLon, b.minLat, b.maxLon, b.maxLat].join(','),
    lat: ((b.minLat + b.maxLat) / 2).toFixed(4),
    lon: ((b.minLon + b.maxLon) / 2).toFixed(4),
  }).toString()

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal })
  if (!res.ok) throw new Error(`photon: ${res.status} ${res.statusText}`)
  return toPlaces((await res.json()) as FeatureCollection)
}

export type FeatureCollection = {
  features: {
    geometry: { coordinates: [number, number] }
    properties: {
      osm_type?: string
      osm_id?: number
      name?: string
      street?: string
      district?: string
      city?: string
      county?: string
      state?: string
    }
  }[]
}

export function toPlaces(fc: FeatureCollection): PlaceResult[] {
  const seen = new Set<string>()
  const places: PlaceResult[] = []
  for (const f of fc.features) {
    const p = f.properties
    const [lon, lat] = f.geometry.coordinates
    if (!p.name) continue
    // Photon often returns one place twice (e.g. a relation and its label
    // node); collapse matches within ~100 m.
    const key = `${p.name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)
    places.push({
      id: `${p.osm_type ?? ''}${p.osm_id ?? places.length}`,
      name: p.name,
      address: address(p.name, [p.street, p.district, p.city, p.county, p.state]),
      lat,
      lon,
    })
    if (places.length === MAX_RESULTS) break
  }
  return places
}

/** Up to three distinct, non-empty parts that differ from the place name. */
function address(name: string, parts: (string | undefined)[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === name || out.includes(part)) continue
    out.push(part)
    if (out.length === 3) break
  }
  return out.join(', ')
}
