import { AnimatePresence, motion } from 'motion/react'
import { Fragment } from 'react'
import { daysBetween } from '../../shared/time.ts'
import type { Itinerary, Leg, Plan } from '../lib/api/client'
import { formatClock, formatDay, formatDistance, formatDuration, formatRupiah } from '../lib/format'
import { PREFERENCES, type PickedTime, type Preference } from '../lib/trip'
import { BusIcon, ChevronIcon, TrainIcon, WalkIcon } from './icons'

// A trip that starts this long after it was asked for says so, or it reads like one leaving now.
const LATE_START_SEC = 30 * 60

type Props = {
  plan: Plan
  /** When the trip was planned from, in epoch ms. */
  departure: number
  /** The time the user chose to leave, or null when planned from now. */
  picked: PickedTime | null
  preference: Preference
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ItineraryList({ plan, departure, picked, preference, selectedId, onSelect }: Props) {
  const byId = new Map(plan.itineraries.map((it) => [it.id, it]))
  const ordered = plan.ranking[preference].flatMap((id) => byId.get(id) ?? [])

  return (
    <ul className="flex flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {ordered.map((it, i) => (
          <motion.li
            key={it.id}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          >
            <ItineraryCard
              itinerary={it}
              lateStart={lateStart(it, departure, picked)}
              winsAt={PREFERENCES.filter((p) => plan.ranking[p.id][0] === it.id).map((p) => p.label)}
              selected={it.id === selectedId}
              onSelect={() => onSelect(it.id)}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

// From a picked time, "Berangkat 9 j 36 mnt lagi" would read as counting from now,
// so the label names the clock time instead.
function lateStart(it: Itinerary, departure: number, picked: PickedTime | null): string | null {
  const startMs = Date.parse(it.start)
  const sec = (startMs - departure) / 1000
  if (sec < LATE_START_SEC) return null
  if (!picked) return `Berangkat ${formatDuration(sec)} lagi`
  // Days after today: the picked day plus any midnight the wait crosses.
  const day = formatDay(it.start, picked.day + daysBetween(departure, startMs))
  return ['Berangkat', day, formatClock(it.start)].filter(Boolean).join(' ')
}

function ItineraryCard(props: {
  itinerary: Itinerary
  lateStart: string | null
  winsAt: string[]
  selected: boolean
  onSelect: () => void
}) {
  const { itinerary: it, lateStart, winsAt, selected } = props
  return (
    <motion.button
      type="button"
      onClick={props.onSelect}
      whileTap={{ scale: 0.98 }}
      className={`w-full rounded-2xl border-2 p-4 text-left transition-colors ${
        selected ? 'border-brand bg-brand-soft/40' : 'border-slate-100 bg-white hover:border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-bold tracking-tight">{formatDuration(it.durationSec)}</p>
          <p className="text-xs text-slate-500">
            {formatClock(it.start)} – {formatClock(it.end)}
          </p>
          {lateStart && (
            <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              {lateStart}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-base font-bold">
            {formatRupiah(it.fare.totalIdr)}
            {!it.fare.complete && <span className="text-slate-400">+</span>}
          </p>
          <p className="text-xs text-slate-500">
            {it.transfers === 0 ? 'Tanpa transit' : `${it.transfers}× transit`} · jalan {formatDistance(it.walkDistanceM)}
          </p>
        </div>
      </div>

      <LegStrip legs={it.legs} />

      {winsAt.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {winsAt.map((label) => (
            <span key={label} className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
              {label}
            </span>
          ))}
        </div>
      )}
    </motion.button>
  )
}

function LegStrip({ legs }: { legs: Leg[] }) {
  // Short connecting walks (e.g. across a platform) are noise in the summary.
  const shown = legs.filter((l) => l.mode !== 'WALK' || l.durationSec >= 60)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {shown.map((leg, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronIcon className="size-3 text-slate-300" />}
          <LegChip leg={leg} />
        </Fragment>
      ))}
    </div>
  )
}

function LegChip({ leg }: { leg: Leg }) {
  if (!leg.route) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-slate-500">
        <WalkIcon className="size-4" />
        {Math.round(leg.durationSec / 60)}
      </span>
    )
  }
  const Icon = leg.mode === 'BUS' ? BusIcon : TrainIcon
  return (
    <span
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: leg.route.color || '#334155', color: leg.route.textColor || '#fff' }}
      title={leg.route.longName}
    >
      <Icon className="size-3.5" />
      {leg.route.shortName}
    </span>
  )
}
