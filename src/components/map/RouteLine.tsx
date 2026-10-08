import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { ExpressionSpecification } from 'maplibre-gl'
import { Layer, Source, useMap } from 'react-map-gl/maplibre'
import type { Itinerary } from '../../lib/api/client'
import { measureRoute, routeAt, shapeOf } from './routeGeometry'

const DRAW_SECONDS = 1.4
/** Legs other than the focused one stay visible, faded. */
const FADE: ExpressionSpecification = ['case', ['get', 'dim'], 0.3, 1]

/** The selected option on the map; with `focus`, every other leg is faded so that one stands out. */
export function RouteLine({ itinerary, focus = null }: { itinerary: Itinerary; focus?: number | null }) {
  const route = useMemo(() => measureRoute(itinerary.legs), [itinerary])
  const shape = useMemo(() => shapeOf(itinerary.legs), [itinerary])
  // Riders who ask for less motion get the whole line at once.
  const reduce = useReducedMotion()
  // Progress is tied to the line it belongs to, so a new one starts undrawn instead of
  // flashing fully drawn for a frame, and the same line in a new answer stays drawn.
  const [drawn, setDrawn] = useState({ shape, progress: 0 })
  const progress = reduce ? 1 : drawn.shape === shape ? drawn.progress : 0

  useEffect(() => {
    if (reduce) return
    const controls = animate(0, 1, {
      duration: DRAW_SECONDS,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (v) => setDrawn({ shape, progress: v }),
    })
    return () => controls.stop()
  }, [shape, reduce])

  const data = useMemo(() => routeAt(route, progress, focus), [route, progress, focus])
  // The lines go under the map's labels, so the names of the streets on the way stay readable;
  // the haltes stay on top.
  const { current: map } = useMap()
  const labels = useMemo(() => map?.getLayersOrder().find((id) => map.getLayer(id)?.type === 'symbol'), [map])

  return (
    <Source id="route" type="geojson" data={data}>
      <Layer
        id="route-walk"
        beforeId={labels}
        type="line"
        filter={['==', ['get', 'kind'], 'walk']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [0, 2], 'line-opacity': FADE }}
      />
      <Layer
        id="route-casing"
        beforeId={labels}
        type="line"
        filter={['==', ['get', 'kind'], 'transit']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': FADE }}
      />
      <Layer
        id="route-transit"
        beforeId={labels}
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
