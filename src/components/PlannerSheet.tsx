import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react'
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { wibTime } from '../../shared/time.ts'
import { useMediaQuery } from '../hooks/useMediaQuery'
import type { PlanState } from '../hooks/usePlan'
import type { ServiceState } from '../hooks/useServiceStatus'
import { formatWeekday } from '../lib/format'
import { SPLASH_FADES_AT } from '../lib/splash'
import { PREFERENCES, type Endpoint, type PickedTime, type Preference } from '../lib/trip'
import { BrandBar } from './BrandBar'
import { DepartureButton, DeparturePanel } from './DeparturePicker'
import { ArrowRightIcon, ClockIcon, RefreshIcon, SwapIcon } from './icons'
import { FarArt, NoTripArt, OffDayArt, OfflineArt, ReadyArt, SamePlaceArt } from './illustrations'
import { bestAt } from '../lib/itinerary'
import { ItineraryList } from './ItineraryList'
import type { Itinerary, Plan } from '../lib/api/client'
import { RouteDetail } from './RouteDetail'
import { MapAttribution } from './map/MapView'
import { PlaceField, type PlaceFieldHandle } from './PlaceField'
import { PreferenceTabs } from './PreferenceTabs'

type Props = {
  ref: RefObject<HTMLElement | null>
  status: ServiceState
  origin: Endpoint | null
  destination: Endpoint | null
  onOriginChange: (value: Endpoint | null) => void
  onDestinationChange: (value: Endpoint | null) => void
  pickedTime: PickedTime | null
  onPickedTimeChange: (value: PickedTime | null) => void
  preference: Preference
  onPreferenceChange: (value: Preference) => void
  plan: PlanState
  /** Start and end are the same spot, so there is nothing to plan. */
  samePlace: boolean
  onRetry: () => void
  selectedId: string | null
  onSelect: (id: string) => void
  /** The leg of the shown option the map is zoomed to, if any. */
  focusLeg: number | null
  onFocusLeg: (leg: number | null, of: Itinerary | null) => void
  /** Told when an option's details open or close: the sheet changes height, so the map fits again. */
  onDetailChange: (open: boolean) => void
}

/** Planned from now, a day with buses again is searched from its first buses (see Empty). */
const FIRST_BUSES = '05:00'

// A bottom sheet on phones (drag or tap the handle to grow it), a panel on the left on wide screens.
export function PlannerSheet(props: Props) {
  const { ref, origin, destination, preference, plan } = props
  const wide = useMediaQuery('(min-width: 1024px)')
  // Phones with little height (an SE, most phones in their browser, any phone on its side) fold
  // the two fields into one line once both ends are set, so the routes get the room.
  const short = useMediaQuery('(max-height: 760px)') && !wide
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  // The folded fields, opened by a tap on the summary until the rider leaves them.
  const [reveal, setReveal] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const timePanelId = useId()
  const hintId = useId()
  const hint = PREFERENCES.find((p) => p.id === preference)!.hint
  const originField = useRef<PlaceFieldHandle>(null)
  const destinationField = useRef<PlaceFieldHandle>(null)
  const results = useRef<HTMLDivElement>(null)
  // The panel slides in as the splash fades, not unseen under it.
  const [entrance] = useState(() => Math.max(0, SPLASH_FADES_AT - performance.now()) / 1000 + 0.1)

  // The sheet follows a finger on its handle, then settles open or closed where it was let go.
  const drag = useRef<{ from: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // A mouse drag ends in a click on the handle, which must not toggle the sheet back.
  const panned = useRef(false)
  const onPanStart = () => {
    if (!ref.current) return
    drag.current = { from: ref.current.offsetHeight }
    panned.current = true
    setDragging(true)
  }
  const onPan = (_: PointerEvent, info: PanInfo) => {
    const el = ref.current
    if (!el || !drag.current) return
    const { from } = drag.current
    const max = window.innerHeight * 0.88
    // Open, it can come down to a small sheet; closed, it hardly moves down: there is no smaller one.
    const min = expanded ? Math.min(from, 200) : from
    let height = from - info.offset.y
    // Past either end it gives a little, like a rubber band, rather than stopping dead.
    if (height > max) height = max + (height - max) / 4
    else if (height < min) height = min - (min - height) / 4
    el.style.minHeight = el.style.maxHeight = `${Math.round(height)}px`
  }
  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    const next =
      info.offset.y < -24 || info.velocity.y < -300 ? true : info.offset.y > 24 || info.velocity.y > 300 ? false : expanded
    // The drag ends and the height is handed back to the classes in one frame, so the sheet
    // eases on from where the finger left it.
    flushSync(() => {
      setDragging(false)
      setExpanded(next)
    })
    if (ref.current) ref.current.style.minHeight = ref.current.style.maxHeight = ''
    drag.current = null
  }
  // While typing on a phone, the sheet grows and keeps only the fields, so the
  // suggestions get the room above the on-screen keyboard.
  const onEditing = (now: boolean) => {
    setEditing(now)
    setExpanded(now)
    if (!now) setReveal(false)
  }
  const searching = editing && !wide
  const folded = short && origin !== null && destination !== null && !editing && !reveal
  const edit = (end: 'origin' | 'destination') => {
    // Shown and focused in the same tap: iOS only brings up the keyboard for focus given during one.
    flushSync(() => setReveal(true))
    ;(end === 'origin' ? originField : destinationField).current?.focus()
  }
  // After Enter (or the keyboard's search key) takes a place, focus goes to the end still
  // missing, else to the routes.
  const afterKeyPick = (end: 'origin' | 'destination') => () => {
    const other = end === 'origin' ? destination : origin
    if (!other) {
      ;(end === 'origin' ? destinationField : originField).current?.focus()
      return
    }
    // The routes are hidden while typing on a phone: they show again before they take focus.
    flushSync(() => (document.activeElement as HTMLElement | null)?.blur())
    results.current?.focus({ preventScroll: true })
  }

  // An option's details replace the fields and the list. They belong to the plan they
  // were opened from, so a new search (another time, another place) closes them.
  const [detailFor, setDetailFor] = useState<Plan | null>(null)
  // The plan whose details just closed: its list puts focus back on the card that opened them,
  // once. A new plan's list leaves focus where it is (the time picker, the swap button).
  const [closedFor, setClosedFor] = useState<Plan | null>(null)
  // Set once the rider has gone into details or back: from then on the two views slide in.
  const [moved, setMoved] = useState(false)
  const ready = plan.kind === 'ready' ? plan : null
  const selected = ready?.plan.itineraries.find((it) => it.id === props.selectedId) ?? null
  const detail = ready && selected && detailFor === ready.plan ? selected : null
  const { onFocusLeg } = props
  const openDetail = (id: string) => {
    setClosedFor(null)
    setMoved(true)
    props.onSelect(id)
    onFocusLeg(null, null)
    setDetailFor(ready?.plan ?? null)
  }
  // The history entry pushed for the open details, marked so a stale one (after a reload) is never mistaken for it.
  const entry = useRef('')
  const ownEntry = () => entry.current !== '' && history.state?.goruteDetail === entry.current
  // The back entry added below is popped, so the browser's own back does the closing.
  const closeDetail = () => {
    onFocusLeg(null, null)
    if (ownEntry()) history.back()
    else {
      setDetailFor(null)
      setClosedFor(detailFor)
    }
  }
  const detailOpen = detail !== null
  // Escape closes the details wherever focus is, even after a click on the map took it away.
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.defaultPrevented) closeDetail()
  })
  // Back, from the phone, a swipe, or closeDetail above, after the entry for the details is popped.
  const onBack = useEffectEvent(() => {
    onFocusLeg(null, null)
    setClosedFor(detailFor)
    setDetailFor(null)
  })
  useEffect(() => {
    if (!detailOpen) return
    // A phone's back button or a swipe back closes the details instead of leaving goRute.
    if (!ownEntry()) {
      entry.current = crypto.randomUUID()
      history.pushState({ goruteDetail: entry.current }, '')
    }
    addEventListener('popstate', onBack)
    addEventListener('keydown', onEscape)
    return () => {
      removeEventListener('popstate', onBack)
      removeEventListener('keydown', onEscape)
    }
  }, [detailOpen])
  const { onDetailChange } = props
  useEffect(() => onDetailChange(detailOpen), [detailOpen, onDetailChange])
  // Closed by a new plan (a tap on the map, another time) rather than by back: the entry
  // goes too, or the next back would seem to do nothing.
  useEffect(() => {
    if (!detailOpen && ownEntry()) history.back()
  }, [detailOpen])
  // A message with a button (Coba lagi, Cari untuk Senin, Ubah jam) may take more of a short
  // phone, so the button stays in view; everything else leaves that room to the map.
  const withButton = !props.samePlace && (plan.kind === 'error' || (ready !== null && emptyAction(ready.plan) !== null))

  return (
    <motion.section
      ref={ref}
      aria-label="Perencana rute"
      initial={wide ? { x: '-110%' } : { y: '100%' }}
      animate={{ x: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: entrance }}
      // Expanded, the sheet is tall whatever its content, so the fields sit high and the
      // suggestions under them stay above the on-screen keyboard. A finger dragging it sets
      // its height directly, so it follows without easing.
      className={`absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-lg flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgb(0,0,0,0.12)] ${
        dragging ? 'transition-none' : 'transition-[max-height,min-height] duration-300 ease-out motion-reduce:transition-none'
      } ${
        expanded ? 'max-h-[88dvh] min-h-[88dvh]' : withButton ? 'max-h-[70dvh] min-h-0' : 'max-h-[62dvh] min-h-0'
      } lg:inset-y-4 lg:right-auto lg:left-4 lg:mx-0 lg:max-h-none lg:min-h-0 lg:w-[420px] lg:max-w-none lg:rounded-3xl lg:shadow-[0_12px_40px_rgb(0,0,0,0.14)]`}
    >
      {/* The top of the sheet lies over the scrolling area below by 2 px: iOS Safari lets
          a pixel of what scrolled past show above that area's edge. */}
      {wide ? (
        <BrandBar state={props.status} className="relative z-30 -mb-0.5 rounded-t-3xl bg-white px-5 pt-5 pb-0.5" />
      ) : (
        <motion.button
          type="button"
          onPointerDown={() => (panned.current = false)}
          onClick={() => !panned.current && setExpanded(!expanded)}
          onPanStart={onPanStart}
          onPan={onPan}
          onPanEnd={onPanEnd}
          aria-expanded={expanded}
          aria-label={expanded ? 'Kecilkan panel' : 'Besarkan panel'}
          // The handle reaches 16 px above the sheet, so a finger has 44 px to catch it.
          className="relative z-30 -mb-0.5 flex w-full shrink-0 cursor-grab touch-none justify-center rounded-t-3xl bg-white pt-3 pb-2.5 before:absolute before:inset-x-0 before:-top-4 before:h-4 focus-visible:outline-none active:cursor-grabbing [&:focus-visible>span]:bg-brand"
        >
          <motion.span
            className={`h-1.5 rounded-full ${dragging ? 'bg-slate-300' : 'bg-slate-200'}`}
            initial={false}
            animate={{ width: dragging ? 48 : expanded ? 28 : 40 }}
          />
        </motion.button>
      )}

      <div className={`px-5 pt-2 lg:pt-4 ${detail ? 'hidden' : ''}`}>
        <div className="flex items-center gap-2">
          {folded && <TripSummary origin={origin} destination={destination} onEdit={edit} />}
          <div className={`flex min-w-0 flex-1 flex-col gap-2 ${folded ? 'hidden' : ''}`}>
            <PlaceField
              ref={originField}
              kind="origin"
              value={origin}
              onChange={props.onOriginChange}
              onEditing={onEditing}
              onKeyPick={afterKeyPick('origin')}
              near={destination}
              placeholder="Dari mana?"
            />
            <PlaceField
              ref={destinationField}
              kind="destination"
              value={destination}
              onChange={props.onDestinationChange}
              onEditing={onEditing}
              onKeyPick={afterKeyPick('destination')}
              near={origin}
              placeholder="Mau ke mana?"
            />
          </div>
          {/* Out of the way while a field is in use: beside an open list it would float in its middle. */}
          <motion.button
            type="button"
            whileTap={{ rotate: 180, scale: 0.9 }}
            onClick={() => {
              props.onOriginChange(destination)
              props.onDestinationChange(origin)
            }}
            disabled={!origin && !destination}
            aria-label="Tukar asal dan tujuan"
            className={`grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40 ${
              searching ? 'hidden' : editing ? 'invisible' : ''
            }`}
          >
            <SwapIcon className="size-5" />
          </motion.button>
        </div>

        <div className={`mt-3 flex gap-2 ${searching ? 'hidden' : ''}`}>
          <PreferenceTabs value={preference} onChange={props.onPreferenceChange} describedBy={hintId} />
          <DepartureButton
            value={props.pickedTime}
            open={timeOpen}
            onToggle={() => setTimeOpen(!timeOpen)}
            panelId={timePanelId}
          />
        </div>
        <DeparturePanel
          id={timePanelId}
          open={timeOpen && !searching}
          value={props.pickedTime}
          onChange={props.onPickedTimeChange}
          onClose={() => setTimeOpen(false)}
        />
        {/* What the chosen order means. The open time panel owns that room, and folded fields
            leave it to the routes (the tabs say it on hover, and to screen readers). */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={hint}
            id={hintId}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`mt-2 text-center text-xs text-slate-500 ${searching || timeOpen || folded ? 'hidden' : ''}`}
          >
            {hint}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Focusable, so keyboard users can scroll it when the results outgrow the sheet. Keyed, so
          opening or closing the details starts at the top; the details come in from the right,
          the list from the left, as a page would. */}
      <motion.div
        key={detail ? 'detail' : 'list'}
        ref={results}
        tabIndex={0}
        role="region"
        aria-label={detail ? 'Detail rute' : 'Hasil rute'}
        initial={moved ? { opacity: 0, x: detail ? 12 : -12 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className={`min-h-0 flex-1 overflow-y-auto px-5 pb-3 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:ring-inset ${detail ? '' : 'mt-3'} ${searching ? 'invisible' : ''}`}
      >
        {detail && ready ? (
          <RouteDetail
            itinerary={detail}
            originName={origin?.name ?? 'Asal'}
            destinationName={destination?.name ?? 'Tujuan'}
            departure={ready.departure}
            picked={ready.picked}
            winsAt={bestAt(ready.plan, detail.id)}
            focus={props.focusLeg}
            onFocus={(leg) => onFocusLeg(leg, detail)}
            onBack={() => {
              setMoved(true)
              closeDetail()
            }}
          />
        ) : (
          <Results
            {...props}
            onOpen={openDetail}
            onOpenTime={() => setTimeOpen(true)}
            refocus={closedFor !== null && closedFor === ready?.plan}
          />
        )}
      </motion.div>
      <footer className="border-t border-slate-100 px-4 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        <MapAttribution />
      </footer>
    </motion.section>
  )
}

/** On a short phone, once both ends are set, the two fields fold into this line; a tap on either name opens them. */
function TripSummary(props: { origin: Endpoint; destination: Endpoint; onEdit: (end: 'origin' | 'destination') => void }) {
  // Each name takes the room it needs and gives way in proportion when both are long; the
  // destination also takes what is left, so the whole line answers a tap.
  const end = 'flex h-full min-w-0 items-center gap-2.5 text-left focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:ring-inset'
  return (
    <div className="flex h-11 min-w-0 flex-1 items-center rounded-2xl bg-slate-100">
      <button
        type="button"
        onClick={() => props.onEdit('origin')}
        aria-label={`Asal: ${props.origin.name}. Ubah asal`}
        className={`${end} flex-[0_1_auto] rounded-l-2xl pr-2 pl-4`}
      >
        <span className="size-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand-soft" />
        <span className="truncate text-sm font-semibold">{props.origin.name}</span>
      </button>
      <ArrowRightIcon className="size-4 shrink-0 text-slate-500" />
      <button
        type="button"
        onClick={() => props.onEdit('destination')}
        aria-label={`Tujuan: ${props.destination.name}. Ubah tujuan`}
        className={`${end} flex-[1_1_auto] rounded-r-2xl pr-4 pl-2`}
      >
        <span className="size-2.5 shrink-0 rounded-full bg-accent" />
        <span className="truncate text-sm font-semibold">{props.destination.name}</span>
      </button>
    </div>
  )
}

function Results(props: Props & { onOpen: (id: string) => void; onOpenTime: () => void; refocus: boolean }) {
  const { plan, origin, destination } = props
  if (props.samePlace) {
    return (
      <State art={<SamePlaceArt />} title="Asal dan tujuan sama">
        Pilih tujuan lain, atau ganti titik awalnya.
      </State>
    )
  }
  switch (plan.kind) {
    case 'idle':
      return destination && !origin ? (
        <State art={<ReadyArt />} title="Dari mana kamu berangkat?">
          Cari tempat, pilih Lokasi saya, atau ketuk peta untuk titik awal.
        </State>
      ) : (
        <State art={<ReadyArt />} title="Mau ke mana hari ini?">
          Cari halte atau tempat, atau ketuk peta untuk memilih tujuan.
        </State>
      )
    case 'loading':
      return <Loading count={plan.count} />
    case 'error':
      return (
        <State
          art={<OfflineArt />}
          title="Rute belum bisa dimuat"
          tone="error"
          action={
            <ActionButton icon={<RefreshIcon className="size-4" />} onClick={props.onRetry}>
              Coba lagi
            </ActionButton>
          }
        >
          {plan.message}
        </State>
      )
    case 'ready': {
      const { itineraries } = plan.plan
      if (itineraries.length === 0) return <Empty ready={plan} onPick={props.onPickedTimeChange} onOpenTime={props.onOpenTime} />
      return (
        <>
          <p role="status" className="sr-only">
            {itineraries.length} opsi rute ditemukan
          </p>
          <ItineraryList
            plan={plan.plan}
            departure={plan.departure}
            picked={plan.picked}
            preference={props.preference}
            selectedId={props.selectedId}
            onOpen={props.onOpen}
            refocus={props.refocus}
          />
        </>
      )
    }
  }
}

/** What an empty plan's message offers to do: search on the next day with buses, try another time, or nothing. */
function emptyAction(plan: Plan): 'next-day' | 'other-time' | null {
  if (plan.itineraries.length > 0) return null
  switch (plan.reason) {
    case 'far-from-origin':
    case 'far-from-destination':
      return null
    case 'no-service-near-origin':
    case 'no-service-near-destination':
      return plan.nextServiceDate !== undefined ? 'next-day' : null
    default:
      return 'other-time'
  }
}

function Empty(props: {
  ready: Extract<PlanState, { kind: 'ready' }>
  onPick: (value: PickedTime) => void
  onOpenTime: () => void
}) {
  const { ready } = props
  const { reason, nextServiceDate } = ready.plan
  if (reason === 'no-service-near-origin' || reason === 'no-service-near-destination') {
    const end = reason === 'no-service-near-origin' ? 'titik asal' : 'tujuan'
    // A picked time keeps its clock, so the rider only changes the day. Planned from now, the
    // day is searched from its first buses: the same clock could fall outside the hours of a
    // route like Royaltrans, and the trip found would be a day later still.
    const clock = ready.picked?.clock ?? FIRST_BUSES
    const next = nextServiceDate ? { ymd: Number(nextServiceDate.replaceAll('-', '')), clock } : null
    return (
      <State
        art={<OffDayArt />}
        title={`Tidak ada bus di sekitar ${end} hari ${formatWeekday(ready.departure)}`}
        action={
          next && (
            <ActionButton icon={<ClockIcon className="size-4" />} onClick={() => props.onPick(next)}>
              Cari untuk {formatWeekday(wibTime(next.ymd, clock))}, {clock.replace(':', '.')}
            </ActionButton>
          )
        }
      >
        {next
          ? 'Rutenya hanya beroperasi di hari tertentu.'
          : `Rute di dekat sini tidak beroperasi sepekan ke depan. Coba pilih ${end} di dekat halte lain.`}
      </State>
    )
  }
  if (reason === 'far-from-origin' || reason === 'far-from-destination') {
    const end = reason === 'far-from-origin' ? 'titik asal' : 'tujuan'
    return (
      <State art={<FarArt />} title={`Halte terlalu jauh dari ${end}`}>
        Tidak ada halte TransJakarta dalam 2,5 km. Ketuk peta lebih dekat ke jalan besar, atau cari nama haltenya langsung.
      </State>
    )
  }
  return (
    <State
      art={<NoTripArt />}
      title="Belum ada bus untuk perjalanan ini"
      action={
        <ActionButton icon={<ClockIcon className="size-4" />} onClick={props.onOpenTime}>
          Pilih jam lain
        </ActionButton>
      }
    >
      Coba jam berangkat lain, atau ganti asal dan tujuan. Data saat ini baru TransJakarta; KRL, MRT, dan LRT menyusul.
    </State>
  )
}

function ActionButton(props: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={props.onClick}
      whileTap={{ scale: 0.95 }}
      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {props.icon}
      {props.children}
    </motion.button>
  )
}

function State(props: { art: ReactNode; title: string; children: ReactNode; action?: ReactNode; tone?: 'error' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center pb-2 text-center"
    >
      {/* On short phones a state with a button draws its scene smaller, or not at all, so the button stays in view. */}
      <div className={props.action ? '[@media(max-height:600px)]:hidden [@media(max-height:700px)]:[&>svg]:h-11' : undefined}>
        {props.art}
      </div>
      <p className="mt-2 text-sm font-bold text-slate-800">{props.title}</p>
      <p className={`mt-1 max-w-xs text-sm ${props.tone === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
        {props.children}
      </p>
      {props.action}
    </motion.div>
  )
}

/** Placeholder cards shaped like the real ones, as many as the last answer had, so the sheet keeps its height. */
function Loading({ count }: { count: number }) {
  const reduce = useReducedMotion()
  const cards = count > 0 ? Math.min(count, 3) : 2
  const bar = 'rounded-md bg-slate-100'
  return (
    <div className="flex flex-col gap-2.5 pt-1" aria-busy="true">
      <p role="status" className="sr-only">
        Mencari rute…
      </p>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="relative overflow-hidden rounded-2xl border-2 border-slate-100 bg-white p-4" aria-hidden="true">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`my-1 h-5 w-20 ${bar}`} />
              <div className={`my-1 h-2 w-24 ${bar}`} />
            </div>
            <div className="flex flex-col items-end">
              <div className={`my-1 h-4 w-16 ${bar}`} />
              <div className={`my-1 h-2 w-28 ${bar}`} />
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <div className={`h-5 w-12 ${bar}`} />
            <div className={`h-5 w-9 ${bar}`} />
            <div className={`h-5 w-12 ${bar}`} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="h-5 w-16 rounded-full bg-slate-100" />
            <div className={`h-3 w-20 ${bar}`} />
          </div>
          {!reduce && (
            <motion.div
              className="absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-transparent via-white/80 to-transparent"
              initial={{ x: '-100%' }}
              animate={{ x: '250%' }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
