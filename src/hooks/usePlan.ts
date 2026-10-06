import { useEffect, useState } from 'react'
import { wibTime } from '../../shared/time.ts'
import { api, type Plan } from '../lib/api/client'
import type { Endpoint, PickedTime } from '../lib/trip'

export type PlanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  // departure is when the trip was planned from, in epoch ms. It is sent as `time`, so the
  // server and the cards count from the same clock even when the phone's clock is off.
  // picked is the time the user chose to leave, or null when the trip was planned from now.
  | { kind: 'ready'; plan: Plan; departure: number; picked: PickedTime | null }

type Settled =
  | { kind: 'error'; message: string }
  | { kind: 'ready'; plan: Plan; departure: number; picked: PickedTime | null }

export function usePlan(origin: Endpoint | null, destination: Endpoint | null, picked: PickedTime | null): PlanState {
  // The settled result remembers which request it answers, so a stale
  // answer reads as loading instead of being shown for the new trip.
  const [settled, setSettled] = useState<{
    origin: Endpoint
    destination: Endpoint
    picked: PickedTime | null
    state: Settled
  } | null>(null)

  useEffect(() => {
    if (!origin || !destination) return
    const controller = new AbortController()
    const settle = (state: Settled) => setSettled({ origin, destination, picked, state })
    const now = Date.now()
    const departure = picked ? wibTime(now, picked.day, picked.clock) : now
    api
      .plan(
        {
          fromLat: origin.lat,
          fromLon: origin.lon,
          fromName: origin.name,
          toLat: destination.lat,
          toLon: destination.lon,
          toName: destination.name,
          time: new Date(departure).toISOString(),
        },
        controller.signal,
      )
      .then(({ data, error }) => {
        settle(data ? { kind: 'ready', plan: data, departure, picked } : { kind: 'error', message: error })
      })
      .catch(() => {
        if (!controller.signal.aborted) settle({ kind: 'error', message: 'Server tidak bisa dihubungi.' })
      })
    return () => controller.abort()
  }, [origin, destination, picked])

  if (!origin || !destination) return { kind: 'idle' }
  if (settled?.origin !== origin || settled.destination !== destination || settled.picked !== picked) {
    return { kind: 'loading' }
  }
  return settled.state
}
