// What the place search endpoints were asked: the text typed, and where the
// other end of the trip is, if the app sent it.

import { inServiceArea } from '../shared/region.ts'
import { words } from './stops.ts'

/** Longer queries are cut: no place name is this long, and the search would only take longer. */
const MAX_QUERY = 100
/** Without a hint of where the rider is, central Jakarta: most trips start or end there. */
export const MONAS = { lat: -6.1754, lon: 106.8272 }
/** The geocoder needs a few letters to find anything worth showing. */
export const GEOCODER_MIN = 3

export function placeQuery(request: Request): { q: string; letters: number; near: { lat: number; lon: number } | null } {
  const params = new URL(request.url).searchParams
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY)
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  return {
    q,
    // Letters and digits only: "..." or an emoji has none, and nothing to look for.
    letters: words(q).join('').length,
    near: params.has('lat') && inServiceArea(lat, lon) ? { lat, lon } : null,
  }
}
