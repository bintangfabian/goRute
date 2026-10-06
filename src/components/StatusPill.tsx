import { AnimatePresence, motion } from 'motion/react'
import type { ServiceState } from '../hooks/useServiceStatus'

function describe(state: ServiceState): { label: string; dot: string } {
  switch (state.kind) {
    case 'loading':
      return { label: 'Menghubungkan…', dot: 'bg-slate-400' }
    case 'offline':
      return { label: 'Server offline', dot: 'bg-red-500' }
    case 'ready': {
      const { feeds } = state.status
      return feeds.length > 0
        ? { label: `Siap · ${feeds.join(', ')}`, dot: 'bg-emerald-500' }
        : { label: 'Data jadwal kosong', dot: 'bg-amber-500' }
    }
  }
}

export function StatusPill({ state }: { state: ServiceState }) {
  const { label, dot } = describe(state)
  return (
    <motion.div
      layout
      className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur"
    >
      <span className={`size-2 rounded-full ${dot}`} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  )
}
