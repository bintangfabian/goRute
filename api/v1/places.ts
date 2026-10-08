import type { PlacesAnswer } from '../../shared/api.ts'
import { searchPlaces as geocode } from '../../server/geocode.ts'
import { errorResponse } from '../../server/http.ts'
import { GEOCODER_MIN, MONAS, placeQuery } from '../../server/placeQuery.ts'
import { loadPlaces } from '../../server/places.ts'

/** With fewer places than this from our index, the public geocoder may find more: the answer says so. */
const ENOUGH = 3
/** Without our index, the geocoder is all there is, slow as it is. */
const GEOCODER_ONLY_MS = 8000
/** Our index only changes with a deploy: repeat queries are served from Vercel's CDN, costing no function time. */
const CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800'

/**
 * GET /api/v1/places?q=[&lat&lon] — places from our own index, at once; lat/lon (the other
 * end of the trip) puts nearby places first. `more` says the public geocoder may add some,
 * which the app asks /api/v1/geocode for and shows when they come.
 */
export async function GET(request: Request): Promise<Response> {
  const { q, letters, near } = placeQuery(request)
  if (letters < 2) return Response.json({ places: [] } satisfies PlacesAnswer)
  const index = loadPlaces()
  if (index) {
    const places = index.search(q, near ?? MONAS)
    const more = places.length < ENOUGH && letters >= GEOCODER_MIN
    return Response.json({ places, more } satisfies PlacesAnswer, { headers: { 'Cache-Control': CACHE } })
  }
  // Without data/places.json.gz, the geocoder answers instead, however long it takes.
  if (letters < GEOCODER_MIN) return Response.json({ places: [] } satisfies PlacesAnswer)
  try {
    const places = await geocode(q, AbortSignal.timeout(GEOCODER_ONLY_MS), near ?? undefined)
    return Response.json({ places } satisfies PlacesAnswer, { headers: { 'Cache-Control': CACHE } })
  } catch (err) {
    console.warn('place search: geocoder failed', err)
    return errorResponse(502, 'Pencarian tempat sedang bermasalah. Coba lagi sebentar.')
  }
}
