import { useSyncExternalStore } from 'react'

const MINUTE_MS = 60_000

function subscribe(onTick: () => void) {
  let timer = 0
  const schedule = () => {
    timer = window.setTimeout(() => {
      onTick()
      schedule()
    }, MINUTE_MS - (Date.now() % MINUTE_MS))
  }
  schedule()
  return () => window.clearTimeout(timer)
}

function currentMinute() {
  const now = Date.now()
  return now - (now % MINUTE_MS)
}

/** Epoch ms of the start of the current minute; the caller re-renders as each minute passes. */
export function useMinute(): number {
  return useSyncExternalStore(subscribe, currentMinute)
}
