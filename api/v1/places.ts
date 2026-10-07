import type { PlaceResult } from '../../shared/api.ts'
import { inServiceArea } from '../../shared/region.ts'
import { searchPlaces as geocode } from '../../server/geocode.ts'
import { errorResponse } from '../../server/http.ts'
import { loadPlaces } from '../../server/places.ts'

/** With fewer places than this from our index, the public geocoder is asked as well. */
const ENOUGH = 3
/** How long the geocoder may take when our index already answered: it is slow, and only adds addresses. */
const GEOCODER_EXTRA_MS = 3000
const GEOCODER_ONLY_MS = 8000
/** Without a hint of where the rider is, central Jakarta: most trips start or end there. */
const MONAS = { lat: -6.1754, lon: 106.8272 }

/** GET /api/v1/places?q=[&lat&lon] — lat/lon (the other end of the trip) puts nearby places first. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const q = (params.get('q') ?? '').trim()
  if ([...q].length < 2) return Response.json({ places: [] as PlaceResult[] })
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const near = params.has('lat') && inServiceArea(lat, lon) ? { lat, lon } : MONAS

  const index = loadPlaces()
  const found = index?.search(q, near) ?? []
  let places = found
  if (found.length < ENOUGH) {
    try {
      places = merge(found, await geocode(q, AbortSignal.timeout(index ? GEOCODER_EXTRA_MS : GEOCODER_ONLY_MS)))
    } catch (err) {
      console.warn('place search: geocoder failed', err)
      // Our own index answered; a slow or failing geocoder is no error for the rider.
      if (!index) return errorResponse(502, 'Pencarian tempat sedang bermasalah. Coba lagi sebentar.')
    }
  }
  // Served from Vercel's CDN on repeat queries, so they cost no function time.
  return Response.json({ places }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
}

/** Our places first, then geocoder places that are not one of them again (same name, within ~200 m). */
function merge(ours: PlaceResult[], theirs: PlaceResult[]): PlaceResult[] {
  const same = (a: PlaceResult, b: PlaceResult) =>
    a.name.toLowerCase() === b.name.toLowerCase() && Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002
  return [...ours, ...theirs.filter((p) => !ours.some((o) => same(o, p)))].slice(0, 6)
}
