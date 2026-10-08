import { useEffect, useRef, useState } from 'react'
import { wibTime } from '../../shared/time.ts'
import { api, unreachable, type Plan } from '../lib/api/client'
import type { Endpoint, PickedTime } from '../lib/trip'

/** A retry shows as loading at least this long, or one that fails as fast as before looks like nothing happened. */
const MIN_RETRY_MS = 600

export type PlanState =
  | { kind: 'idle' }
  // count is how many options the last plan had, so the placeholders take the room the answer
  // will. last is the plan for these same two ends (another time, a retry): the map keeps its
  // route until the new one comes rather than wiping and redrawing it.
  | { kind: 'loading'; count: number; last: Plan | null }
  | { kind: 'error'; message: string }
  // departure is when the trip was planned from, in epoch ms. It is sent as `time`, so the
  // server and the cards count from the same clock even when the phone's clock is off.
  // picked is the time the user chose to leave, or null when the trip was planned from now.
  | { kind: 'ready'; plan: Plan; departure: number; picked: PickedTime | null }

type Settled =
  | { kind: 'error'; message: string }
  | { kind: 'ready'; plan: Plan; departure: number; picked: PickedTime | null }

/** `attempt` asks again for the same trip, e.g. after a failed request. */
export function usePlan(
  origin: Endpoint | null,
  destination: Endpoint | null,
  picked: PickedTime | null,
  attempt = 0,
): PlanState {
  // The settled result remembers which request it answers, so a stale
  // answer reads as loading instead of being shown for the new trip.
  const [settled, setSettled] = useState<{
    origin: Endpoint
    destination: Endpoint
    picked: PickedTime | null
    attempt: number
    state: Settled
  } | null>(null)

  // What was asked last, so a retry (only the attempt changed) can be told from a new trip.
  const asked = useRef<{ origin: Endpoint; destination: Endpoint; picked: PickedTime | null; attempt: number } | null>(null)

  useEffect(() => {
    if (!origin || !destination) return
    const controller = new AbortController()
    const prev = asked.current
    asked.current = { origin, destination, picked, attempt }
    const retry =
      prev !== null && prev.attempt !== attempt && prev.origin === origin && prev.destination === destination && prev.picked === picked
    const started = performance.now()
    let timer = 0
    const settle = (state: Settled) => {
      const wait = retry ? MIN_RETRY_MS - (performance.now() - started) : 0
      const done = () => setSettled({ origin, destination, picked, attempt, state })
      if (wait > 0) timer = window.setTimeout(done, wait)
      else done()
    }
    const now = Date.now()
    const departure = picked ? wibTime(picked.ymd, picked.clock) : now
    api
      .plan(
        {
          fromLat: rounded(origin.lat),
          fromLon: rounded(origin.lon),
          fromName: origin.name,
          toLat: rounded(destination.lat),
          toLon: rounded(destination.lon),
          toName: destination.name,
          time: new Date(departure).toISOString(),
        },
        controller.signal,
      )
      .then(({ data, error }) => {
        settle(data ? { kind: 'ready', plan: data, departure, picked } : { kind: 'error', message: error })
      })
      .catch(() => {
        if (!controller.signal.aborted) settle({ kind: 'error', message: unreachable() })
      })
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [origin, destination, picked, attempt])

  if (!origin || !destination) return { kind: 'idle' }
  if (
    settled?.origin !== origin ||
    settled.destination !== destination ||
    settled.picked !== picked ||
    settled.attempt !== attempt
  ) {
    const was = settled?.state.kind === 'ready' ? settled.state.plan : null
    const sameEnds = settled?.origin === origin && settled.destination === destination
    return { kind: 'loading', count: was?.itineraries.length ?? 0, last: sameEnds ? was : null }
  }
  return settled.state
}

/**
 * Coordinates to about 11 m, plenty for a walk that snaps onto paths anyway: a GPS fix
 * to the centimetre would otherwise sit in the request URL and in server logs.
 */
const rounded = (degrees: number) => Math.round(degrees * 1e4) / 1e4
