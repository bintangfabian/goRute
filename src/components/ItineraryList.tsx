import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useRef } from 'react'
import { useMinute } from '../hooks/useMinute'
import type { Itinerary, Leg, Plan } from '../lib/api/client'
import { formatClock, formatDistance, formatDuration, formatRupiah } from '../lib/format'
import { bestAt, lateStart } from '../lib/itinerary'
import type { PickedTime, Preference } from '../lib/trip'
import { BusIcon, ChevronIcon, TrainIcon, WalkIcon } from './icons'
import { readableOn } from './routeColors'

type Props = {
  plan: Plan
  /** When the trip was planned from, in epoch ms. */
  departure: number
  /** The time the user chose to leave, or null when planned from now. */
  picked: PickedTime | null
  preference: Preference
  selectedId: string | null
  /** A card was tapped: show the option on the map and open its details. */
  onOpen: (id: string) => void
  /** Back from an option's details: put keyboard focus on its card again. */
  refocus?: boolean
}

export function ItineraryList({ plan, departure, picked, preference, selectedId, onOpen, refocus = false }: Props) {
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (refocus) list.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus()
  }, [refocus])
  // "besok" on a label follows the clock, so it reads right after midnight too.
  const minute = useMinute()
  const byId = new Map(plan.itineraries.map((it) => [it.id, it]))
  const ordered = plan.ranking[preference].flatMap((id) => byId.get(id) ?? [])

  return (
    // The top padding leaves room for the first card's focus ring inside the scrolling list.
    <ul ref={list} className="flex flex-col gap-2.5 pt-1">
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
              lateStart={lateStart(it, departure, picked, minute)}
              winsAt={bestAt(plan, it.id)}
              selected={it.id === selectedId}
              onOpen={() => onOpen(it.id)}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

function ItineraryCard(props: {
  itinerary: Itinerary
  lateStart: string | null
  winsAt: string[]
  selected: boolean
  onOpen: () => void
}) {
  const { itinerary: it, lateStart, winsAt, selected } = props
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      aria-description="Buka detail rute"
      onClick={props.onOpen}
      whileTap={{ scale: 0.98 }}
      className={`w-full rounded-2xl border-2 p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
        selected
          ? 'border-brand bg-brand-soft/40 shadow-[0_6px_20px_-10px_rgb(15,118,110,0.5)]'
          : 'border-slate-100 bg-white hover:border-slate-200'
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

      <div className="mt-3 flex items-center gap-1.5">
        {winsAt.map((label) => (
          <span key={label} className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
            {label}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-0.5 text-xs font-semibold text-brand">
          Lihat detail
          <ChevronIcon className="size-3.5" />
        </span>
      </div>
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
  const background = leg.route.color || '#334155'
  return (
    <span
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: background, color: readableOn(background, leg.route.textColor || '#ffffff') }}
      title={leg.route.longName}
    >
      <Icon className="size-3.5" />
      {leg.route.shortName}
    </span>
  )
}
