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
const MOTOR_ROAD = /^(trunk|primary|secondary)(_link)?$/
/** Flyovers and car underpasses are rarely tagged foot=no, but nobody walks them. */
const FLYOVER = /fly ?over|layang|overpass|underpass|terowongan/i
const RESTRICTED = new Set(['private', 'customers', 'permit', 'delivery', 'employees', 'agricultural', 'forestry'])
const FOOT_ALLOWED = new Set(['yes', 'designated', 'permissive'])
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
  if (MOTOR_ROAD.test(highway) && (yes(t.get('bridge')) || yes(t.get('tunnel'))) && FLYOVER.test(t.get('name') ?? '')) {
    if (!footAllowed && !t.get('sidewalk')) return null
  }
  // Private roads (gated housing, campuses) are fine to leave or reach home by, not to cut through.
  const penalty = RESTRICTED.has(access ?? '') && !footAllowed ? 16 : 10
  return { kind: kindOf(highway, t), penalty }
}

function kindOf(highway: string, t: Tags): WayKind {
  const footpath = ['footway', 'path', 'pedestrian', 'cycleway', 'bridleway', 'corridor'].includes(highway)
  if (t.get('footway') === 'crossing' || highway === 'crossing' || (footpath && t.has('crossing'))) return 'crossing'
  if (highway === 'steps') return 'steps'
  if (footpath && yes(t.get('bridge'))) return 'footbridge'
  if (footpath && yes(t.get('tunnel'))) return 'underpass'
  if (highway === 'platform' || t.get('public_transport') === 'platform') return 'platform'
  if (highway === 'pedestrian') return 'pedestrian'
  if (highway === 'footway' || highway === 'corridor') return 'footway'
  if (footpath || highway === 'track') return 'path'
  if (highway === 'service' || highway.startsWith('living')) return 'alley'
  return 'road'
}

export type StopPoints = { id: string[]; lat: number[]; lon: number[] }

type Way = { nodes: number[]; name: number; kind: number; penalty: number }

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
      if (!use) return
      const nodes = refs.map(index).filter((i) => i >= 0)
      if (nodes.length < 2 || !nodes.some((i) => isNear(lats[i], lons[i]))) return
      const name = (tags.get('name') ?? '').replace(/\s+/g, ' ').trim()
      let n = -1
      if (name) {
        n = names.get(name) ?? names.size
        names.set(name, n)
      }
      ways.push({ nodes, name: n, kind: WAY_KINDS.indexOf(use.kind), penalty: use.penalty })
    },
  })

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
  }
}

const cell = (lat: number, lon: number) =>
  Math.floor((lat + 90) / NEAR_CELL_DEG) * 100_000 + Math.floor((lon + 180) / NEAR_CELL_DEG)

/** Grid cells within about NEAR_STOP_DEG of a halte. */
function nearStopCells(stops: StopPoints): Set<number> {
  const out = new Set<number>()
  const r = Math.ceil(NEAR_STOP_DEG / NEAR_CELL_DEG)
  for (let i = 0; i < stops.lat.length; i++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dy * dy + dx * dx <= r * r + 1) out.add(cell(stops.lat[i] + dy * NEAR_CELL_DEG, stops.lon[i] + dx * NEAR_CELL_DEG))
      }
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
