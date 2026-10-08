import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { StyleSpecification } from 'maplibre-gl'
import { Suspense, use, type ReactNode } from 'react'
import Map from 'react-map-gl/maplibre'
import { inServiceArea, type Endpoint } from '../../lib/trip'
import { tuneStyle } from './mapStyle'

// MapLibre derives its worker URL from import.meta.url, which no longer
// points next to the worker once Vite bundles it (dev or build). Load the
// library lazily, as react-map-gl would, and point it at the worker Vite
// bundles for us.
const maplibre = import('maplibre-gl').then((lib) => {
  lib.setWorkerUrl(workerUrl)
  return lib
})

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
// Fetched here rather than by MapLibre, so it can be tuned first; it starts with the page,
// as MapLibre's own request would have. If it fails, MapLibre gets the URL and tries itself.
const mapStyle: Promise<StyleSpecification | string> = fetch(STYLE_URL)
  .then((res) => (res.ok ? (res.json() as Promise<StyleSpecification>) : Promise.reject(new Error(`map style: ${res.status}`))))
  .then(tuneStyle)
  .catch(() => STYLE_URL)

const MONAS = { longitude: 106.8272, latitude: -6.1754, zoom: 11 }
// [west, south, east, north]
const JABODETABEK_BOUNDS: [number, number, number, number] = [105.9, -7.1, 107.6, -5.6]

type Props = {
  children?: ReactNode
  // Called when the user taps a point inside the service area.
  onPick?: (point: Endpoint) => void
  // Called for a tap outside it, so the tap is not silently ignored.
  onOutside?: () => void
}

// The page draws without waiting for the map style; the map appears when it has one.
export function MapView(props: Props) {
  return (
    <Suspense fallback={null}>
      <StyledMap {...props} />
    </Suspense>
  )
}

function StyledMap({ children, onPick, onOutside }: Props) {
  return (
    <Map
      mapLib={maplibre}
      initialViewState={MONAS}
      maxBounds={JABODETABEK_BOUNDS}
      mapStyle={use(mapStyle)}
      style={{ position: 'absolute', inset: 0 }}
      // Attribution is shown in the bottom sheet (MapAttribution), which
      // would otherwise cover MapLibre's control.
      attributionControl={false}
      onClick={(e) => {
        const { lat, lng } = e.lngLat
        if (inServiceArea(lat, lng)) onPick?.({ name: 'Titik di peta', lat, lon: lng })
        else onOutside?.()
      }}
    >
      {children}
    </Map>
  )
}

const link = 'rounded-sm underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none'

/** The map's makers and the data's, each linked, on one line down to a 320 px phone. */
export function MapAttribution() {
  return (
    <p className="text-center text-[10px] leading-4 text-slate-500">
      <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className={link}>
        OpenFreeMap
      </a>{' '}
      ·{' '}
      <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer" className={link}>
        © OpenMapTiles
      </a>{' '}
      ·{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className={link}>
        © <span className="max-[359px]:hidden">kontributor </span>OpenStreetMap
      </a>
    </p>
  )
}
