import { useEffect, useRef, type RefObject } from 'react'
import { useMap, type MapRef } from 'react-map-gl/maplibre'
import type { Itinerary } from '../../lib/api/client'
import type { Endpoint } from '../../lib/trip'
import { routeBounds } from './routeGeometry'

type Props = {
  origin: Endpoint | null
  destination: Endpoint | null
  itinerary: Itinerary | null
  // The panel covering part of the map.
  sheet: RefObject<HTMLElement | null>
  // The panel shows a message instead of routes (no trip, an error), which can make it taller.
  message: boolean
}

const MONAS: [number, number] = [106.8272, -6.1754]

// Moves the camera to whatever the user is looking at: the selected
// route, otherwise the chosen endpoints, otherwise central Jakarta.
export function CameraFollow({ origin, destination, itinerary, sheet, message }: Props) {
  const { current: map } = useMap()
  const placed = useRef(false)

  useEffect(() => {
    if (!map) return
    let cancelled = false
    const move = () => {
      if (cancelled) return
      follow(map, sheet.current, [origin, destination], itinerary, !placed.current)
      placed.current = true
    }
    // The panel may still be easing to a new height (e.g. shrinking after a search): measure it once it rests.
    const settling = sheet.current?.getAnimations().filter((a) => 'transitionProperty' in a) ?? []
    if (settling.length > 0) void Promise.all(settling.map((a) => a.finished.catch(() => undefined))).then(move)
    else move()
    return () => {
      cancelled = true
    }
    // message is not read above: it changes the panel's height, so the camera fits again.
  }, [map, origin, destination, itinerary, sheet, message])

  return null
}

function follow(map: MapRef, panel: HTMLElement | null, ends: (Endpoint | null)[], itinerary: Itinerary | null, first: boolean) {
  // Measure the panel when moving rather than tracking its size: it grows
  // in the very render that shows a new route, and the panel resizing by
  // itself (e.g. while typing) should not move the camera. Layout sizes,
  // not screen rects, so the panel sliding in on load does not skew them.
  const view = map.getContainer()
  // On wide screens the panel stands on the left; on phones it covers the bottom
  // and the brand bar floats on top, so the 40 px destination pin needs room below it.
  // Either way, keep at least a strip of map visible.
  const side = !!panel && panel.offsetHeight > view.clientHeight * 0.6 && panel.offsetWidth < view.clientWidth * 0.5
  const padding = { top: side ? 64 : 104, left: 48, right: 48, bottom: 48 }
  if (panel && side) padding.left = Math.min(panel.offsetLeft + panel.offsetWidth + 32, view.clientWidth - 48 - 160)
  // A short phone can leave only ~65 px between the brand bar and the sheet (a message
  // with a button takes more of it than route cards do), so the route may get as little as 48.
  else if (panel) padding.bottom = Math.min(panel.offsetHeight + 24, view.clientHeight - padding.top - 48)
  // Shift with offset, not padding: flyTo keeps its padding on the map,
  // and later fitBounds calls would add their own on top of it.
  const offset: [number, number] = [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2]
  const points = ends.filter((p): p is Endpoint => p !== null)
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
    map.flyTo({ center: [points[0].lon, points[0].lat], zoom: 14, offset, duration: 900 })
  } else if (first) {
    // First view: central Jakarta in the part of the map the panel leaves visible.
    map.easeTo({ center: MONAS, offset, duration: 0 })
  }
}
