import { AnimatePresence, motion } from 'motion/react'
import type { Ref } from 'react'
import type { PlanState } from '../hooks/usePlan'
import { PREFERENCES, type Endpoint, type PickedTime, type Preference } from '../lib/trip'
import { MapAttribution } from './map/MapView'
import { DeparturePicker } from './DeparturePicker'
import { SwapIcon } from './icons'
import { ItineraryList } from './ItineraryList'
import { PlaceField } from './PlaceField'
import { PreferenceTabs } from './PreferenceTabs'

type Props = {
  ref?: Ref<HTMLElement>
  origin: Endpoint | null
  destination: Endpoint | null
  onOriginChange: (value: Endpoint | null) => void
  onDestinationChange: (value: Endpoint | null) => void
  pickedTime: PickedTime | null
  onPickedTimeChange: (value: PickedTime | null) => void
  preference: Preference
  onPreferenceChange: (value: Preference) => void
  plan: PlanState
  selectedId: string | null
  onSelect: (id: string) => void
}

export function PlannerSheet(props: Props) {
  const { ref, origin, destination, preference } = props
  const hint = PREFERENCES.find((p) => p.id === preference)!.hint

  return (
    <motion.section
      ref={ref}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: 0.2 }}
      className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[62dvh] max-w-lg flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgb(0,0,0,0.12)]"
    >
      <div className="px-5 pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />

        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <PlaceField kind="origin" value={origin} onChange={props.onOriginChange} placeholder="Dari mana?" />
            <PlaceField
              kind="destination"
              value={destination}
              onChange={props.onDestinationChange}
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
            className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-40"
          >
            <SwapIcon className="size-5" />
          </motion.button>
        </div>

        <div className="mt-2">
          <DeparturePicker value={props.pickedTime} onChange={props.onPickedTimeChange} />
        </div>

        <div className="mt-3">
          <PreferenceTabs value={preference} onChange={props.onPreferenceChange} />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={hint}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-2 text-center text-xs text-slate-500"
          >
            {hint}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        <Results {...props} />
      </div>
      <footer className="border-t border-slate-100 px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <MapAttribution />
      </footer>
    </motion.section>
  )
}

function Results({ plan, origin, destination, preference, selectedId, onSelect }: Props) {
  switch (plan.kind) {
    case 'idle':
      return (
        <Message>
          {destination && !origin
            ? 'Tentukan titik awal: cari tempat, pilih Lokasi saya, atau ketuk peta.'
            : 'Cari tempat, atau ketuk peta untuk memilih tujuan.'}
        </Message>
      )
    case 'loading':
      return (
        <div className="flex flex-col gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )
    case 'error':
      return <Message tone="error">{plan.message}</Message>
    case 'ready':
      if (plan.plan.itineraries.length === 0) {
        return (
          <Message>
            Belum ada rute yang cocok. Saat ini data baru mencakup TransJakarta; KRL, MRT, dan LRT sedang disiapkan.
          </Message>
        )
      }
      return (
        <ItineraryList
          plan={plan.plan}
          departure={plan.departure}
          picked={plan.picked}
          preference={preference}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )
  }
}

function Message({ children, tone }: { children: string; tone?: 'error' }) {
  return (
    <p className={`py-4 text-center text-sm ${tone === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{children}</p>
  )
}
