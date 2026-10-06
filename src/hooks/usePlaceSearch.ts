import { useEffect, useState } from 'react'
import { api, type PlaceResult } from '../lib/api/client'

const DEBOUNCE_MS = 250
const MAX_SHOWN = 6

export type PlaceSearch = {
  places: PlaceResult[]
  loading: boolean
  error: string | null
}

// Haltes come from our own timetable and answer at once. Places from the
// geocoder can take seconds or fail, so they join the list when they arrive.
type Answers = { q: string; stops: PlaceResult[] | null; places: PlaceResult[] | null; error: string | null }

export function usePlaceSearch(query: string): PlaceSearch {
  const q = query.trim()
  const active = q.length >= 2
  // Results stay visible while the next query loads, so the list does not flicker.
  const [answers, setAnswers] = useState<Answers>({ q: '', stops: [], places: [], error: null })

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const settle = (update: Partial<Answers>) =>
      setAnswers((prev) => ({ ...(prev.q === q ? prev : { q, stops: null, places: null, error: null }), ...update }))
    const timer = setTimeout(() => {
      api
        .stops(q, controller.signal)
        .then(({ data }) => settle({ stops: data?.places ?? [] }))
        .catch(() => {
          if (!controller.signal.aborted) settle({ stops: [] })
        })
      api
        .places(q, controller.signal)
        .then(({ data, error }) => settle({ places: data?.places ?? [], error: error ?? null }))
        .catch(() => {
          if (!controller.signal.aborted) settle({ places: [], error: 'Server tidak bisa dihubungi.' })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, active])

  if (!active) return { places: [], loading: false, error: null }
  const places = merge(answers.stops ?? [], answers.places ?? []).slice(0, MAX_SHOWN)
  const loading = answers.q !== q || answers.stops === null || answers.places === null
  // A failed geocoder only matters when the haltes found nothing either.
  return { places, loading, error: !loading && places.length === 0 ? answers.error : null }
}

/** Haltes first, then geocoder places that are not the same halte again (same name, within ~1 km). */
function merge(stops: PlaceResult[], places: PlaceResult[]): PlaceResult[] {
  const base = (p: PlaceResult) => p.name.toLowerCase().replace(/\s+\d+$/, '')
  const near = (a: PlaceResult, b: PlaceResult) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01
  return [...stops, ...places.filter((p) => !stops.some((s) => base(s) === base(p) && near(s, p)))]
}
