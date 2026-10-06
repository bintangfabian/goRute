import { errorResponse } from '../../server/http.ts'
import { planTrip } from '../../server/planner/plan.ts'
import { parsePlanRequest } from '../../server/request.ts'
import { loadTimetable } from '../../server/timetable/timetable.ts'

/** GET /api/v1/plan?fromLat&fromLon&toLat&toLon[&fromName&toName&time] */
export function GET(request: Request): Response {
  const req = parsePlanRequest(new URL(request.url).searchParams, new Date())
  if ('error' in req) return errorResponse(400, req.error)
  try {
    return Response.json(planTrip(loadTimetable(), req), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('plan failed', err)
    return errorResponse(500, 'Terjadi kesalahan saat mencari rute. Coba lagi sebentar.')
  }
}
