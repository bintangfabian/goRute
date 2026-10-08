import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { addDays, daysBetween, wibClock, wibDay, wibTime } from '../../shared/time.ts'
import { useExpand } from '../hooks/useExpand'
import { useMinute } from '../hooks/useMinute'
import { formatDay } from '../lib/format'
import { DEPARTURE_DAYS, type PickedTime } from '../lib/trip'
import { ClockIcon } from './icons'

// A pick only counts as gone by once it is this far behind the clock, so "Hari ini" left at the
// current minute does not turn amber while the rider is still choosing the trip.
const PAST_GRACE_MS = 5 * 60_000

// day starts with a capital, to stand alone on the button; word is as it reads mid-sentence
// ("besok", but "Senin" either way).
type Described = { day: string; word: string; clock: string; past: boolean }

// "Hari ini" and "Besok" are worked out from the clock on every render, so they move on at midnight.
function describe(value: PickedTime | null, minute: number): Described | null {
  if (!value) return null
  const ms = wibTime(value.ymd, value.clock)
  const days = daysBetween(minute, ms)
  const word = days === 0 ? 'hari ini' : formatDay(ms, days)
  return {
    day: word.charAt(0).toUpperCase() + word.slice(1),
    word,
    clock: value.clock.replace(':', '.'),
    // "Hari ini 08.00" picked at 10.00, or a pick whose day has gone by, plans a trip in the past.
    past: ms < minute - PAST_GRACE_MS,
  }
}

type ButtonProps = { value: PickedTime | null; open: boolean; onToggle: () => void; panelId: string }

/** Sits next to the preference tabs: a clock when leaving now, the picked day and time otherwise. */
export function DepartureButton({ value, open, onToggle, panelId }: ButtonProps) {
  const d = describe(value, useMinute())
  const tone = d?.past ? 'bg-amber-100 text-amber-800' : d ? 'bg-brand-soft text-brand' : 'bg-slate-100 text-slate-600'
  const label = d ? `Berangkat ${d.word} ${d.clock}${d.past ? ', sudah lewat' : ''}` : 'Berangkat sekarang'
  return (
    <motion.button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`${label}. Ubah waktu berangkat`}
      title="Ubah waktu berangkat"
      onClick={onToggle}
      whileTap={{ scale: 0.94 }}
      className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3 transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${tone}`}
    >
      {/* With a picked time on a narrow phone, the day and clock say enough: the icon gives the tabs its room. */}
      <motion.span
        animate={{ rotate: open ? 90 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className={d ? 'max-[359px]:hidden' : undefined}
      >
        <ClockIcon className="size-5" />
      </motion.span>
      {d && (
        <span className="flex flex-col text-left leading-tight">
          <span className="text-[10px] font-semibold">{d.day}</span>
          <span className="text-sm font-bold">{d.clock}</span>
        </span>
      )}
    </motion.button>
  )
}

type PanelProps = {
  id: string
  open: boolean
  value: PickedTime | null
  onChange: (value: PickedTime | null) => void
  onClose: () => void
}

/** Sekarang, Hari ini, Besok and the phone's own time input, under the tabs row. */
export function DeparturePanel({ id, open, value, onChange, onClose }: PanelProps) {
  const expand = useExpand()
  const minute = useMinute()
  const today = wibDay(minute)
  const offered = DEPARTURE_DAYS.map((day) => ({ ...day, ymd: addDays(today, day.offset).ymd }))
  const d = describe(value, minute)
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={expand}
          // Clipped while it opens: the margin and padding keep the chips' focus rings inside the clip.
          className="-mx-1 overflow-hidden"
        >
          <div role="group" aria-label="Waktu berangkat" className="flex flex-wrap items-center gap-2 px-1 pt-2 pb-1">
            <Choice
              pressed={!value}
              onClick={() => {
                onChange(null)
                onClose()
              }}
            >
              Sekarang
            </Choice>
            {offered.map((day) => (
              <Choice
                key={day.offset}
                pressed={value?.ymd === day.ymd}
                // A first pick starts at the current minute, so "Besok" alone means this time tomorrow.
                onClick={() => {
                  if (value?.ymd !== day.ymd) onChange({ ymd: day.ymd, clock: value?.clock ?? wibClock(minute) })
                }}
              >
                {day.label}
              </Choice>
            ))}
            {/* A day the chips do not offer, such as Monday picked from "Cari untuk Senin" on a Saturday. */}
            {d && !offered.some((day) => day.ymd === value?.ymd) && (
              <Choice pressed onClick={() => {}}>
                {d.day}
              </Choice>
            )}
            {value && (
              <input
                type="time"
                aria-label="Jam berangkat"
                value={value.clock}
                onChange={(e) => {
                  // A cleared or half-typed time comes through as ''.
                  if (/^\d{2}:\d{2}/.test(e.target.value)) onChange({ ...value, clock: e.target.value.slice(0, 5) })
                }}
                className="h-9 rounded-full bg-slate-100 px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand"
              />
            )}
          </div>
          {d?.past && (
            <p className="px-1 pt-1 text-xs font-medium text-amber-800">
              {d.day} {d.clock} sudah lewat. Rutenya tetap dihitung dari jam itu; pilih Besok atau ubah jamnya.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Choice(props: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-pressed={props.pressed}
      onClick={props.onClick}
      whileTap={{ scale: 0.94 }}
      // 36 px to see, 44 px to hit; the ring stands off a chosen chip's brand fill by a white gap.
      className={`relative h-9 rounded-full px-3.5 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
        props.pressed ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {props.children}
    </motion.button>
  )
}
