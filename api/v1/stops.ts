import type { PlaceResult } from '../../shared/api.ts'
import { searchStops } from '../../server/stops.ts'
import { loadTimetable } from '../../server/timetable/timetable.ts'

/** GET /api/v1/stops?q= */
export function GET(request: Request): Response {
  // No halte name is longer; a longer query would only take longer.
  const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 100)
  const places: PlaceResult[] = searchStops(loadTimetable(), q)
  // Answers come from the bundled timetable, so they only change with a deploy.
  return Response.json({ places }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
}
