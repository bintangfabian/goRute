import type { ApiError } from '../shared/api.ts'

/** A JSON error whose message the web app shows as is. */
export function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message } satisfies ApiError, { status, headers: { 'Cache-Control': 'no-store' } })
}
