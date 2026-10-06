import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

type Schemas = components['schemas']
export type Status = Schemas['Status']
export type Plan = Schemas['Plan']
export type Itinerary = Schemas['Itinerary']
export type Leg = Schemas['Leg']
export type PlaceResult = Schemas['PlaceResult']

// Same-origin by default; Vite proxies /api to the Go backend in dev.
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '' })
