import { useCallback, useRef, useState } from 'react'
import { BrandBar } from './components/BrandBar'
import { CameraFollow } from './components/map/CameraFollow'
import { EndpointMarkers } from './components/map/EndpointMarkers'
import { MapView } from './components/map/MapView'
import { RouteLine } from './components/map/RouteLine'
import { PlannerSheet } from './components/PlannerSheet'
import { Toast, type ToastMessage } from './components/Toast'
import { usePlan } from './hooks/usePlan'
import { useServiceStatus } from './hooks/useServiceStatus'
import type { Itinerary, Plan } from './lib/api/client'
import type { Endpoint, PickedTime, Preference } from './lib/trip'

// Ends closer than this are the same spot: there is nothing to plan between them.
const SAME_PLACE_DEG = 0.0004 // about 45 m

export default function App() {
  const status = useServiceStatus()
  const [origin, setOrigin] = useState<Endpoint | null>(null)
  const [destination, setDestination] = useState<Endpoint | null>(null)
  // Null plans from now.
  const [pickedTime, setPickedTime] = useState<PickedTime | null>(null)
  const [preference, setPreference] = useState<Preference>('tercepat')
  // A tapped card only counts for the plan it was tapped in.
  const [chosen, setChosen] = useState<{ plan: Plan; id: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  // The leg the map is zoomed to in an option's details; it only counts for the option it was tapped in.
  const [focus, setFocus] = useState<{ leg: number; of: Itinerary } | null>(null)
  const onFocusLeg = useCallback((leg: number | null, of: Itinerary | null) => setFocus(leg === null || !of ? null : { leg, of }), [])
  // An option's details make the sheet taller or shorter than the list: the camera fits the route again.
  const [detailOpen, setDetailOpen] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)

  const samePlace =
    origin !== null &&
    destination !== null &&
    Math.abs(origin.lat - destination.lat) < SAME_PLACE_DEG &&
    Math.abs(origin.lon - destination.lon) < SAME_PLACE_DEG
  const plan = usePlan(origin, samePlace ? null : destination, pickedTime, attempt)

  const ready = plan.kind === 'ready' ? plan.plan : null
  const pickedIn = (p: Plan) => (chosen?.plan === p ? chosen.id : (p.ranking[preference][0] ?? null))
  const selectedId = ready ? pickedIn(ready) : null
  const selected = ready?.itineraries.find((it) => it.id === selectedId) ?? null
  // While the same trip is planned again (another time, a retry), the map keeps the last
  // route, rather than wiping it and moving the camera twice.
  const last = plan.kind === 'loading' ? plan.last : null
  const onMap = selected ?? last?.itineraries.find((it) => it.id === pickedIn(last)) ?? null
  const message = samePlace || plan.kind === 'error' || ready?.itineraries.length === 0
  const focusLeg = focus && focus.of === selected ? focus.leg : null
  const clearToast = useCallback(() => setToast(null), [])

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapView
        // A tap picks the destination, or the origin when only that is missing.
        onPick={(point) => (destination && !origin ? setOrigin(point) : setDestination(point))}
        onOutside={() => setToast({ id: Date.now(), text: 'Titik itu di luar area layanan Jabodetabek.' })}
      >
        {onMap && <RouteLine itinerary={onMap} focus={focusLeg} />}
        <EndpointMarkers origin={origin} destination={destination} />
        <CameraFollow
          origin={origin}
          destination={destination}
          itinerary={onMap}
          focus={selected && focusLeg !== null ? selected.legs[focusLeg] : null}
          sheet={sheetRef}
          message={message}
          detail={detailOpen}
        />
      </MapView>
      <BrandBar
        state={status}
        className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 max-w-[calc(100%-2rem)] rounded-full bg-white/90 py-1.5 pr-3.5 pl-1.5 shadow-md backdrop-blur lg:hidden"
      />
      <Toast message={toast} onDone={clearToast} />
      <PlannerSheet
        ref={sheetRef}
        status={status}
        origin={origin}
        destination={destination}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        pickedTime={pickedTime}
        onPickedTimeChange={setPickedTime}
        preference={preference}
        onPreferenceChange={(p) => {
          setPreference(p)
          setChosen(null)
        }}
        plan={plan}
        samePlace={samePlace}
        onRetry={() => setAttempt((n) => n + 1)}
        selectedId={selectedId}
        onSelect={(id) => ready && setChosen({ plan: ready, id })}
        focusLeg={focusLeg}
        onFocusLeg={onFocusLeg}
        onDetailChange={setDetailOpen}
      />
    </main>
  )
}
