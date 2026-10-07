import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react'
import { useId, useState, type ReactNode, type Ref } from 'react'
import { wibClock, wibTime } from '../../shared/time.ts'
import { useMediaQuery } from '../hooks/useMediaQuery'
import type { PlanState } from '../hooks/usePlan'
import type { ServiceState } from '../hooks/useServiceStatus'
import { formatWeekday } from '../lib/format'
import { PREFERENCES, type Endpoint, type PickedTime, type Preference } from '../lib/trip'
import { BrandBar } from './BrandBar'
import { DepartureButton, DeparturePanel } from './DeparturePicker'
import { ClockIcon, RefreshIcon, SwapIcon } from './icons'
import { FarArt, NoTripArt, OffDayArt, OfflineArt, ReadyArt, SamePlaceArt } from './illustrations'
import { ItineraryList } from './ItineraryList'
import { MapAttribution } from './map/MapView'
import { PlaceField } from './PlaceField'
import { PreferenceTabs } from './PreferenceTabs'

type Props = {
  ref?: Ref<HTMLElement>
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
}

// A bottom sheet on phones (tap or swipe the handle to grow it), a panel on the left on wide screens.
export function PlannerSheet(props: Props) {
  const { ref, origin, destination, preference } = props
  const wide = useMediaQuery('(min-width: 1024px)')
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const timePanelId = useId()
  const hint = PREFERENCES.find((p) => p.id === preference)!.hint

  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    if (info.offset.y < -24 || info.velocity.y < -300) setExpanded(true)
    else if (info.offset.y > 24 || info.velocity.y > 300) setExpanded(false)
  }
  // While typing on a phone, the sheet grows and keeps only the fields, so the
  // suggestions get the room above the on-screen keyboard.
  const onEditing = (now: boolean) => {
    setEditing(now)
    setExpanded(now)
  }
  const searching = editing && !wide

  return (
    <motion.section
      ref={ref}
      aria-label="Perencana rute"
      initial={wide ? { x: '-110%' } : { y: '100%' }}
      animate={{ x: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: 0.2 }}
      // Expanded, the sheet is tall whatever its content, so the fields sit high and the
      // suggestions under them stay above the on-screen keyboard.
      className={`absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-lg flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgb(0,0,0,0.12)] transition-[max-height,min-height] duration-300 ease-out ${
        expanded ? 'max-h-[88dvh] min-h-[88dvh]' : 'max-h-[62dvh] min-h-0'
      } lg:inset-y-4 lg:right-auto lg:left-4 lg:mx-0 lg:max-h-none lg:min-h-0 lg:w-[420px] lg:max-w-none lg:rounded-3xl lg:shadow-[0_12px_40px_rgb(0,0,0,0.14)]`}
    >
      {wide ? (
        <BrandBar state={props.status} className="px-5 pt-5" />
      ) : (
        <motion.button
          type="button"
          onClick={() => setExpanded(!expanded)}
          onPanEnd={onPanEnd}
          aria-expanded={expanded}
          aria-label={expanded ? 'Kecilkan panel' : 'Besarkan panel'}
          className="flex w-full shrink-0 touch-none justify-center pt-3 pb-2 focus-visible:outline-none [&:focus-visible>span]:bg-brand"
        >
          <motion.span className="h-1.5 rounded-full bg-slate-200" initial={false} animate={{ width: expanded ? 28 : 40 }} />
        </motion.button>
      )}

      <div className="px-5 pt-2 lg:pt-4">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <PlaceField
              kind="origin"
              value={origin}
              onChange={props.onOriginChange}
              onEditing={onEditing}
              placeholder="Dari mana?"
            />
            <PlaceField
              kind="destination"
              value={destination}
              onChange={props.onDestinationChange}
              onEditing={onEditing}
              placeholder="Mau ke mana?"
            />
          </div>
          <motion.button
            type="button"
            whileTap={{ rotate: 180, scale: 0.9 }}
            onClick={() => {
              props.onOriginChange(destination)
              props.onDestinationChange(origin)
            }}
            disabled={!origin && !destination}
            aria-label="Tukar asal dan tujuan"
            className={`grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40 ${searching ? 'hidden' : ''}`}
          >
            <SwapIcon className="size-5" />
          </motion.button>
        </div>

        <div className={`mt-3 flex gap-2 ${searching ? 'hidden' : ''}`}>
          <PreferenceTabs value={preference} onChange={props.onPreferenceChange} />
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={hint}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`mt-2 text-center text-xs text-slate-500 ${searching ? 'hidden' : ''}`}
          >
            {hint}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Focusable, so keyboard users can scroll it when the results outgrow the sheet. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Hasil rute"
        className={`mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-3 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:ring-inset ${searching ? 'invisible' : ''}`}
      >
        <Results {...props} />
      </div>
      <footer className="border-t border-slate-100 px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <MapAttribution />
      </footer>
    </motion.section>
  )
}

function Results(props: Props) {
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
      return <Loading />
    case 'error':
      return (
        <State
          art={<OfflineArt />}
          title="Rute belum bisa dimuat"
          tone="error"
          action={
            <motion.button
              type="button"
              onClick={props.onRetry}
              whileTap={{ scale: 0.95 }}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <RefreshIcon className="size-4" />
              Coba lagi
            </motion.button>
          }
        >
          {plan.message}
        </State>
      )
    case 'ready': {
      const { itineraries } = plan.plan
      if (itineraries.length === 0) return <Empty ready={plan} onPick={props.onPickedTimeChange} />
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
            onSelect={props.onSelect}
          />
        </>
      )
    }
  }
}

function Empty({ ready, onPick }: { ready: Extract<PlanState, { kind: 'ready' }>; onPick: (value: PickedTime) => void }) {
  const { reason, nextServiceDate } = ready.plan
  if (reason === 'no-service-near-origin' || reason === 'no-service-near-destination') {
    const end = reason === 'no-service-near-origin' ? 'titik asal' : 'tujuan'
    // Same clock on the next day with buses, so the rider only changes the day.
    const clock = ready.picked?.clock ?? wibClock(ready.departure)
    const next = nextServiceDate ? { ymd: Number(nextServiceDate.replaceAll('-', '')), clock } : null
    return (
      <State
        art={<OffDayArt />}
        title={`Tidak ada bus di sekitar ${end} hari ${formatWeekday(ready.departure)}`}
        action={
          next && (
            <motion.button
              type="button"
              onClick={() => onPick(next)}
              whileTap={{ scale: 0.95 }}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <ClockIcon className="size-4" />
              Cari untuk {formatWeekday(wibTime(next.ymd, clock))}, {clock.replace(':', '.')}
            </motion.button>
          )
        }
      >
        {next
          ? 'Rutenya hanya beroperasi di hari tertentu.'
          : `Rute di dekat sini tidak beroperasi sepekan ke depan. Coba geser ${end} ke halte lain.`}
      </State>
    )
  }
  if (reason === 'far-from-origin' || reason === 'far-from-destination') {
    const end = reason === 'far-from-origin' ? 'titik asal' : 'tujuan'
    return (
      <State art={<FarArt />} title={`Halte terlalu jauh dari ${end}`}>
        Tidak ada halte TransJakarta dalam 2,5 km. Geser {end} lebih dekat ke jalan besar, atau pilih halte langsung.
      </State>
    )
  }
  return (
    <State art={<NoTripArt />} title="Belum ada bus untuk perjalanan ini">
      Coba jam berangkat lain lewat tombol jam, atau ganti asal dan tujuan. Data saat ini baru TransJakarta; KRL, MRT,
      dan LRT menyusul.
    </State>
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
      {props.art}
      <p className="mt-2 text-sm font-bold text-slate-800">{props.title}</p>
      <p className={`mt-1 max-w-xs text-sm ${props.tone === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
        {props.children}
      </p>
      {props.action}
    </motion.div>
  )
}

function Loading() {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      <p role="status" className="sr-only">
        Mencari rute…
      </p>
      {[0, 1].map((i) => (
        <div key={i} className="relative h-28 overflow-hidden rounded-2xl bg-slate-100">
          {!reduce && (
            <motion.div
              className="absolute inset-y-0 w-1/2 bg-linear-to-r from-transparent via-white/70 to-transparent"
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
