import { useEffect, useState } from 'react'
import { api, type PlaceResult } from '../lib/api/client'

const DEBOUNCE_MS = 250
// Places come from our own index and answer as fast as haltes; they wait for
// a few letters so "ja" is not every Jalan in Jabodetabek.
const PLACES_MIN_LENGTH = 3
const MAX_SHOWN = 6

export type PlaceSearch = {
  places: PlaceResult[]
  loading: boolean
  error: string | null
}

// Haltes and places come from two endpoints; each joins the list when it arrives.
type Answers = { q: string; stops: PlaceResult[] | null; places: PlaceResult[] | null; error: string | null }

/** `near` is the other end of the trip, if chosen: places near it come first. */
export function usePlaceSearch(query: string, near: { lat: number; lon: number } | null = null): PlaceSearch {
  const q = query.trim()
  const active = q.length >= 2
  // A string, so a new object for the same spot does not search again.
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : null
  const asksGeocoder = q.length >= PLACES_MIN_LENGTH
  // Results stay visible while the next query loads, so the list does not flicker.
  const [answers, setAnswers] = useState<Answers>({ q: '', stops: [], places: [], error: null })

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const settle = (update: Partial<Answers>) =>
      setAnswers((prev) => ({ ...(prev.q === q ? prev : { q, stops: null, places: null, error: null }), ...update }))
    const stopsTimer = setTimeout(() => {
      api
        .stops(q, controller.signal)
        .then(({ data }) => settle({ stops: data?.places ?? [] }))
        .catch(() => {
          if (!controller.signal.aborted) settle({ stops: [] })
        })
    }, DEBOUNCE_MS)
    const placesTimer = setTimeout(() => {
      if (q.length < PLACES_MIN_LENGTH) return
      api
        .places(q, nearKey ? { lat: Number(nearKey.split(',')[0]), lon: Number(nearKey.split(',')[1]) } : null, controller.signal)
        .then(({ data, error }) => settle({ places: data?.places ?? [], error: error ?? null }))
        .catch(() => {
          if (!controller.signal.aborted) settle({ places: [], error: 'Server tidak bisa dihubungi.' })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(stopsTimer)
      clearTimeout(placesTimer)
      controller.abort()
    }
  }, [q, active, nearKey])

  if (!active) return { places: [], loading: false, error: null }
  // Older results only stand in while the rider keeps typing the same word ("mon" → "monas");
  // after a different query they would be suggestions for something else.
  const usable = answers.q === q || q.toLowerCase().startsWith(answers.q.toLowerCase())
  const geocoded = asksGeocoder && usable ? (answers.places ?? []) : []
  const places = usable ? merge(answers.stops ?? [], geocoded).slice(0, MAX_SHOWN) : []
  const loading = answers.q !== q || answers.stops === null || (asksGeocoder && answers.places === null)
  // A failed geocoder only matters when the haltes found nothing either.
  return { places, loading, error: !loading && places.length === 0 && asksGeocoder ? answers.error : null }
}

/** Haltes first, then geocoder places that are not the same halte again (same name, within ~1 km). */
function merge(stops: PlaceResult[], places: PlaceResult[]): PlaceResult[] {
  // Only a platform digit is dropped: "Monas 1" is the halte Monas, "SMAN 73" is not SMAN 85.
  const base = (p: PlaceResult) => p.name.toLowerCase().replace(/\s+[1-9]$/, '')
  const near = (a: PlaceResult, b: PlaceResult) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01
  return [...stops, ...places.filter((p) => !stops.some((s) => base(s) === base(p) && near(s, p)))]
}
