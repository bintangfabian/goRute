import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { fareText, serviceName, stepText } from '../../shared/directions.ts'
import { useMinute } from '../hooks/useMinute'
import type { Itinerary, Leg, WalkStep } from '../lib/api/client'
import { formatClock, formatDistance, formatDuration, formatRupiah } from '../lib/format'
import type { PickedTime } from '../lib/trip'
import { lateStart } from '../lib/itinerary'
import {
  ArrowLeftIcon,
  BridgeIcon,
  BusIcon,
  ChevronDownIcon,
  CrossingIcon,
  FlagIcon,
  FootbridgeIcon,
  HalteIcon,
  ManeuverIcon,
  StairsIcon,
  TicketIcon,
  TrainIcon,
  UnderpassIcon,
  WalkIcon,
} from './icons'
import { readableOn } from './routeColors'

type Props = {
  itinerary: Itinerary
  /** Where the trip starts and ends, as the rider named them. */
  originName: string
  destinationName: string
  /** When the trip was planned from, and the time the rider picked (null for now). */
  departure: number
  picked: PickedTime | null
  /** Preferences this option is the best at. */
  winsAt: string[]
  /** The leg the map is zoomed to, if any. */
  focus: number | null
  onFocus: (leg: number | null) => void
  onBack: () => void
}

type Rail = { kind: 'walk' } | { kind: 'ride'; color: string }

/** One trip option step by step: the walks with their turns, the buses with their stops. */
export function RouteDetail(props: Props) {
  const { itinerary: it } = props
  const headingId = useId()
  const late = lateStart(it, props.departure, props.picked, useMinute())
  // The card that opened the details is gone: keep keyboard and screen reader users here, where Escape closes them.
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => back.current?.focus({ preventScroll: true }), [])
  const legs = it.legs
  const rail = (leg: Leg | undefined): Rail | null => (leg ? (leg.route ? { kind: 'ride', color: colorOf(leg) } : { kind: 'walk' }) : null)
  // How long the rider stands at the halte before the bus comes.
  const waitBefore = (i: number) => (Date.parse(legs[i].start) - Date.parse(i > 0 ? legs[i - 1].end : it.start)) / 1000
  const waiting = (i: number) => (waitBefore(i) >= 60 ? `tunggu ${formatDuration(waitBefore(i))}` : '')
  const rows: ReactNode[] = [
    // Starting right at a halte, the board row below carries the line on.
    <Waypoint key="start" time={it.start} title={props.originName} note="Berangkat" marker="start" below={legs[0]?.route ? null : rail(legs[0])} />,
  ]
  legs.forEach((leg, i) => {
    const prev = legs[i - 1]
    const next = legs[i + 1]
    const focused = props.focus === i
    const toggle = () => props.onFocus(focused ? null : i)
    if (leg.route) {
      // Off one bus and onto the next at the same halte: one stop on the line, not two.
      if (!prev?.route) {
        const wait = waiting(i)
        rows.push(
          <Waypoint
            key={`board${i}`}
            time={leg.start}
            title={leg.from.name}
            note={wait ? `${capitalize(wait)}, lalu naik` : 'Naik di halte ini'}
            marker="stop"
            above={rail(prev)}
            below={rail(leg)}
          />,
        )
      }
      rows.push(<RideRow key={`ride${i}`} leg={leg} focused={focused} onFocus={toggle} />)
      if (next?.route) {
        const wait = waiting(i + 1)
        rows.push(
          <Waypoint
            key={`change${i}`}
            time={leg.end}
            title={leg.to.name}
            note={`Turun, lalu pindah ke ${next.route.shortName}${wait ? ` · ${wait}` : ''}`}
            marker="stop"
            above={rail(leg)}
            below={rail(next)}
          />,
        )
      } else if (next) {
        rows.push(
          <Waypoint
            key={`alight${i}`}
            time={leg.end}
            title={leg.to.name}
            note={legs[i + 2]?.route ? 'Turun, lalu pindah bus' : 'Turun di halte ini'}
            marker="stop"
            above={rail(leg)}
            below={rail(next)}
          />,
        )
      }
    } else {
      const toHalte = next !== undefined
      const target = toHalte ? halteName(leg.to.name) : props.destinationName
      rows.push(<WalkRow key={`walk${i}`} leg={leg} target={target} toHalte={toHalte} focused={focused} onFocus={toggle} />)
    }
  })
  // Ending at the halte itself, getting off is arriving.
  const endsOnBus = legs.at(-1)?.route
  rows.push(
    <Waypoint key="end" time={it.end} title={props.destinationName} note={endsOnBus ? 'Turun di halte ini · tiba' : 'Tiba'} marker="end" above={rail(legs.at(-1))} />,
  )

  return (
    <section aria-labelledby={headingId} className="pb-2">
      {/* Stays at the top while the steps scroll, so the way back and the totals are always there. */}
      <div className="sticky top-0 z-10 -mx-5 flex items-start gap-1 bg-white px-5 pt-2 pb-2 lg:pt-4">
        <motion.button
          ref={back}
          type="button"
          onClick={props.onBack}
          whileTap={{ scale: 0.92 }}
          aria-label="Kembali ke pilihan rute"
          className="-ml-2.5 grid size-10 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <ArrowLeftIcon className="size-5" />
        </motion.button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id={headingId} className="line-clamp-2 text-xs font-semibold text-slate-500">
            Rute ke {props.destinationName}
          </h2>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xl font-bold tracking-tight">{formatDuration(it.durationSec)}</p>
            <p className="text-lg font-bold">
              {formatRupiah(it.fare.totalIdr)}
              {!it.fare.complete && <span className="text-slate-400">+</span>}
            </p>
          </div>
          <p className="truncate text-xs text-slate-500 tabular-nums">
            {formatClock(it.start)} – {formatClock(it.end)} · {it.transfers === 0 ? 'tanpa transit' : `${it.transfers}× transit`} · jalan{' '}
            {formatDistance(it.walkDistanceM)}
          </p>
        </div>
      </div>
      {(late || props.winsAt.length > 0) && (
        // One line that scrolls sideways, so a narrow phone does not spend two lines on labels.
        <div className="-mx-5 mt-1 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {late && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{late}</span>}
          {props.winsAt.map((label) => (
            <span key={label} className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
              {label}
            </span>
          ))}
        </div>
      )}
      <JourneyRibbon legs={legs} />
      <ol className="mt-4" aria-label="Langkah perjalanan">
        {rows}
      </ol>
    </section>
  )
}

/** The trip at a glance: one band per leg, as long as the leg takes. */
function JourneyRibbon({ legs }: { legs: Leg[] }) {
  const total = legs.reduce((s, l) => s + l.durationSec, 0) || 1
  return (
    <div className="mt-3 flex h-6 gap-[3px]" aria-hidden="true">
      {legs.map((leg, i) => {
        const share = leg.durationSec / total
        const style = { flexGrow: Math.max(share, 0.06), flexBasis: 0 }
        if (!leg.route) {
          return (
            <div
              key={i}
              style={style}
              className="grid min-w-6 place-items-center rounded-full bg-slate-100 bg-[radial-gradient(circle,#94a3b8_1.3px,transparent_1.6px)] bg-size-[7px_7px] bg-center"
            >
              {share > 0.12 && <WalkIcon className="size-3.5 rounded-full bg-slate-100 text-slate-500" />}
            </div>
          )
        }
        const background = colorOf(leg)
        return (
          <div
            key={i}
            style={{ ...style, backgroundColor: background, color: readableOn(background, leg.route.textColor || '#ffffff') }}
            className="flex min-w-6 items-center justify-center gap-0.5 overflow-hidden rounded-full px-1.5 text-[11px] font-bold"
          >
            {/* A short ride's band has room for the icon or the number, not a cut-off "J…". */}
            {share >= 0.1 && <BusIcon className="size-3.5 shrink-0" />}
            {share >= 0.08 + leg.route.shortName.length * 0.025 && <span className="whitespace-nowrap">{leg.route.shortName}</span>}
          </div>
        )
      })}
    </div>
  )
}

const colorOf = (leg: Leg) => leg.route?.color || '#334155'

/** The line down the left: dotted for walks, solid in the route's colour for rides. */
function RailLine({ rail, half }: { rail: Rail | null; half?: 'top' | 'bottom' }) {
  if (!rail) return null
  const place = half === 'top' ? 'top-0 h-1/2' : half === 'bottom' ? 'bottom-0 h-1/2' : 'inset-y-0'
  return rail.kind === 'ride' ? (
    <span className={`absolute left-1/2 w-1.5 -translate-x-1/2 ${place}`} style={{ backgroundColor: rail.color }} />
  ) : (
    <span className={`absolute left-1/2 -translate-x-1/2 border-l-[3px] border-dotted border-slate-300 ${place}`} />
  )
}

/** One row of the timeline; the space below a leg is inside its cells, so the rail runs on through it. */
function Row(props: { time?: string; rail: ReactNode; children: ReactNode; className?: string; leg?: boolean }) {
  return (
    <li className={`grid grid-cols-[3rem_1.75rem_1fr] gap-x-2 ${props.className ?? ''}`}>
      <span className="pt-0.5 text-right text-xs font-semibold text-slate-500 tabular-nums">{props.time ? formatClock(props.time) : ''}</span>
      <span className="relative">{props.rail}</span>
      <div className={`min-w-0 ${props.leg ? 'pb-3' : ''}`}>{props.children}</div>
    </li>
  )
}

function Waypoint(props: {
  time: string
  title: string
  note: string
  marker: 'start' | 'stop' | 'end'
  above?: Rail | null
  below?: Rail | null
}) {
  // The line the halte is on: the bus arriving, or else the one leaving.
  const ring = props.above?.kind === 'ride' ? props.above.color : props.below?.kind === 'ride' ? props.below.color : '#0f766e'
  const marker =
    props.marker === 'end' ? (
      <span className="relative z-10 grid size-6 place-items-center rounded-full bg-accent text-slate-900 ring-4 ring-white">
        <FlagIcon className="size-3.5" />
      </span>
    ) : props.marker === 'start' ? (
      <span className="relative z-10 size-4 rounded-full border-4 border-white bg-brand shadow" />
    ) : (
      <span className="relative z-10 size-4 rounded-full border-[3.5px] bg-white" style={{ borderColor: ring }} />
    )
  return (
    <Row
      time={props.time}
      rail={
        <>
          <RailLine rail={props.above ?? null} half="top" />
          <RailLine rail={props.below ?? null} half="bottom" />
          <span className="absolute inset-x-0 top-2.5 flex -translate-y-1/2 justify-center">{marker}</span>
        </>
      }
      className="min-h-11"
    >
      <p className="line-clamp-2 pt-px text-sm font-semibold break-words text-slate-900">{props.title}</p>
      <p className="text-xs text-slate-500">{props.note}</p>
    </Row>
  )
}

/** A walk this short (across the platform, a few steps to the door) needs no directions. */
const SHORT_WALK_M = 50

function WalkRow(props: { leg: Leg; target: string; toHalte: boolean; focused: boolean; onFocus: () => void }) {
  const { leg, target, toHalte, focused, onFocus } = props
  const [open, setOpen] = useState(false)
  const listId = useId()
  const steps = leg.distanceM >= SHORT_WALK_M ? (leg.steps ?? []) : []
  // The longest named streets say which way the walk goes before anyone opens the steps.
  const via = [...new Map(steps.filter((s) => s.name).map((s) => [s.name, s])).values()]
    .sort((a, b) => b.distanceM - a.distanceM)
    .slice(0, 2)
    .map((s) => s.name)
  return (
    <Row rail={<RailLine rail={{ kind: 'walk' }} />} leg>
      <LegHeader focused={focused} onFocus={onFocus}>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <WalkIcon className="size-4 text-slate-500" />
          Jalan kaki {formatDistance(leg.distanceM)}
          <span className="font-normal text-slate-500">· {formatDuration(leg.durationSec)}</span>
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          ke {target}
          {via.length > 0 && <> · lewat {via.join(', ')}</>}
        </span>
      </LegHeader>
      {steps.length > 0 && (
        <>
          <Toggle open={open} onToggle={() => setOpen(!open)} controls={listId}>
            Petunjuk jalan · {steps.length} langkah
          </Toggle>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ol
                id={listId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 border-b border-slate-100 py-2 last:border-b-0">
                    <StepIcon step={step} />
                    <span className="min-w-0 flex-1 text-sm text-slate-700">{stepText(step)}</span>
                    <span className="shrink-0 pt-0.5 text-xs text-slate-500 tabular-nums">{formatDistance(step.distanceM)}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2.5 py-2">
                  {toHalte ? (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                      <HalteIcon className="size-3.5" />
                    </span>
                  ) : (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-slate-900">
                      <FlagIcon className="size-3.5" />
                    </span>
                  )}
                  <span className="text-sm font-medium text-slate-800">Sampai di {target}</span>
                </li>
              </motion.ol>
            )}
          </AnimatePresence>
        </>
      )}
    </Row>
  )
}

function StepIcon({ step }: { step: WalkStep }) {
  const special: Partial<Record<WalkStep['way'], ReactNode>> = {
    crossing: <CrossingIcon className="size-3.5" />,
    footbridge: <FootbridgeIcon className="size-3.5" />,
    bridge: <BridgeIcon className="size-3.5" />,
    underpass: <UnderpassIcon className="size-3.5" />,
    steps: <StairsIcon className="size-3.5" />,
  }
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
      {special[step.way] ?? <ManeuverIcon maneuver={step.maneuver} className="size-3.5" />}
    </span>
  )
}

function RideRow({ leg, focused, onFocus }: { leg: Leg; focused: boolean; onFocus: () => void }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const route = leg.route!
  const background = colorOf(leg)
  const Icon = leg.mode === 'BUS' ? BusIcon : TrainIcon
  const passed = leg.stops ?? []
  const fare = fareText(leg)
  return (
    <Row rail={<RailLine rail={{ kind: 'ride', color: background }} />} leg>
      <LegHeader focused={focused} onFocus={onFocus}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold"
            style={{ backgroundColor: background, color: readableOn(background, route.textColor || '#ffffff') }}
          >
            <Icon className="size-3.5" />
            {route.shortName}
          </span>
          <span className="text-sm font-semibold text-slate-800">{serviceName(leg)}</span>
        </span>
        {leg.headsign && <span className="mt-1 block text-sm text-slate-700">Arah {leg.headsign}</span>}
        <span className="mt-0.5 block text-xs text-slate-500">
          {passed.length + 1} halte · {formatDuration(leg.durationSec)}
          {route.longName && <> · {route.longName}</>}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
          <TicketIcon className="size-4 shrink-0 text-slate-500" />
          <span>
            <span className="font-semibold text-slate-800">{fare}</span>
            {leg.fareIdr !== null && <> · tap kartu uang elektronik saat masuk</>}
          </span>
        </span>
      </LegHeader>
      {passed.length > 0 && (
        <>
          <Toggle open={open} onToggle={() => setOpen(!open)} controls={listId}>
            Lewat {passed.length} halte
          </Toggle>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ol
                id={listId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                {passed.map((stop, i) => (
                  <li key={i} className="flex items-center gap-2.5 py-1 text-sm text-slate-600">
                    <span className="size-2 shrink-0 rounded-full border-2 bg-white" style={{ borderColor: background }} />
                    <span className="truncate">{stop.name}</span>
                  </li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </>
      )}
    </Row>
  )
}

/**
 * A leg's summary; tapping it zooms the map to the leg, and again to the whole trip.
 * Screen readers hear the summary itself, then what tapping does; pressed means shown on the map.
 */
function LegHeader(props: { focused: boolean; onFocus: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onFocus}
      aria-pressed={props.focused}
      className={`-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
        props.focused ? 'bg-brand-soft/50' : 'hover:bg-slate-50'
      }`}
    >
      {props.children}
      <span className="sr-only">. Lihat di peta</span>
    </button>
  )
}

/** "Halte Manggarai", without saying halte twice for stops already named so. */
const halteName = (name: string) => (/^halte\b/i.test(name) ? name : `Halte ${name}`)

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Toggle(props: { open: boolean; onToggle: () => void; controls: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-expanded={props.open}
      aria-controls={props.controls}
      className="mt-1 flex items-center gap-1 rounded-full py-1 text-xs font-semibold text-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      {props.children}
      <motion.span animate={{ rotate: props.open ? 180 : 0 }} transition={{ duration: 0.2 }}>
        <ChevronDownIcon className="size-4" />
      </motion.span>
    </button>
  )
}
