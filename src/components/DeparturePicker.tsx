import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { wibClock } from '../../shared/time.ts'
import { DEPARTURE_DAYS, type PickedTime } from '../lib/trip'
import { ChevronIcon, ClockIcon } from './icons'

type Props = {
  value: PickedTime | null
  onChange: (value: PickedTime | null) => void
}

export function DeparturePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const day = DEPARTURE_DAYS.find((d) => d.day === value?.day)
  const summary = value && day ? `${day.label.toLowerCase()} ${value.clock.replace(':', '.')}` : 'sekarang'

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
          value ? 'bg-brand-soft text-brand' : 'bg-slate-100 text-slate-600'
        }`}
      >
        <ClockIcon className="size-4" />
        Berangkat {summary}
        <ChevronIcon className={`size-4 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Choice
                pressed={!value}
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                Sekarang
              </Choice>
              {DEPARTURE_DAYS.map((d) => (
                <Choice
                  key={d.day}
                  pressed={value?.day === d.day}
                  // A first pick starts at the current minute, so "Besok" alone means this time tomorrow.
                  onClick={() => {
                    if (value?.day !== d.day) onChange({ day: d.day, clock: value?.clock ?? wibClock(Date.now()) })
                  }}
                >
                  {d.label}
                </Choice>
              ))}
              {value && (
                <input
                  type="time"
                  aria-label="Jam berangkat"
                  value={value.clock}
                  onChange={(e) => {
                    // A cleared or half-typed time comes through as ''.
                    if (/^\d{2}:\d{2}/.test(e.target.value)) onChange({ ...value, clock: e.target.value.slice(0, 5) })
                  }}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Choice(props: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      onClick={props.onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
        props.pressed ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {props.children}
    </button>
  )
}
