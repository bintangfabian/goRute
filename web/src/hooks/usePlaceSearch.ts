import { useEffect, useState } from 'react'
import { api, type PlaceResult } from '../lib/api/client'

const DEBOUNCE_MS = 250

export type PlaceSearch = {
  places: PlaceResult[]
  loading: boolean
  error: string | null
}

export function usePlaceSearch(query: string): PlaceSearch {
  const q = query.trim()
  const active = q.length >= 2
  // Results stay visible while the next query loads, so the list does not flicker.
  const [result, setResult] = useState<{ q: string; places: PlaceResult[]; error: string | null }>({
    q: '',
    places: [],
    error: null,
  })

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await api.GET('/api/v1/places', {
          params: { query: { q } },
          signal: controller.signal,
        })
        setResult({ q, places: data?.places ?? [], error: error?.error ?? null })
      } catch {
        if (!controller.signal.aborted) setResult({ q, places: [], error: 'Server tidak bisa dihubungi.' })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, active])

  if (!active) return { places: [], loading: false, error: null }
  const loading = result.q !== q
  return { places: result.places, loading, error: loading ? null : result.error }
}
