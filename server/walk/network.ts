// Walking along OpenStreetMap paths: snapping a point to the nearest path,
// shortest walks from it (Dijkstra), and the walk itself as geometry and
// stretches for directions. The network is undirected: pedestrians ignore
// one-way streets.

import type { LonLat } from '../geo.ts'
import { WALK_SPEED } from './estimate.ts'
import { COORD_SCALE, WAY_KINDS, type WalkFile, type WayKind } from './format.ts'

/** Stairs take longer than their length suggests. */
const STEPS_SLOWDOWN = 1.6

const M_PER_DEG = 111_320
const CELL_DEG = 0.002 // ~220 m
const CELL_M = CELL_DEG * M_PER_DEG
const cellKey = (y: number, x: number) => y * 200_000 + x
const cellY = (lat: number) => Math.floor((lat + 90) / CELL_DEG)
const cellX = (lon: number) => Math.floor((lon + 180) / CELL_DEG)

/** A point on the network, where a walk starts or ends. */
export type Snap = {
  edge: number
  /** Position along the edge, 0 at its first node and 1 at its second. */
  t: number
  lat: number
  lon: number
  /** The point that was snapped, and the straight walk from it onto the path. */
  fromLat: number
  fromLon: number
  offsetM: number
}

/** One piece of a walk: a straight line along a way, or the step from a point onto the path. */
export type Stretch = {
  from: LonLat
  to: LonLat
  meters: number
  /** The way walked along, or -1 for the step onto the path. */
  chain: number
}

export type WalkCost = { meters: number; sec: number; cost: number }

export class WalkNetwork {
  readonly builtAt: string
  readonly nodeCount: number
  readonly lat: Float64Array
  readonly lon: Float64Array
  readonly edgeA: Int32Array
  readonly edgeB: Int32Array
  readonly edgeChain: Int32Array
  readonly edgeLen: Float32Array
  /** Cost per meter: slowdown on stairs times the penalty of the way. */
  readonly edgeWeight: Float32Array
  /** Seconds per meter. */
  readonly edgePace: Float32Array
  readonly chainName: Int32Array
  readonly chainKind: Uint8Array
  readonly names: string[]
  readonly stopIds: string[]
  private readonly adjStart: Int32Array
  private readonly adjEdge: Int32Array
  private readonly cells = new Map<number, number>()
  private readonly cellStart: Int32Array
  private readonly cellEdges: Int32Array
  private readonly spaces: SearchSpace[] = []

  constructor(file: WalkFile) {
    this.builtAt = file.builtAt
    this.nodeCount = file.lat.length
    this.lat = Float64Array.from(file.lat, (v) => v / COORD_SCALE)
    this.lon = Float64Array.from(file.lon, (v) => v / COORD_SCALE)
    this.chainName = file.chainName
    this.chainKind = file.chainKind
    this.names = file.names
    this.stopIds = file.stopIds

    const chains = file.chainName.length
    const edges = file.chainNodes.length - chains
    this.edgeA = new Int32Array(edges)
    this.edgeB = new Int32Array(edges)
    this.edgeChain = new Int32Array(edges)
    this.edgeLen = new Float32Array(edges)
    this.edgeWeight = new Float32Array(edges)
    this.edgePace = new Float32Array(edges)
    const degree = new Int32Array(this.nodeCount + 1)
    let e = 0
    for (let c = 0; c < chains; c++) {
      const slow = WAY_KINDS[file.chainKind[c]] === 'steps' ? STEPS_SLOWDOWN : 1
      const penalty = file.chainPenalty[c] / 10
      for (let i = file.chainStart[c]; i + 1 < file.chainStart[c + 1]; i++, e++) {
        const a = file.chainNodes[i]
        const b = file.chainNodes[i + 1]
        this.edgeA[e] = a
        this.edgeB[e] = b
        this.edgeChain[e] = c
        this.edgeLen[e] = this.meters(this.lat[a], this.lon[a], this.lat[b], this.lon[b])
        this.edgeWeight[e] = slow * penalty
        this.edgePace[e] = slow / WALK_SPEED
        degree[a + 1]++
        degree[b + 1]++
      }
    }
    this.adjStart = degree
    for (let n = 0; n < this.nodeCount; n++) this.adjStart[n + 1] += this.adjStart[n]
    this.adjEdge = new Int32Array(2 * edges)
    const fill = this.adjStart.slice(0, this.nodeCount)
    for (let i = 0; i < edges; i++) {
      this.adjEdge[fill[this.edgeA[i]]++] = i
      this.adjEdge[fill[this.edgeB[i]]++] = i
    }

    // A grid of the edges crossing each ~220 m cell, for snapping.
    const counts: number[] = []
    const forCells = (i: number, fn: (key: number) => void) => {
      const a = this.edgeA[i]
      const b = this.edgeB[i]
      for (let y = cellY(Math.min(this.lat[a], this.lat[b])); y <= cellY(Math.max(this.lat[a], this.lat[b])); y++) {
        for (let x = cellX(Math.min(this.lon[a], this.lon[b])); x <= cellX(Math.max(this.lon[a], this.lon[b])); x++) fn(cellKey(y, x))
      }
    }
    for (let i = 0; i < edges; i++) {
      forCells(i, (key) => {
        let slot = this.cells.get(key)
        if (slot === undefined) this.cells.set(key, (slot = counts.push(0) - 1))
        counts[slot]++
      })
    }
    this.cellStart = new Int32Array(counts.length + 1)
    for (let s = 0; s < counts.length; s++) this.cellStart[s + 1] = this.cellStart[s] + counts[s]
    this.cellEdges = new Int32Array(this.cellStart[counts.length])
    const at = this.cellStart.slice(0, counts.length)
    for (let i = 0; i < edges; i++) forCells(i, (key) => (this.cellEdges[at[this.cells.get(key)!]++] = i))
  }

  get edgeCount() {
    return this.edgeA.length
  }

  kindOf(chain: number): WayKind {
    return WAY_KINDS[this.chainKind[chain]]
  }

  nameOf(chain: number): string {
    const n = this.chainName[chain]
    return n < 0 ? '' : this.names[n]
  }

  /** Meters between two points; flat-earth is exact enough over a walk. */
  meters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const k = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
    const dx = (lon2 - lon1) * k * M_PER_DEG
    const dy = (lat2 - lat1) * M_PER_DEG
    return Math.sqrt(dx * dx + dy * dy)
  }

  /** The nearest point on a path within maxM of (lat, lon), or null when there is none. */
  snap(lat: number, lon: number, maxM: number): Snap | null {
    const k = Math.cos(lat * (Math.PI / 180)) * M_PER_DEG
    const y0 = cellY(lat)
    const x0 = cellX(lon)
    let best: Snap | null = null
    const rings = Math.ceil(maxM / CELL_M) + 1
    for (let r = 0; r <= rings; r++) {
      // Every edge within (r - 1) cells has been seen; stop once nothing closer can remain.
      if (best && best.offsetM <= (r - 1) * CELL_M) break
      for (let y = y0 - r; y <= y0 + r; y++) {
        for (let x = x0 - r; x <= x0 + r; x++) {
          if (Math.max(Math.abs(y - y0), Math.abs(x - x0)) !== r) continue
          const slot = this.cells.get(cellKey(y, x))
          if (slot === undefined) continue
          for (let i = this.cellStart[slot]; i < this.cellStart[slot + 1]; i++) {
            const e = this.cellEdges[i]
            const a = this.edgeA[e]
            const b = this.edgeB[e]
            const ax = (this.lon[a] - lon) * k
            const ay = (this.lat[a] - lat) * M_PER_DEG
            const bx = (this.lon[b] - lon) * k
            const by = (this.lat[b] - lat) * M_PER_DEG
            const dx = bx - ax
            const dy = by - ay
            const len2 = dx * dx + dy * dy
            const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0
            const px = ax + t * dx
            const py = ay + t * dy
            const d = Math.sqrt(px * px + py * py)
            if (d <= maxM && (!best || d < best.offsetM)) {
              best = {
                edge: e,
                t,
                lat: this.lat[a] + t * (this.lat[b] - this.lat[a]),
                lon: this.lon[a] + t * (this.lon[b] - this.lon[a]),
                fromLat: lat,
                fromLon: lon,
                offsetM: d,
              }
            }
          }
        }
      }
    }
    return best
  }

  /**
   * Shortest walks from a snapped point to every node within maxCost, ordered by
   * cost (meters, longer on stairs and private roads). The result stays valid
   * until another search runs in the same slot.
   */
  search(from: Snap, maxCost: number, slot: number): Reach {
    while (this.spaces.length <= slot) this.spaces.push(new SearchSpace(this.nodeCount))
    const s = this.spaces[slot]
    s.begin(maxCost)
    const e = from.edge
    const len = this.edgeLen[e]
    s.offer(this.edgeA[e], from.t * len * this.edgeWeight[e], from.t * len, from.t * len * this.edgePace[e], -1)
    s.offer(this.edgeB[e], (1 - from.t) * len * this.edgeWeight[e], (1 - from.t) * len, (1 - from.t) * len * this.edgePace[e], -1)
    while (s.heap.size > 0) {
      const cost = s.heap.topKey()
      const n = s.heap.pop()
      if (cost > s.cost[n]) continue
      if (cost > maxCost) break
      for (let i = this.adjStart[n]; i < this.adjStart[n + 1]; i++) {
        const edge = this.adjEdge[i]
        const m = this.edgeA[edge] === n ? this.edgeB[edge] : this.edgeA[edge]
        const l = this.edgeLen[edge]
        s.offer(m, cost + l * this.edgeWeight[edge], s.meters[n] + l, s.secs[n] + l * this.edgePace[edge], edge)
      }
    }
    return new Reach(this, s, from, s.generation)
  }
}

/** The result of one search: how far every reached node is, and the way back to the start. */
export class Reach {
  readonly net: WalkNetwork
  readonly from: Snap
  private readonly space: SearchSpace
  private readonly generation: number

  constructor(net: WalkNetwork, space: SearchSpace, from: Snap, generation: number) {
    this.net = net
    this.space = space
    this.from = from
    this.generation = generation
  }

  private check() {
    if (this.space.generation !== this.generation) throw new Error('walk: search slot reused while still in use')
  }

  /** The walk to a snapped point, both straight steps onto and off the paths included. */
  costTo(to: Snap): WalkCost | null {
    const end = this.end(to)
    if (!end) return null
    const off = this.from.offsetM + to.offsetM
    return { meters: end.meters + off, sec: end.sec + off / WALK_SPEED, cost: end.cost + off }
  }

  /** The cheapest way onto the target edge: through one of its nodes, or along the start edge itself. */
  private end(to: Snap): (WalkCost & { node: number }) | null {
    this.check()
    const { net, space: s } = this
    const e = to.edge
    const len = net.edgeLen[e]
    let best: (WalkCost & { node: number }) | null = null
    for (const [node, part] of [
      [net.edgeA[e], to.t],
      [net.edgeB[e], 1 - to.t],
    ] as const) {
      if (!s.reached(node)) continue
      const cost = s.cost[node] + part * len * net.edgeWeight[e]
      if (!best || cost < best.cost) {
        best = { node, cost, meters: s.meters[node] + part * len, sec: s.secs[node] + part * len * net.edgePace[e] }
      }
    }
    if (to.edge === this.from.edge) {
      const part = Math.abs(to.t - this.from.t)
      const cost = part * len * net.edgeWeight[e]
      if (!best || cost <= best.cost) best = { node: -1, cost, meters: part * len, sec: part * len * net.edgePace[e] }
    }
    return best
  }

  /** The walk to a snapped point as straight pieces, from the start point to the target point. */
  pathTo(to: Snap): Stretch[] | null {
    const end = this.end(to)
    if (!end) return null
    const { net, space: s, from } = this
    const point = (n: number): LonLat => [net.lon[n], net.lat[n]]
    const out: Stretch[] = []
    const add = (a: LonLat, b: LonLat, chain: number) => {
      const meters = net.meters(a[1], a[0], b[1], b[0])
      if (meters > 0.01) out.push({ from: a, to: b, meters, chain })
    }
    const start: LonLat = [from.fromLon, from.fromLat]
    const onPath: LonLat = [from.lon, from.lat]
    const target: LonLat = [to.lon, to.lat]
    add(start, onPath, -1)
    if (end.node < 0) {
      add(onPath, target, net.edgeChain[to.edge])
    } else {
      // Back from the end node to the start edge, then flipped.
      const nodes: number[] = [end.node]
      const via: number[] = []
      for (let n = end.node; s.pred[n] >= 0; ) {
        const edge = s.pred[n]
        via.push(edge)
        n = net.edgeA[edge] === n ? net.edgeB[edge] : net.edgeA[edge]
        nodes.push(n)
      }
      nodes.reverse()
      via.reverse()
      add(onPath, point(nodes[0]), net.edgeChain[from.edge])
      for (let i = 0; i < via.length; i++) add(point(nodes[i]), point(nodes[i + 1]), net.edgeChain[via[i]])
      add(point(nodes[nodes.length - 1]), target, net.edgeChain[to.edge])
    }
    add(target, [to.fromLon, to.fromLat], -1)
    return out
  }
}

/** Per-node search state, reused between searches: a generation stamp marks what is current. */
class SearchSpace {
  readonly cost: Float64Array
  readonly meters: Float32Array
  readonly secs: Float32Array
  readonly pred: Int32Array
  private readonly stamp: Uint32Array
  readonly heap = new Heap()
  generation = 0
  /** Nodes costlier than this were seen but never settled, so their cost may be too high. */
  private limit = 0

  constructor(nodes: number) {
    this.cost = new Float64Array(nodes)
    this.meters = new Float32Array(nodes)
    this.secs = new Float32Array(nodes)
    this.pred = new Int32Array(nodes)
    this.stamp = new Uint32Array(nodes)
  }

  begin(limit: number) {
    this.generation++
    this.limit = limit
    this.heap.clear()
  }

  reached(n: number): boolean {
    return this.stamp[n] === this.generation && this.cost[n] <= this.limit
  }

  offer(n: number, cost: number, meters: number, secs: number, pred: number) {
    if (this.stamp[n] === this.generation && this.cost[n] <= cost) return
    this.stamp[n] = this.generation
    this.cost[n] = cost
    this.meters[n] = meters
    this.secs[n] = secs
    this.pred[n] = pred
    this.heap.push(cost, n)
  }
}

/** A binary min-heap of (cost, node) on typed arrays. Stale entries are skipped by the caller. */
class Heap {
  private keys = new Float64Array(4096)
  private vals = new Int32Array(4096)
  size = 0

  clear() {
    this.size = 0
  }

  topKey(): number {
    return this.keys[0]
  }

  push(key: number, val: number) {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2)
      keys.set(this.keys)
      this.keys = keys
      const vals = new Int32Array(this.size * 2)
      vals.set(this.vals)
      this.vals = vals
    }
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= key) break
      this.keys[i] = this.keys[parent]
      this.vals[i] = this.vals[parent]
      i = parent
    }
    this.keys[i] = key
    this.vals[i] = val
  }

  pop(): number {
    const top = this.vals[0]
    const key = this.keys[--this.size]
    const val = this.vals[this.size]
    let i = 0
    for (;;) {
      let child = 2 * i + 1
      if (child >= this.size) break
      if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) child++
      if (this.keys[child] >= key) break
      this.keys[i] = this.keys[child]
      this.vals[i] = this.vals[child]
      i = child
    }
    this.keys[i] = key
    this.vals[i] = val
    return top
  }
}
