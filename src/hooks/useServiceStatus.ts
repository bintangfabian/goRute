import { useEffect, useState } from 'react'
import { api, type Status } from '../lib/api/client'

export type ServiceState =
  | { kind: 'loading' }
  | { kind: 'offline' } // API not reachable
  | { kind: 'ready'; status: Status }

// An API that was down when the page opened is asked again, so the status heals by itself.
const RETRY_MS = 15_000

export function useServiceStatus(): ServiceState {
  const [state, setState] = useState<ServiceState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api
      .status(controller.signal)
      .then(({ data }) => setState(data ? { kind: 'ready', status: data } : { kind: 'offline' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'offline' })
      })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    if (state.kind !== 'offline') return
    const retry = () => setAttempt((n) => n + 1)
    const timer = window.setInterval(retry, RETRY_MS)
    window.addEventListener('online', retry)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', retry)
    }
  }, [state.kind])

  return state
}
