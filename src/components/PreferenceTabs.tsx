import { motion } from 'motion/react'
import { useRef, type KeyboardEvent } from 'react'
import { PREFERENCES, type Preference } from '../lib/trip'

type Props = {
  value: Preference
  onChange: (value: Preference) => void
  /** The element that says what the chosen order means. */
  describedBy?: string
}

// A segmented control: one choice sorts the options, arrow keys move between choices.
export function PreferenceTabs({ value, onChange, describedBy }: Props) {
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
    <div
      role="radiogroup"
      aria-label="Urutkan opsi"
      aria-describedby={describedBy}
      className="grid min-w-0 flex-1 grid-cols-3 rounded-2xl bg-slate-100 p-1"
    >
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
          // The ring stands off the brand fill by a white gap, so focus shows on the chosen tab too. The
          // area a finger can hit reaches over the bar's padding, 44 px tall.
          className="relative rounded-xl px-1 py-2 text-sm font-semibold after:absolute after:inset-x-0 after:-inset-y-1 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {value === p.id && (
            <motion.span
              layoutId="preference-highlight"
              className="absolute inset-0 rounded-xl bg-brand"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          {/* Narrow phones with a picked time leave a tab under 60 px: the labels shrink rather than touch. */}
          <span className={`relative transition-colors max-[359px]:text-xs ${value === p.id ? 'text-white' : 'text-slate-600'}`}>
            {p.label}
          </span>
        </button>
      ))}
    </div>
  )
}
