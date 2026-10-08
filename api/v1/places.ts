import type { PlaceResult } from '../../shared/api.ts'
import { inServiceArea } from '../../shared/region.ts'
import { searchPlaces as geocode } from '../../server/geocode.ts'
import { errorResponse } from '../../server/http.ts'
import { loadPlaces } from '../../server/places.ts'
import { words } from '../../server/stops.ts'

/** With fewer places than this from our index, the public geocoder is asked as well. */
const ENOUGH = 3
/** How long the geocoder may take when our index already answered: it is slow, and only adds addresses. */
const GEOCODER_EXTRA_MS = 3000
const GEOCODER_ONLY_MS = 8000
/** Without a hint of where the rider is, central Jakarta: most trips start or end there. */
const MONAS = { lat: -6.1754, lon: 106.8272 }
/** Longer queries are cut: no place name is this long, and the search would only take longer. */
const MAX_QUERY = 100
/** The geocoder needs a few letters to find anything worth showing. */
const GEOCODER_MIN = 3

/** GET /api/v1/places?q=[&lat&lon] — lat/lon (the other end of the trip) puts nearby places first. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY)
  const letters = words(q).join('').length
  // Nothing searchable ("...", an emoji): no answer to look for, nor to cache.
  if (letters < 2) return Response.json({ places: [] as PlaceResult[] })
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const near = params.has('lat') && inServiceArea(lat, lon) ? { lat, lon } : MONAS

  const index = loadPlaces()
  const found = index?.search(q, near) ?? []
  let places = found
  let complete = true
  if (found.length < ENOUGH && letters >= GEOCODER_MIN) {
    try {
      places = merge(found, await geocode(q, AbortSignal.timeout(index ? GEOCODER_EXTRA_MS : GEOCODER_ONLY_MS)))
    } catch (err) {
      console.warn('place search: geocoder failed', err)
      // Our own index answered; a slow or failing geocoder is no error for the rider.
      if (!index) return errorResponse(502, 'Pencarian tempat sedang bermasalah. Coba lagi sebentar.')
      complete = false
    }
  }
  // Served from Vercel's CDN on repeat queries, so they cost no function time. An answer
  // missing the geocoder's part is kept only briefly: a short outage must not stick for days.
  const cache = complete ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=60'
  return Response.json({ places }, { headers: { 'Cache-Control': cache } })
}

/** Our places first, then geocoder places that are not one of them again (same name, within ~200 m). */
function merge(ours: PlaceResult[], theirs: PlaceResult[]): PlaceResult[] {
  const same = (a: PlaceResult, b: PlaceResult) =>
    a.name.toLowerCase() === b.name.toLowerCase() && Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002
  return [...ours, ...theirs.filter((p) => !ours.some((o) => same(o, p)))].slice(0, 6)
}
