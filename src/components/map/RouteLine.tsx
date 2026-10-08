import { animate } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { ExpressionSpecification } from 'maplibre-gl'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { Itinerary } from '../../lib/api/client'
import { measureRoute, routeAt } from './routeGeometry'

const DRAW_SECONDS = 1.4
/** Legs other than the focused one stay visible, faded. */
const FADE: ExpressionSpecification = ['case', ['get', 'dim'], 0.3, 1]

/** The selected option on the map; with `focus`, every other leg is faded so that one stands out. */
export function RouteLine({ itinerary, focus = null }: { itinerary: Itinerary; focus?: number | null }) {
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

  const data = useMemo(() => routeAt(route, progress, focus), [route, progress, focus])

  return (
    <Source id="route" type="geojson" data={data}>
      <Layer
        id="route-walk"
        type="line"
        filter={['==', ['get', 'kind'], 'walk']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [0, 2], 'line-opacity': FADE }}
      />
      <Layer
        id="route-casing"
        type="line"
        filter={['==', ['get', 'kind'], 'transit']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': FADE }}
      />
      <Layer
        id="route-transit"
        type="line"
        filter={['==', ['get', 'kind'], 'transit']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': FADE }}
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
          'circle-opacity': FADE,
          'circle-stroke-opacity': FADE,
        }}
      />
    </Source>
  )
}
