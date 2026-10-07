// A walking network for tests, written as streets instead of OSM.

import { COORD_SCALE, WAY_KINDS, type WalkFile, type WayKind } from '../walk/format.ts'

export type Street = {
  name?: string
  kind?: WayKind
  /** Cost multiplier in tenths, 10 for none (see WalkFile.chainPenalty). */
  penalty?: number
  /** [lat, lon] points; streets that share a point meet there. */
  points: [number, number][]
}

export function testWalkFile(streets: Street[], stopIds: string[] = []): WalkFile {
  const nodes = new Map<string, number>()
  const lat: number[] = []
  const lon: number[] = []
  const names: string[] = []
  const chainStart = [0]
  const chainNodes: number[] = []
  for (const street of streets) {
    for (const [la, lo] of street.points) {
      const ila = Math.round(la * COORD_SCALE)
      const ilo = Math.round(lo * COORD_SCALE)
      const key = `${ila},${ilo}`
      let n = nodes.get(key)
      if (n === undefined) {
        nodes.set(key, (n = lat.length))
        lat.push(ila)
        lon.push(ilo)
      }
      chainNodes.push(n)
    }
    chainStart.push(chainNodes.length)
    if (street.name && !names.includes(street.name)) names.push(street.name)
  }
  return {
    builtAt: '2026-10-08T00:00:00.000Z',
    lat: Int32Array.from(lat),
    lon: Int32Array.from(lon),
    chainStart: Int32Array.from(chainStart),
    chainNodes: Int32Array.from(chainNodes),
    chainName: Int32Array.from(streets, (s) => (s.name ? names.indexOf(s.name) : -1)),
    chainKind: Uint8Array.from(streets, (s) => WAY_KINDS.indexOf(s.kind ?? 'road')),
    chainPenalty: Uint8Array.from(streets, (s) => s.penalty ?? 10),
    names,
    stopIds,
    transferStart: new Int32Array(stopIds.length + 1),
    transferStop: new Int32Array(0),
    transferMeters: new Int32Array(0),
  }
}
