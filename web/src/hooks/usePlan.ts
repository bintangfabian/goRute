import { useEffect, useState } from 'react'
import { api, type Plan } from '../lib/api/client'
import type { Endpoint } from '../lib/trip'

export type PlanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; plan: Plan }

type Settled = { kind: 'error'; message: string } | { kind: 'ready'; plan: Plan }

export function usePlan(origin: Endpoint | null, destination: Endpoint | null): PlanState {
  // The settled result remembers which request it answers, so a stale
  // answer reads as loading instead of being shown for the new trip.
  const [settled, setSettled] = useState<{ origin: Endpoint; destination: Endpoint; state: Settled } | null>(null)

  useEffect(() => {
    if (!origin || !destination) return
    const controller = new AbortController()
    const settle = (state: Settled) => setSettled({ origin, destination, state })
    api
      .GET('/api/v1/plan', {
        params: {
          query: {
            fromLat: origin.lat,
            fromLon: origin.lon,
            fromName: origin.name,
            toLat: destination.lat,
            toLon: destination.lon,
            toName: destination.name,
          },
        },
        signal: controller.signal,
      })
      .then(({ data, error }) => {
        settle(data ? { kind: 'ready', plan: data } : { kind: 'error', message: error?.error ?? 'Gagal mencari rute.' })
      })
      .catch(() => {
        if (!controller.signal.aborted) settle({ kind: 'error', message: 'Server tidak bisa dihubungi.' })
      })
    return () => controller.abort()
  }, [origin, destination])

  if (!origin || !destination) return { kind: 'idle' }
  if (settled?.origin !== origin || settled.destination !== destination) return { kind: 'loading' }
  return settled.state
}
