import { motion } from 'motion/react'
import { PREFERENCES, type Preference } from '../lib/trip'

type Props = {
  value: Preference
  onChange: (value: Preference) => void
}

export function PreferenceTabs({ value, onChange }: Props) {
  return (
    <div role="tablist" className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1">
      {PREFERENCES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={value === p.id}
          title={p.hint}
          onClick={() => onChange(p.id)}
          className="relative rounded-xl py-2 text-sm font-semibold"
        >
          {value === p.id && (
            <motion.span
              layoutId="preference-highlight"
              className="absolute inset-0 rounded-xl bg-brand"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <span className={`relative transition-colors ${value === p.id ? 'text-white' : 'text-slate-600'}`}>
            {p.label}
          </span>
        </button>
      ))}
    </div>
  )
}
