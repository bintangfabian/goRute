import type { ApiError, Plan, PlaceResult, Status } from '../../../shared/api.ts'

export type { Itinerary, Leg, Plan, PlaceResult, Status } from '../../../shared/api.ts'

export type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

async function get<T>(path: string, query: Record<string, string | number>, signal?: AbortSignal): Promise<Result<T>> {
  const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`${path}?${params}`, { signal })
  const body: unknown = await res.json().catch(() => null)
  if (res.ok && body) return { data: body as T }
  return { error: (body as ApiError | null)?.error ?? `Server membalas ${res.status}.` }
}

export type PlanQuery = {
  fromLat: number
  fromLon: number
  fromName: string
  toLat: number
  toLon: number
  toName: string
}

// The API is served from the same origin: Vercel Functions in production,
// the Vite plugin in vite.config.ts during development.
export const api = {
  status: (signal?: AbortSignal) => get<Status>('/api/v1/status', {}, signal),
  plan: (query: PlanQuery, signal?: AbortSignal) => get<Plan>('/api/v1/plan', query, signal),
  places: (q: string, signal?: AbortSignal) => get<{ places: PlaceResult[] }>('/api/v1/places', { q }, signal),
}
