import type { ApiError, Plan, PlaceResult, PlacesAnswer, Status } from '../../../shared/api.ts'

export type { Itinerary, Leg, Plan, PlaceResult, Status, WalkStep } from '../../../shared/api.ts'

export type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

async function get<T>(path: string, query: Record<string, string | number>, signal?: AbortSignal): Promise<Result<T>> {
  const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`${path}?${params}`, { signal })
  const body: unknown = await res.json().catch(() => null)
  // Cancelled while the body was arriving: the caller asked for nothing anymore.
  signal?.throwIfAborted()
  if (res.ok && body) return { data: body as T }
  return { error: (body as ApiError | null)?.error ?? statusText(res.status) }
}

/** An answer without our own error message: a timeout or a failure in front of the API, in words. */
function statusText(status: number): string {
  if (status === 429) return 'Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.'
  if (status === 504) return 'Server terlalu lama menjawab. Coba lagi sebentar lagi.'
  if (status >= 500) return 'Server sedang bermasalah. Coba lagi sebentar lagi.'
  return `Permintaan tidak bisa diproses (${status}).`
}

/** Why a request never got an answer: the phone being offline says so, rather than blaming the server. */
export const unreachable = () =>
  navigator.onLine === false ? 'Kamu sedang offline. Sambungkan internet, lalu coba lagi.' : 'Server tidak bisa dihubungi.'

export type PlanQuery = {
  fromLat: number
  fromLon: number
  fromName: string
  toLat: number
  toLon: number
  toName: string
  /** RFC 3339. The server plans from this moment instead of its own clock. */
  time: string
}

// The API is served from the same origin: Vercel Functions in production,
// the Vite plugin in vite.config.ts during development.
export const api = {
  status: (signal?: AbortSignal) => get<Status>('/api/v1/status', {}, signal),
  plan: (query: PlanQuery, signal?: AbortSignal) => get<Plan>('/api/v1/plan', query, signal),
  /** `near` (the other end of the trip) puts nearby places first; rounded so the CDN can share answers. */
  places: (q: string, near: { lat: number; lon: number } | null, signal?: AbortSignal) =>
    get<PlacesAnswer>('/api/v1/places', near ? { q, lat: near.lat.toFixed(2), lon: near.lon.toFixed(2) } : { q }, signal),
  /** The public geocoder, slower: asked when /places says it may find `more`. */
  geocode: (q: string, near: { lat: number; lon: number } | null, signal?: AbortSignal) =>
    get<PlacesAnswer>('/api/v1/geocode', near ? { q, lat: near.lat.toFixed(2), lon: near.lon.toFixed(2) } : { q }, signal),
  stops: (q: string, signal?: AbortSignal) => get<{ places: PlaceResult[] }>('/api/v1/stops', { q }, signal),
}
