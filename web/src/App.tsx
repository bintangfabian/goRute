import { MapView } from './components/MapView'
import { PlannerSheet } from './components/PlannerSheet'
import { StatusPill } from './components/StatusPill'
import { useServiceStatus } from './hooks/useServiceStatus'

export default function App() {
  const status = useServiceStatus()

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapView />
      <StatusPill state={status} />
      <PlannerSheet />
    </main>
  )
}
