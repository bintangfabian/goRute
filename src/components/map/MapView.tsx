import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ReactNode } from 'react'
import Map from 'react-map-gl/maplibre'
import { inServiceArea, type Endpoint } from '../../lib/trip'

// MapLibre derives its worker URL from import.meta.url, which no longer
// points next to the worker once Vite bundles it (dev or build). Load the
// library lazily, as react-map-gl would, and point it at the worker Vite
// bundles for us.
const maplibre = import('maplibre-gl').then((lib) => {
  lib.setWorkerUrl(workerUrl)
  return lib
})

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

export function MapView({ children, onPick, onOutside }: Props) {
  return (
    <Map
      mapLib={maplibre}
      initialViewState={MONAS}
      maxBounds={JABODETABEK_BOUNDS}
      mapStyle="https://tiles.openfreemap.org/styles/positron"
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

export function MapAttribution() {
  return (
    <p className="text-center text-[10px] text-slate-500">
      <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
        OpenFreeMap
      </a>{' '}
      ©{' '}
      <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
        OpenMapTiles
      </a>{' '}
      · Data ©{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        kontributor OpenStreetMap
      </a>
    </p>
  )
}
