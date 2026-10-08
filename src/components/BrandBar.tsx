import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ServiceState } from '../hooks/useServiceStatus'
import { LogoTile, Wordmark } from './Logo'

function describe(state: ServiceState): { label: string; dot: string; live: boolean } {
  switch (state.kind) {
    case 'loading':
      return { label: 'Menghubungkan…', dot: 'bg-slate-400', live: false }
    case 'offline':
      return { label: state.network ? 'Tidak ada internet' : 'Server offline', dot: 'bg-red-500', live: false }
    case 'ready': {
      const { feeds } = state.status
      return feeds.length > 0
        ? { label: feeds.join(', '), dot: 'bg-emerald-500', live: true }
        : { label: 'Data jadwal kosong', dot: 'bg-amber-500', live: false }
    }
  }
}

/** The brand and the service status: over the map on phones, atop the panel on wide screens. */
export function BrandBar({ state, className = '' }: { state: ServiceState; className?: string }) {
  const { label, dot, live } = describe(state)
  const reduce = useReducedMotion()
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoTile className="size-7 shrink-0" />
      <Wordmark className="text-[15px]" />
      <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        {live && !reduce && (
          <motion.span
            className={`absolute inset-0 rounded-full ${dot}`}
            animate={{ scale: [1, 2.6], opacity: [0.55, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className={`relative size-2 rounded-full ${dot}`} />
      </span>
      <span role="status" className="relative min-w-0">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            className="block truncate text-xs font-medium text-slate-600"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
