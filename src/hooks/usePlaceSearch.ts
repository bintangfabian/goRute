import { useEffect, useState } from 'react'
import { api, unreachable, type PlaceResult } from '../lib/api/client'

const DEBOUNCE_MS = 250
/** The geocoder gets this long before the list says nothing was found; a later answer still joins it. */
const GEOCODER_WAIT_MS = 4000
const MAX_SHOWN = 6
/** A place this close to a halte of the same name is that halte ("Monas 1"), already listed with its routes. */
const SAME_HALTE_DEG = 0.0015

export type PlaceSearch = {
  places: PlaceResult[]
  loading: boolean
  /** Our index found nothing and the slower geocoder is still looking. */
  widening: boolean
  error: string | null
}

// Haltes and places come from two endpoints; each joins the list when it arrives. When our
// index finds little (`more`), the public geocoder is asked as well, and its places follow.
type Answers = {
  q: string
  stops: PlaceResult[] | null
  places: PlaceResult[] | null
  more: boolean
  /** The geocoder's places; null while asked and not answered yet. */
  geocoded: PlaceResult[] | null
  /** The geocoder has taken longer than GEOCODER_WAIT_MS. */
  late: boolean
  error: string | null
}
const NOTHING: Omit<Answers, 'q'> = { stops: null, places: null, more: false, geocoded: null, late: false, error: null }

/** `near` is the other end of the trip, if chosen: places near it come first. */
export function usePlaceSearch(query: string, near: { lat: number; lon: number } | null = null): PlaceSearch {
  const q = query.trim()
  const active = q.length >= 2
  // A string, so a new object for the same spot does not search again.
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : null
  // Results stay visible while the next query loads, so the list does not flicker.
  const [answers, setAnswers] = useState<Answers>({ ...NOTHING, q: '', stops: [], places: [] })

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const settle = (update: Partial<Answers>) =>
      setAnswers((prev) => ({ ...(prev.q === q ? prev : { ...NOTHING, q }), ...update }))
    const where = nearKey ? { lat: Number(nearKey.split(',')[0]), lon: Number(nearKey.split(',')[1]) } : null
    let lateTimer = 0
    const stopsTimer = setTimeout(() => {
      api
        .stops(q, controller.signal)
        .then(({ data }) => settle({ stops: data?.places ?? [] }))
        .catch(() => {
          if (!controller.signal.aborted) settle({ stops: [] })
        })
    }, DEBOUNCE_MS)
    const placesTimer = setTimeout(() => {
      api
        .places(q, where, controller.signal)
        .then(({ data, error }) => {
          settle({ places: data?.places ?? [], more: data?.more ?? false, error: error ?? null })
          if (!data?.more) return
          // The geocoder is slow; its places join the list when they come, after ours.
          lateTimer = window.setTimeout(() => settle({ late: true }), GEOCODER_WAIT_MS)
          api
            .geocode(q, where, controller.signal)
            .then(({ data: found }) => settle({ geocoded: found?.places ?? [] }))
            .catch(() => {
              if (!controller.signal.aborted) settle({ geocoded: [] })
            })
        })
        .catch(() => {
          if (!controller.signal.aborted) settle({ places: [], error: unreachable() })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(stopsTimer)
      clearTimeout(placesTimer)
      clearTimeout(lateTimer)
      controller.abort()
    }
  }, [q, active, nearKey])

  if (!active) return { places: [], loading: false, widening: false, error: null }
  // Older results only stand in while the rider keeps typing the same word ("mon" → "monas");
  // after a different query they would be suggestions for something else.
  const usable = answers.q === q || q.toLowerCase().startsWith(answers.q.toLowerCase())
  const found = [...(answers.places ?? []), ...geocodedOnly(answers.places ?? [], answers.geocoded ?? [])]
  const places = usable ? merge(answers.stops ?? [], found).slice(0, MAX_SHOWN) : []
  // Still looking while nothing is listed and the geocoder may yet find something, for a while.
  const ours = answers.q === q && answers.stops !== null && answers.places !== null
  const asking = answers.more && answers.geocoded === null && !answers.late
  const loading = !ours || (asking && places.length === 0)
  // A failed place search only matters when the haltes found nothing either.
  return { places, loading, widening: ours && loading, error: !loading && places.length === 0 ? answers.error : null }
}

/** The geocoder's places that are not one of ours again (same name, within ~200 m). */
function geocodedOnly(ours: PlaceResult[], theirs: PlaceResult[]): PlaceResult[] {
  const same = (a: PlaceResult, b: PlaceResult) =>
    a.name.toLowerCase() === b.name.toLowerCase() && Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002
  return theirs.filter((p) => !ours.some((o) => same(o, p)))
}

/**
 * Haltes first, then places that are not the same halte again (same name, right
 * there). The monument Monas and the station Tanah Abang stay: they are not
 * the haltes named after them.
 */
function merge(stops: PlaceResult[], places: PlaceResult[]): PlaceResult[] {
  // Only a platform digit is dropped: "Monas 1" is the halte Monas, "SMAN 73" is not SMAN 85.
  // The geocoder calls a halte "Halte Monas".
  const base = (p: PlaceResult) =>
    p.name
      .toLowerCase()
      .replace(/^halte\s+/, '')
      .replace(/\s+[1-9]$/, '')
  const near = (a: PlaceResult, b: PlaceResult) => Math.abs(a.lat - b.lat) < SAME_HALTE_DEG && Math.abs(a.lon - b.lon) < SAME_HALTE_DEG
  return [...stops, ...places.filter((p) => !stops.some((s) => base(s) === base(p) && near(s, p)))]
}
