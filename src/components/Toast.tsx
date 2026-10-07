import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { MapIcon } from './icons'

export type ToastMessage = { id: number; text: string }

const SHOWN_MS = 3200

/** A short note over the map that goes away by itself. */
export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDone, SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [message, onDone])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)] z-20 flex justify-center px-4 lg:top-6 lg:left-[452px]"
    >
      <AnimatePresence>
        {message && (
          <motion.p
            key={message.id}
            initial={{ y: -16, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="flex max-w-sm items-center gap-2.5 rounded-2xl bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur"
          >
            <MapIcon className="size-5 shrink-0 text-amber-300" />
            {message.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
