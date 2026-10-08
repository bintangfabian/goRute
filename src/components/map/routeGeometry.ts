import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { Leg } from '../../lib/api/client'

type Coord = [number, number] // [lon, lat]

export type RouteFeatureProps = { kind: 'walk' | 'transit' | 'stop'; color: string; dim: boolean }

const TRANSIT_FALLBACK_COLOR = '#334155'

// Planar distance with longitude scaled by latitude: precise enough to
// pace an animation across a city.
function dist(a: Coord, b: Coord) {
  const kx = Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot((b[0] - a[0]) * kx, b[1] - a[1])
}

type MeasuredLeg = { leg: Leg; coords: Coord[]; cumulative: number[]; start: number; length: number }

export type MeasuredRoute = { legs: MeasuredLeg[]; total: number }

export function measureRoute(legs: Leg[]): MeasuredRoute {
  let offset = 0
  const measured = legs.map((leg) => {
    const coords = leg.geometry as Coord[]
    const cumulative = [0]
    for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + dist(coords[i - 1], coords[i]))
    const length = cumulative[cumulative.length - 1] ?? 0
    const m = { leg, coords, cumulative, start: offset, length }
    offset += length
    return m
  })
  return { legs: measured, total: offset }
}

// Coordinates of a leg up to `distance` along it, ending on an
// interpolated point so the line grows smoothly.
function sliceLeg(m: MeasuredLeg, distance: number): Coord[] {
  if (distance >= m.length) return m.coords
  const i = m.cumulative.findIndex((d) => d > distance)
  const [a, b] = [m.coords[i - 1], m.coords[i]]
  const t = (distance - m.cumulative[i - 1]) / (m.cumulative[i] - m.cumulative[i - 1])
  return [...m.coords.slice(0, i), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]]
}

// Route drawn up to `progress` (0..1). Board and alight points of transit
// legs appear once the line reaches them. With `focus`, other legs are marked dim.
export function routeAt(
  route: MeasuredRoute,
  progress: number,
  focus: number | null = null,
): FeatureCollection<LineString | Point, RouteFeatureProps> {
  const reached = progress * route.total
  const features: Feature<LineString | Point, RouteFeatureProps>[] = []

  route.legs.forEach((m, i) => {
    if (m.coords.length < 2 || m.start > reached) return
    const transit = m.leg.route !== null
    const color = transit ? m.leg.route?.color || TRANSIT_FALLBACK_COLOR : '#64748b'
    const dim = focus !== null && focus !== i
    const coords = sliceLeg(m, reached - m.start)
    features.push({
      type: 'Feature',
      properties: { kind: transit ? 'transit' : 'walk', color, dim },
      geometry: { type: 'LineString', coordinates: coords },
    })
    if (transit) {
      // A halte stays lit when the focused leg is the walk to or from it.
      features.push(stop(m.coords[0], color, dim && focus !== i - 1))
      if (reached >= m.start + m.length) features.push(stop(m.coords[m.coords.length - 1], color, dim && focus !== i + 1))
    }
  })
  return { type: 'FeatureCollection', features }
}

function stop(coord: Coord, color: string, dim: boolean): Feature<Point, RouteFeatureProps> {
  return { type: 'Feature', properties: { kind: 'stop', color, dim }, geometry: { type: 'Point', coordinates: coord } }
}

/**
 * A fingerprint of the route's line: a new answer drawing the same one (another time, the
 * same buses) is not animated again.
 */
export function shapeOf(legs: Leg[]): string {
  let hash = 0
  for (const leg of legs) {
    for (const [lon, lat] of leg.geometry as Coord[]) hash = (Math.imul(hash, 31) + Math.round(lon * 1e5) * 7 + Math.round(lat * 1e5)) | 0
  }
  return `${legs.length}:${hash}`
}

export function routeBounds(legs: Leg[]): [[number, number], [number, number]] | null {
  const coords = legs.flatMap((l) => l.geometry as Coord[])
  if (coords.length === 0) return null
  const lons = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ]
}
