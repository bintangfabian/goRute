import { Component, type ErrorInfo, type ReactNode } from 'react'
import { LogoTile } from './Logo'

type State = { failed: boolean }

/** Shows a way back instead of a blank page when rendering throws. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('goRute stopped rendering', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="grid h-dvh place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-xs">
          <LogoTile className="mx-auto size-14" />
          <h1 className="mt-4 text-lg font-bold">Ada yang tidak beres</h1>
          <p className="mt-1 text-sm text-slate-500">Halaman ini berhenti karena kesalahan. Muat ulang untuk mencoba lagi.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Muat ulang
          </button>
        </div>
      </main>
    )
  }
}
