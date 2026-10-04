import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type Status = components['schemas']['Status']

// Same-origin by default; Vite proxies /api to the Go backend in dev.
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '' })
