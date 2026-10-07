import { motion } from 'motion/react'
import { useRef, type KeyboardEvent } from 'react'
import { PREFERENCES, type Preference } from '../lib/trip'

type Props = {
  value: Preference
  onChange: (value: Preference) => void
}

// A segmented control: one choice sorts the options, arrow keys move between choices.
export function PreferenceTabs({ value, onChange }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(e: KeyboardEvent, index: number) {
    const n = PREFERENCES.length
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: n - 1 }[
      e.key
    ]
    if (next === undefined) return
    e.preventDefault()
    const i = (next + n) % n
    onChange(PREFERENCES[i].id)
    refs.current[i]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Urutkan opsi" className="grid min-w-0 flex-1 grid-cols-3 rounded-2xl bg-slate-100 p-1">
      {PREFERENCES.map((p, i) => (
        <button
          key={p.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          tabIndex={value === p.id ? 0 : -1}
          title={p.hint}
          onClick={() => onChange(p.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className="relative rounded-xl py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
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
