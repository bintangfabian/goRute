import type { PlaceResult } from '../../shared/api.ts'
import { searchPlaces } from '../../server/geocode.ts'
import { errorResponse } from '../../server/http.ts'

/** GET /api/v1/places?q= */
export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if ([...q].length < 2) return Response.json({ places: [] as PlaceResult[] })
  try {
    const places = await searchPlaces(q, AbortSignal.timeout(8000))
    // Served from Vercel's CDN on repeat queries, so they cost no function time.
    return Response.json({ places }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
  } catch (err) {
    console.warn('place search failed', err)
    return errorResponse(502, 'Pencarian tempat sedang bermasalah. Coba lagi sebentar.')
  }
}
