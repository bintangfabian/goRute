import Map from 'react-map-gl/maplibre'

const MONAS = { longitude: 106.8272, latitude: -6.1754, zoom: 11 }
// [west, south, east, north]
const JABODETABEK_BOUNDS: [number, number, number, number] = [105.9, -7.1, 107.6, -5.6]

export function MapView() {
  return (
    <Map
      initialViewState={MONAS}
      maxBounds={JABODETABEK_BOUNDS}
      mapStyle="https://tiles.openfreemap.org/styles/positron"
      style={{ position: 'absolute', inset: 0 }}
    />
  )
}
