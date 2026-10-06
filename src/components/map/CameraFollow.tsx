import { useEffect, type RefObject } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type { Itinerary } from '../../lib/api/client'
import type { Endpoint } from '../../lib/trip'
import { routeBounds } from './routeGeometry'

type Props = {
  origin: Endpoint | null
  destination: Endpoint | null
  itinerary: Itinerary | null
  // The bottom sheet covering the map.
  sheet: RefObject<HTMLElement | null>
}

// Moves the camera to whatever the user is looking at: the selected
// route, otherwise the chosen endpoints.
export function CameraFollow({ origin, destination, itinerary, sheet }: Props) {
  const { current: map } = useMap()

  useEffect(() => {
    if (!map) return
    // Measure the sheet when moving rather than tracking its size: it grows
    // in the very render that shows a new route, and the sheet resizing by
    // itself (e.g. while typing) should not move the camera.
    const inset = sheet.current?.offsetHeight ?? 0
    // Keep at least a strip of map visible even when the sheet is tall.
    const height = map.getContainer().clientHeight
    const padding = { top: 72, left: 48, right: 48, bottom: Math.min(inset + 32, height - 72 - 160) }
    const points = [origin, destination].filter((p): p is Endpoint => p !== null)
    const bounds = itinerary ? routeBounds(itinerary.legs) : null

    if (bounds) {
      map.fitBounds(bounds, { padding, duration: 900, maxZoom: 16 })
    } else if (points.length === 2) {
      const lons = points.map((p) => p.lon)
      const lats = points.map((p) => p.lat)
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding, duration: 900, maxZoom: 15 },
      )
    } else if (points.length === 1) {
      // Shift with offset, not padding: flyTo keeps its padding on the map,
      // and later fitBounds calls would add their own on top of it.
      map.flyTo({
        center: [points[0].lon, points[0].lat],
        zoom: 14,
        offset: [0, (padding.top - padding.bottom) / 2],
        duration: 900,
      })
    }
  }, [map, origin, destination, itinerary, sheet])

  return null
}
