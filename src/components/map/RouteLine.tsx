import { animate } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { Itinerary } from '../../lib/api/client'
import { measureRoute, routeAt } from './routeGeometry'

const DRAW_SECONDS = 1.4

export function RouteLine({ itinerary }: { itinerary: Itinerary }) {
  const route = useMemo(() => measureRoute(itinerary.legs), [itinerary])
  // Progress is tied to the route it belongs to, so a newly selected route
  // starts undrawn instead of flashing fully drawn for a frame.
  const [drawn, setDrawn] = useState({ route, progress: 0 })
  const progress = drawn.route === route ? drawn.progress : 0

  useEffect(() => {
    const controls = animate(0, 1, {
      duration: DRAW_SECONDS,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (v) => setDrawn({ route, progress: v }),
    })
    return () => controls.stop()
  }, [route])

  const data = useMemo(() => routeAt(route, progress), [route, progress])

  return (
    <Source id="route" type="geojson" data={data}>
      <Layer
        id="route-walk"
        type="line"
        filter={['==', ['get', 'kind'], 'walk']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [0, 2] }}
      />
      <Layer
        id="route-casing"
        type="line"
        filter={['==', ['get', 'kind'], 'transit']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': '#ffffff', 'line-width': 11 }}
      />
      <Layer
        id="route-transit"
        type="line"
        filter={['==', ['get', 'kind'], 'transit']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': ['get', 'color'], 'line-width': 6 }}
      />
      <Layer
        id="route-stops"
        type="circle"
        filter={['==', ['get', 'kind'], 'stop']}
        paint={{
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-stroke-color': ['get', 'color'],
        }}
      />
    </Source>
  )
}
