import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

const PREFERENCES = [
  { id: 'tercepat', label: 'Tercepat', hint: 'Waktu tempuh paling singkat' },
  { id: 'termurah', label: 'Termurah', hint: 'Ongkos paling hemat, termasuk tarif integrasi' },
  { id: 'termudah', label: 'Termudah', hint: 'Transit dan jalan kaki paling sedikit' },
] as const

type Preference = (typeof PREFERENCES)[number]['id']

export function PlannerSheet() {
  const [destination, setDestination] = useState('')
  const [preference, setPreference] = useState<Preference>('tercepat')
  const hint = PREFERENCES.find((p) => p.id === preference)!.hint

  return (
    <motion.section
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: 0.2 }}
      className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-3xl bg-white px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgb(0,0,0,0.12)]"
    >
      <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />

      <label className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 focus-within:ring-2 focus-within:ring-brand">
        <span className="size-2.5 shrink-0 rounded-full bg-accent" />
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Mau ke mana?"
          className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
        />
      </label>

      <div className="mt-4 grid grid-cols-3 rounded-2xl bg-slate-100 p-1">
        {PREFERENCES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreference(p.id)}
            className="relative rounded-xl py-2 text-sm font-semibold"
          >
            {preference === p.id && (
              <motion.span
                layoutId="preference-highlight"
                className="absolute inset-0 rounded-xl bg-brand"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span
              className={`relative transition-colors ${preference === p.id ? 'text-white' : 'text-slate-600'}`}
            >
              {p.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={hint}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="mt-3 text-center text-xs text-slate-500"
        >
          {hint}
        </motion.p>
      </AnimatePresence>
    </motion.section>
  )
}
