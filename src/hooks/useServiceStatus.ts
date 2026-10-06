import { useEffect, useState } from 'react'
import { api, type Status } from '../lib/api/client'

export type ServiceState =
  | { kind: 'loading' }
  | { kind: 'offline' } // API not reachable
  | { kind: 'ready'; status: Status }

export function useServiceStatus(): ServiceState {
  const [state, setState] = useState<ServiceState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api
      .status(controller.signal)
      .then(({ data }) => setState(data ? { kind: 'ready', status: data } : { kind: 'offline' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'offline' })
      })
    return () => controller.abort()
  }, [])

  return state
}
