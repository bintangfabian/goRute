import type { Status } from '../../shared/api.ts'
import { loadTimetable } from '../../server/timetable/timetable.ts'

/** GET /api/v1/status */
export function GET(): Response {
  const tt = loadTimetable()
  const status: Status = { api: 'ok', feeds: tt.feeds.map((f) => f.name), builtAt: tt.builtAt }
  return Response.json(status, { headers: { 'Cache-Control': 'public, s-maxage=300' } })
}
