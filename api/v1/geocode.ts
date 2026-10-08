import type { PlacesAnswer } from '../../shared/api.ts'
import { searchPlaces } from '../../server/geocode.ts'
import { errorResponse } from '../../server/http.ts'
import { GEOCODER_MIN, placeQuery } from '../../server/placeQuery.ts'

/** Photon takes 2 to 9 seconds; the rider already sees our own places while it answers. */
const TIMEOUT_MS = 8000

/**
 * GET /api/v1/geocode?q=[&lat&lon] — places from the public geocoder (Photon), for queries
 * our own index barely knows (when /api/v1/places says `more`). The app lists them after ours.
 */
export async function GET(request: Request): Promise<Response> {
  const { q, letters, near } = placeQuery(request)
  if (letters < GEOCODER_MIN) return Response.json({ places: [] } satisfies PlacesAnswer)
  try {
    const places = await searchPlaces(q, AbortSignal.timeout(TIMEOUT_MS), near ?? undefined)
    // Served from Vercel's CDN on repeat queries. A failure below is not kept at all, so a
    // short outage never sticks.
    return Response.json({ places } satisfies PlacesAnswer, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    })
  } catch (err) {
    console.warn('geocoder failed', err)
    return errorResponse(502, 'Pencarian tempat lain sedang bermasalah.')
  }
}
