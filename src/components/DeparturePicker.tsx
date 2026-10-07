import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { addDays, daysBetween, wibClock, wibDay, wibTime } from '../../shared/time.ts'
import { useMinute } from '../hooks/useMinute'
import { formatDay } from '../lib/format'
import { DEPARTURE_DAYS, type PickedTime } from '../lib/trip'
import { ChevronIcon, ClockIcon } from './icons'

type Props = {
  value: PickedTime | null
  onChange: (value: PickedTime | null) => void
}

export function DeparturePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  // "Hari ini" and "Besok" are worked out from the clock on every render, so they move on at midnight.
  const minute = useMinute()
  const today = wibDay(minute)
  const { summary, past } = describe(value, minute)

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
          past ? 'bg-amber-100 text-amber-800' : value ? 'bg-brand-soft text-brand' : 'bg-slate-100 text-slate-600'
        }`}
      >
        <ClockIcon className="size-4" />
        Berangkat {summary}
        {/* The leading space keeps "08.00 sudah lewat" apart for screen readers; it collapses on screen. */}
        {past && <span className="rounded-full bg-amber-200 px-1.5 text-[11px]"> sudah lewat</span>}
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
              {DEPARTURE_DAYS.map((d) => {
                const ymd = addDays(today, d.offset).ymd
                return (
                  <Choice
                    key={d.offset}
                    pressed={value?.ymd === ymd}
                    // A first pick starts at the current minute, so "Besok" alone means this time tomorrow.
                    onClick={() => {
                      if (value?.ymd !== ymd) onChange({ ymd, clock: value?.clock ?? wibClock(minute) })
                    }}
                  >
                    {d.label}
                  </Choice>
                )
              })}
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

function describe(value: PickedTime | null, minute: number) {
  if (!value) return { summary: 'sekarang', past: false }
  const ms = wibTime(value.ymd, value.clock)
  const days = daysBetween(minute, ms)
  return {
    summary: `${days === 0 ? 'hari ini' : formatDay(ms, days)} ${value.clock.replace(':', '.')}`,
    // "Hari ini 08.00" picked at 10.00, or a pick whose day has gone by, plans a trip in the past.
    past: ms < minute,
  }
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
