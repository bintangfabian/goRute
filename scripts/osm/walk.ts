// Builds the walking network for data/walk.bin from the OpenStreetMap ways
// that pedestrians use within reach of the haltes.

import { COORD_SCALE, WAY_KINDS, type WalkFile, type WayKind } from '../../server/walk/format.ts'
import { readOsm, type Tags } from './pbf.ts'

/** Ways this far from every halte are left out: nobody walks that far to a bus. */
const NEAR_STOP_DEG = 0.03 // ~3.3 km
const NEAR_CELL_DEG = 0.01
/** Shape points closer than this to the line through their neighbours add nothing to a walk. */
const SIMPLIFY_M = 2
/**
 * Islands of paths smaller than this (a footway inside a mall, a broken bit
 * of mapping) are left out, so no trip end gets snapped onto one.
 */
const MIN_ISLAND_NODES = 40

const WALKABLE = new Set([
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'living street',
  'service',
  'road',
  'track',
  'pedestrian',
  'footway',
  'path',
  'steps',
  'cycleway',
  'bridleway',
  'corridor',
  'platform',
  'crossing',
])
const MOTOR_ROAD = /^(trunk|primary|secondary|tertiary)(_link)?$/
/** Flyovers and car underpasses (with their ramps) are rarely tagged foot=no, but nobody walks them. */
const FLYOVER = /fly ?over|layang|overpass|underpass|terowongan/i
/** Spokes across a square, at most: enough to cross it from any side. */
const MAX_SPOKES = 48
/** Points are added around a square this far apart, so a spoke starts near wherever one walks in. */
const SPOKE_GAP_M = 20
/** Roads a footbridge over them makes a jembatan penyeberangan (JPO), not just a bridge over a ditch. */
const CROSSED_ROAD = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^busway$/
const RESTRICTED = new Set(['private', 'customers', 'permit', 'delivery', 'employees', 'agricultural', 'forestry'])
const FOOT_ALLOWED = new Set(['yes', 'designated', 'permissive'])
/** Sidewalks on the road itself; "separate" ones are mapped as footways of their own. */
const SIDEWALK = new Set(['both', 'left', 'right', 'yes'])
const yes = (v: string | undefined) => v !== undefined && v !== 'no'

/** Whether pedestrians may use a way, and what it is; null when they may not. */
export function walkable(t: Tags): { kind: WayKind; penalty: number } | null {
  const highway = t.get('highway')
  if (!highway || !WALKABLE.has(highway)) return null
  const foot = t.get('foot')
  const access = t.get('access')
  if (foot === 'no' || foot === 'use_sidepath') return null
  const footAllowed = FOOT_ALLOWED.has(foot ?? '')
  if (access === 'no' && !footAllowed) return null
  if (t.get('motorroad') === 'yes' && !footAllowed) return null
  // A main road is a flyover or a car underpass when its name says so (its ramps too, which
  // often lack the bridge or tunnel tag), or when it runs on a bridge above other roads.
  const raised = yes(t.get('bridge')) || yes(t.get('tunnel'))
  if (MOTOR_ROAD.test(highway) && (FLYOVER.test(t.get('name') ?? '') || (raised && Number(t.get('layer')) >= 2))) {
    if (!footAllowed && !SIDEWALK.has(t.get('sidewalk') ?? '')) return null
  }
  // Private roads (gated housing, campuses) are fine to leave or reach home by, not to cut through.
  const restricted = (RESTRICTED.has(access ?? '') || RESTRICTED.has(foot ?? '')) && !footAllowed
  return { kind: kindOf(highway, t), penalty: restricted ? 16 : 10 }
}

/**
 * What a way is, for directions. A bridge for walkers is a plain bridge here;
 * the build makes it a footbridge (JPO) when it crosses a main road.
 */
function kindOf(highway: string, t: Tags): WayKind {
  const footpath = ['footway', 'path', 'pedestrian', 'cycleway', 'bridleway', 'corridor'].includes(highway)
  if (t.get('footway') === 'crossing' || highway === 'crossing' || (footpath && t.has('crossing'))) return 'crossing'
  if (highway === 'steps') return 'steps'
  // The sidewalk of a road bridge is just more sidewalk.
  const sidewalk = t.get('footway') === 'sidewalk'
  if (footpath && !sidewalk && yes(t.get('bridge'))) return 'bridge'
  if (footpath && !sidewalk && yes(t.get('tunnel')) && t.get('tunnel') !== 'building_passage') return 'underpass'
  if (highway === 'platform' || t.get('public_transport') === 'platform') return 'platform'
  if (highway === 'pedestrian') return 'pedestrian'
  if (highway === 'footway' || highway === 'corridor') return 'footway'
  if (footpath || highway === 'track') return 'path'
  if (highway === 'service' || highway.startsWith('living')) return 'alley'
  return 'road'
}

export type StopPoints = { id: string[]; lat: number[]; lon: number[] }

type Way = { nodes: number[]; name: number; kind: number; penalty: number; area: boolean }

/** The network without transfers, which need the network itself (see pathTransfers). */
export function buildWalkFile(pbfPath: string, stops: StopPoints, builtAt: Date): WalkFile {
  const near = nearStopCells(stops)
  const isNear = (lat: number, lon: number) => near.has(cell(lat, lon))

  // Node IDs come sorted in a PBF file and ways come after all nodes, so one pass
  // collects coordinates first and looks them up by binary search.
  let ids = new Float64Array(1 << 20)
  let lats = new Float64Array(1 << 20)
  let lons = new Float64Array(1 << 20)
  let count = 0
  const index = (id: number) => {
    let lo = 0
    let hi = count - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (ids[mid] === id) return mid
      if (ids[mid] < id) lo = mid + 1
      else hi = mid - 1
    }
    return -1
  }
  const names = new Map<string, number>()
  const ways: Way[] = []
  // Main roads near the haltes, which a bridge for walkers may cross.
  const roads: number[][] = []
  readOsm(pbfPath, {
    node(id, lat, lon) {
      if (count === ids.length) {
        const grow = (a: Float64Array) => {
          const b = new Float64Array(a.length * 2)
          b.set(a)
          return b
        }
        ids = grow(ids)
        lats = grow(lats)
        lons = grow(lons)
      }
      ids[count] = id
      lats[count] = lat
      lons[count] = lon
      count++
    },
    way(_id, refs, tags) {
      const use = walkable(tags)
      const crossable = CROSSED_ROAD.test(tags.get('highway') ?? '') && !yes(tags.get('bridge')) && !yes(tags.get('tunnel'))
      if (!use && !crossable) return
      const nodes = refs.map(index).filter((i) => i >= 0)
      if (nodes.length < 2 || !nodes.some((i) => isNear(lats[i], lons[i]))) return
      if (crossable) roads.push(nodes)
      if (!use) return
      const name = (tags.get('name') ?? '').replace(/\s+/g, ' ').trim()
      let n = -1
      if (name) {
        n = names.get(name) ?? names.size
        names.set(name, n)
      }
      const area = tags.get('area') === 'yes' && nodes.length >= 4 && nodes[0] === nodes[nodes.length - 1]
      ways.push({ nodes, name: n, kind: WAY_KINDS.indexOf(use.kind), penalty: use.penalty, area })
    },
  })

  markFootbridges(ways, roads, lats, lons)

  // A square or plaza mapped as an area is walked across, not only around: points every
  // SPOKE_GAP_M around it, and spokes from its middle to them.
  const addNode = (lat: number, lon: number) => {
    if (count === lats.length) {
      const grow = (a: Float64Array) => {
        const b = new Float64Array(a.length * 2)
        b.set(a)
        return b
      }
      lats = grow(lats)
      lons = grow(lons)
    }
    lats[count] = lat
    lons[count] = lon
    return count++
  }
  for (const w of ways.filter((x) => x.area)) {
    const around = [w.nodes[0]]
    for (let i = 1; i < w.nodes.length; i++) {
      const [a, b] = [w.nodes[i - 1], w.nodes[i]]
      const gaps = Math.floor(meters(lats[a], lons[a], lats[b], lons[b]) / SPOKE_GAP_M)
      for (let k = 1; k < gaps; k++) around.push(addNode(lats[a] + ((lats[b] - lats[a]) * k) / gaps, lons[a] + ((lons[b] - lons[a]) * k) / gaps))
      around.push(b)
    }
    w.nodes = around
    const ring = around.slice(1)
    const middle = addNode(ring.reduce((sum, n) => sum + lats[n], 0) / ring.length, ring.reduce((sum, n) => sum + lons[n], 0) / ring.length)
    const step = Math.ceil(ring.length / MAX_SPOKES)
    for (let i = 0; i < ring.length; i += step) {
      ways.push({ nodes: [middle, ring[i]], name: w.name, kind: w.kind, penalty: w.penalty, area: false })
    }
  }

  // Nodes shared by ways, and way ends, hold the network together and always stay.
  const uses = new Uint8Array(count)
  for (const w of ways) {
    w.nodes.forEach((n, i) => (uses[n] = Math.min(255, uses[n] + (i === 0 || i === w.nodes.length - 1 ? 2 : 1))))
  }
  for (const w of ways) w.nodes = simplify(w.nodes, (n) => uses[n] >= 2, lats, lons)

  // Drop islands: union-find over the edges.
  const parent = new Int32Array(count).map((_, i) => i)
  const root = (n: number): number => {
    while (parent[n] !== n) n = parent[n] = parent[parent[n]]
    return n
  }
  for (const w of ways) for (let i = 1; i < w.nodes.length; i++) parent[root(w.nodes[i])] = root(w.nodes[i - 1])
  const size = new Int32Array(count)
  for (const w of ways) for (const n of w.nodes) size[root(n)]++ // counts a shared node once per way: close enough
  const kept = ways.filter((w) => size[root(w.nodes[0])] >= MIN_ISLAND_NODES)

  // Number nodes along the chains so neighbours get neighbouring numbers.
  const number = new Int32Array(count).fill(-1)
  const lat: number[] = []
  const lon: number[] = []
  const chainStart = [0]
  const chainNodes: number[] = []
  for (const w of kept) {
    for (const n of w.nodes) {
      if (number[n] < 0) {
        number[n] = lat.length
        lat.push(Math.round(lats[n] * COORD_SCALE))
        lon.push(Math.round(lons[n] * COORD_SCALE))
      }
      chainNodes.push(number[n])
    }
    chainStart.push(chainNodes.length)
  }

  // Names that only dropped ways used go too.
  const used = [...new Set(kept.map((w) => w.name).filter((n) => n >= 0))].sort((a, b) => a - b)
  const renamed = new Map(used.map((n, i) => [n, i]))
  const allNames = [...names.keys()]

  return {
    builtAt: builtAt.toISOString(),
    lat: Int32Array.from(lat),
    lon: Int32Array.from(lon),
    chainStart: Int32Array.from(chainStart),
    chainNodes: Int32Array.from(chainNodes),
    chainName: Int32Array.from(kept, (w) => (w.name < 0 ? -1 : renamed.get(w.name)!)),
    chainKind: Uint8Array.from(kept, (w) => w.kind),
    chainPenalty: Uint8Array.from(kept, (w) => w.penalty),
    names: used.map((n) => allNames[n]),
    stopIds: stops.id,
    transferStart: new Int32Array(stops.id.length + 1),
    transferStop: new Int32Array(0),
    transferMeters: new Int32Array(0),
    transferSeconds: new Int32Array(0),
  }
}

/**
 * Makes the bridges for walkers that cross a main road footbridges (JPO), with
 * the bridge ways joined to them (ramps, landings): the rest cross a ditch or a
 * river and stay plain bridges.
 */
function markFootbridges(ways: Way[], roads: number[][], lats: Float64Array, lons: Float64Array) {
  const BRIDGE = WAY_KINDS.indexOf('bridge')
  const FOOTBRIDGE = WAY_KINDS.indexOf('footbridge')
  const CELL = 0.002
  const key = (y: number, x: number) => y * 1_000_000 + x
  const segments = new Map<number, number[]>()
  const cellsOf = (a: number, b: number, fn: (key: number) => void) => {
    for (let y = Math.floor(Math.min(lats[a], lats[b]) / CELL); y <= Math.floor(Math.max(lats[a], lats[b]) / CELL); y++) {
      for (let x = Math.floor(Math.min(lons[a], lons[b]) / CELL); x <= Math.floor(Math.max(lons[a], lons[b]) / CELL); x++) fn(key(y, x))
    }
  }
  for (const r of roads) {
    for (let i = 1; i < r.length; i++) {
      cellsOf(r[i - 1], r[i], (k) => {
        const list = segments.get(k)
        if (list) list.push(r[i - 1], r[i])
        else segments.set(k, [r[i - 1], r[i]])
      })
    }
  }
  const side = (a: number, b: number, p: number) => Math.sign((lons[b] - lons[a]) * (lats[p] - lats[a]) - (lats[b] - lats[a]) * (lons[p] - lons[a]))
  // A crossing, not a bridge that ends on the road.
  const cross = (a: number, b: number, c: number, d: number) =>
    a !== c && a !== d && b !== c && b !== d && side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
  const crossesRoad = (nodes: number[]) => {
    for (let i = 1; i < nodes.length; i++) {
      let found = false
      cellsOf(nodes[i - 1], nodes[i], (k) => {
        const list = segments.get(k) ?? []
        for (let j = 0; j < list.length && !found; j += 2) found = cross(nodes[i - 1], nodes[i], list[j], list[j + 1])
      })
      if (found) return true
    }
    return false
  }
  const bridges = ways.filter((w) => w.kind === BRIDGE)
  const queue = bridges.filter((w) => crossesRoad(w.nodes))
  for (const w of queue) w.kind = FOOTBRIDGE
  const byNode = new Map<number, Way[]>()
  for (const w of bridges) for (const n of w.nodes) byNode.set(n, [...(byNode.get(n) ?? []), w])
  while (queue.length > 0) {
    for (const n of queue.pop()!.nodes) {
      for (const w of byNode.get(n) ?? []) {
        if (w.kind !== BRIDGE) continue
        w.kind = FOOTBRIDGE
        queue.push(w)
      }
    }
  }
}

const cellY = (lat: number) => Math.floor((lat + 90) / NEAR_CELL_DEG)
const cellX = (lon: number) => Math.floor((lon + 180) / NEAR_CELL_DEG)
const cell = (lat: number, lon: number) => cellY(lat) * 100_000 + cellX(lon)

/** Grid cells within about NEAR_STOP_DEG of a halte, counted in whole cells so no cell between them is skipped. */
function nearStopCells(stops: StopPoints): Set<number> {
  const out = new Set<number>()
  const r = Math.ceil(NEAR_STOP_DEG / NEAR_CELL_DEG)
  for (let i = 0; i < stops.lat.length; i++) {
    const y = cellY(stops.lat[i])
    const x = cellX(stops.lon[i])
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) if (dy * dy + dx * dx <= r * r + 1) out.add((y + dy) * 100_000 + x + dx)
    }
  }
  return out
}

/**
 * Douglas-Peucker between the nodes that must stay: drops shape points within
 * SIMPLIFY_M of the line through the points kept around them.
 */
export function simplify(nodes: number[], fixed: (n: number) => boolean, lats: Float64Array, lons: Float64Array): number[] {
  const keep = new Uint8Array(nodes.length)
  keep[0] = 1
  keep[nodes.length - 1] = 1
  for (let i = 1; i < nodes.length - 1; i++) if (fixed(nodes[i])) keep[i] = 1
  const stack: [number, number][] = []
  let from = 0
  for (let i = 1; i < nodes.length; i++) {
    if (!keep[i]) continue
    stack.push([from, i])
    from = i
  }
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    if (b - a < 2) continue
    const k = Math.cos(lats[nodes[a]] * (Math.PI / 180)) * 111_320
    const ax = lons[nodes[a]] * k
    const ay = lats[nodes[a]] * 111_320
    const dx = lons[nodes[b]] * k - ax
    const dy = lats[nodes[b]] * 111_320 - ay
    const len2 = dx * dx + dy * dy
    let worst = -1
    let worstD = SIMPLIFY_M
    for (let i = a + 1; i < b; i++) {
      const px = lons[nodes[i]] * k - ax
      const py = lats[nodes[i]] * 111_320 - ay
      const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0
      const d = Math.hypot(px - t * dx, py - t * dy)
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return nodes.filter((_, i) => keep[i])
}

function meters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const k = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  return Math.hypot((lon2 - lon1) * k * 111_320, (lat2 - lat1) * 111_320)
}
