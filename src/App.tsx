import { useRef, useState } from 'react'
import { CameraFollow } from './components/map/CameraFollow'
import { EndpointMarkers } from './components/map/EndpointMarkers'
import { MapView } from './components/map/MapView'
import { RouteLine } from './components/map/RouteLine'
import { PlannerSheet } from './components/PlannerSheet'
import { StatusPill } from './components/StatusPill'
import { usePlan } from './hooks/usePlan'
import { useServiceStatus } from './hooks/useServiceStatus'
import type { Plan } from './lib/api/client'
import type { Endpoint, Preference } from './lib/trip'

export default function App() {
  const status = useServiceStatus()
  const [origin, setOrigin] = useState<Endpoint | null>(null)
  const [destination, setDestination] = useState<Endpoint | null>(null)
  const [preference, setPreference] = useState<Preference>('tercepat')
  // A tapped card only counts for the plan it was tapped in.
  const [chosen, setChosen] = useState<{ plan: Plan; id: string } | null>(null)
  const plan = usePlan(origin, destination)
  const sheetRef = useRef<HTMLElement>(null)

  const ready = plan.kind === 'ready' ? plan.plan : null
  const selectedId = ready ? (chosen?.plan === ready ? chosen.id : (ready.ranking[preference][0] ?? null)) : null
  const selected = ready?.itineraries.find((it) => it.id === selectedId) ?? null

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapView
        // A tap picks the destination, or the origin when only that is missing.
        onPick={(point) => (destination && !origin ? setOrigin(point) : setDestination(point))}
      >
        {selected && <RouteLine itinerary={selected} />}
        <EndpointMarkers origin={origin} destination={destination} />
        <CameraFollow origin={origin} destination={destination} itinerary={selected} sheet={sheetRef} />
      </MapView>
      <StatusPill state={status} />
      <PlannerSheet
        ref={sheetRef}
        origin={origin}
        destination={destination}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        preference={preference}
        onPreferenceChange={(p) => {
          setPreference(p)
          setChosen(null)
        }}
        plan={plan}
        selectedId={selectedId}
        onSelect={(id) => ready && setChosen({ plan: ready, id })}
      />
    </main>
  )
}
