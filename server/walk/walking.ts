// Walks for the planner on top of the path network: haltes snapped onto the
// paths, the haltes in walking reach of a point, and transfers between haltes.

import { readFileSync } from 'node:fs'
import type { StopWalk } from '../router/raptor.ts'
import type { Timetable } from '../timetable/timetable.ts'
import { DETOUR } from './estimate.ts'
import { decodeWalk, type WalkFile } from './format.ts'
import { WalkNetwork, type Reach, type Snap, type Stretch } from './network.ts'

/** A halte farther than this from every path is left to straight-line estimates. */
export const STOP_SNAP_M = 250
/** A trip end farther than this from every path is walked in a straight line. */
export const POINT_SNAP_M = 400
/** Haltes this close along paths are linked by a transfer walk. */
export const TRANSFER_M = 500

/** Search slots: a trip's start and end stay valid while transfer walks are traced. */
export const SLOT = { from: 0, to: 1, scratch: 2 } as const

export class Walking {
  readonly net: WalkNetwork
  readonly tt: Timetable
  /** Each halte's spot on the paths, or null when none is near. */
  readonly stopSnap: (Snap | null)[]
  /**
   * The path networks holding a halte. Trip ends only snap onto those: the
   * footways around a mall, mapped without the way out to the street, reach no
   * halte at all.
   */
  private readonly withHalte: Set<number>

  constructor(net: WalkNetwork, tt: Timetable) {
    this.net = net
    this.tt = tt
    this.stopSnap = Array.from({ length: tt.stopCount }, (_, s) => net.snap(tt.stopLat[s], tt.stopLon[s], STOP_SNAP_M))
    this.withHalte = new Set(this.stopSnap.flatMap((snap) => (snap ? [net.networkOf(snap.edge)] : [])))
  }

  /** Walks from a point onto the paths, as far as maxMeters reaches; null when no path is near. */
  reach(lat: number, lon: number, maxMeters: number, slot: number): Reach | null {
    const snap = this.net.snap(lat, lon, POINT_SNAP_M, (edge) => this.withHalte.has(this.net.networkOf(edge)))
    // Stairs and private roads cost more than their meters, so the search goes a little further.
    return snap ? this.net.search(snap, maxMeters * 1.6, slot) : null
  }

  /** Haltes within maxMeters' walk along paths, nearest first, as router access or egress walks. */
  stopsWithin(reach: Reach, maxMeters: number): StopWalk[] {
    const { from } = reach
    const out: StopWalk[] = []
    // Nothing farther in a straight line can be closer along paths.
    for (const { stop } of this.tt.stopsNear(from.fromLat, from.fromLon, maxMeters * DETOUR)) {
      const snap = this.stopSnap[stop]
      const walk = snap && reach.costTo(snap)
      if (walk && walk.meters <= maxMeters) out.push({ stop, meters: Math.round(walk.meters), sec: Math.round(walk.sec) })
    }
    return out.sort((a, b) => a.meters - b.meters)
  }

  /** The walk between two haltes along paths, for a transfer; null when either is off the paths. */
  between(fromStop: number, toStop: number): Stretch[] | null {
    const a = this.stopSnap[fromStop]
    const b = this.stopSnap[toStop]
    if (!a || !b) return null
    return this.net.search(a, TRANSFER_M * 2, SLOT.scratch).pathTo(b)
  }

  /** Transfers along paths from the walk file, as (stop, meters, seconds) triples per stop. */
  transfers(file: WalkFile): Int32Array[] {
    return Array.from({ length: this.tt.stopCount }, (_, s) => {
      const flat: number[] = []
      for (let i = file.transferStart[s]; i < file.transferStart[s + 1]; i++) {
        flat.push(file.transferStop[i], file.transferMeters[i], file.transferSeconds[i])
      }
      return Int32Array.from(flat)
    })
  }
}

/**
 * Transfers between haltes along paths, flattened per stop like the walk file
 * stores them. Run once by the data build: a search per halte takes minutes
 * on a laptop, too long for a function's cold start.
 */
export function pathTransfers(walking: Walking): Pick<WalkFile, 'transferStart' | 'transferStop' | 'transferMeters' | 'transferSeconds'> {
  const { tt, net, stopSnap } = walking
  const start = new Int32Array(tt.stopCount + 1)
  const stops: number[] = []
  const meters: number[] = []
  const seconds: number[] = []
  for (let s = 0; s < tt.stopCount; s++) {
    const from = stopSnap[s]
    if (from) {
      const reach = net.search(from, TRANSFER_M * 1.6, SLOT.scratch)
      for (const near of tt.stopsNear(tt.stopLat[s], tt.stopLon[s], TRANSFER_M * DETOUR)) {
        const to = stopSnap[near.stop]
        const walk = near.stop !== s && to && reach.costTo(to)
        if (walk && walk.meters <= TRANSFER_M) {
          stops.push(near.stop)
          meters.push(Math.round(walk.meters))
          seconds.push(Math.round(walk.sec))
        }
      }
    }
    start[s + 1] = stops.length
  }
  return {
    transferStart: start,
    transferStop: Int32Array.from(stops),
    transferMeters: Int32Array.from(meters),
    transferSeconds: Int32Array.from(seconds),
  }
}

let network: { net: WalkNetwork; file: WalkFile } | null | undefined
let loaded: { tt: Timetable; walking: Walking | null } | undefined

/**
 * Walking for the bundled timetable, or null without data/walk.bin (then walks
 * stay straight-line estimates). Loading also swaps the timetable's
 * straight-line transfers for the walks along paths, when the file was built
 * for this timetable.
 */
export function loadWalking(tt: Timetable): Walking | null {
  if (loaded?.tt === tt) return loaded.walking
  if (network === undefined) {
    try {
      const file = decodeWalk(readFileSync(new URL('../../data/walk.bin', import.meta.url)))
      network = { net: new WalkNetwork(file), file }
    } catch (err) {
      // Missing or broken, the paths are left out once, not on every request: walks stay straight-line estimates.
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      console.warn(`data/walk.bin ${missing ? 'tidak ada' : `tidak terbaca (${(err as Error).message})`}: jalan kaki memakai estimasi garis lurus. Jalankan pnpm data:build.`)
      network = null
    }
  }
  const walking = network ? new Walking(network.net, tt) : null
  if (walking) {
    if (sameStops(network!.file.stopIds, tt.stopId)) tt.transfers = walking.transfers(network!.file)
    else console.warn('data/walk.bin dibuat untuk jadwal lain: transfer antarhalte memakai estimasi garis lurus. Jalankan pnpm data:build.')
  }
  loaded = { tt, walking }
  return walking
}

const sameStops = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])
