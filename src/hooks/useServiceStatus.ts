import { useEffect, useState } from 'react'
import { api, type Status } from '../lib/api/client'

export type ServiceState =
  | { kind: 'loading' }
  // API not reachable; network says whether the phone itself is offline.
  | { kind: 'offline'; network: boolean }
  | { kind: 'ready'; status: Status }

const unreachable = (): ServiceState => ({ kind: 'offline', network: navigator.onLine === false })

// An API that was down when the page opened is asked again, so the status heals by itself.
const RETRY_MS = 15_000

export function useServiceStatus(): ServiceState {
  const [state, setState] = useState<ServiceState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api
      .status(controller.signal)
      .then(({ data }) => setState(data ? { kind: 'ready', status: data } : unreachable()))
      .catch(() => {
        if (!controller.signal.aborted) setState(unreachable())
      })
    return () => controller.abort()
  }, [attempt])

  // The phone losing its connection shows at once, not only when a request fails.
  useEffect(() => {
    const lost = () => setState({ kind: 'offline', network: true })
    window.addEventListener('offline', lost)
    return () => window.removeEventListener('offline', lost)
  }, [])

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
