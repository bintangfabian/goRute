// data/walk.bin: the OpenStreetMap paths around the haltes that people walk,
// built by scripts/build-osm.ts and read by server/walk/network.ts. Varints,
// gzipped: about a million nodes fit in a few megabytes.

import { gunzipSync, gzipSync } from 'node:zlib'
import type { WalkWay } from '../../shared/api.ts'

export const WALK_VERSION = 1

/** Node coordinates are stored in units of 1e-5 degrees, about 1 m. */
export const COORD_SCALE = 1e5

/** Way kinds by the index stored per chain. Append only: the index is in the file. */
export const WAY_KINDS: readonly WalkWay[] = [
  'road',
  'footway',
  'crossing',
  'footbridge',
  'underpass',
  'steps',
  'path',
  'alley',
  'pedestrian',
  'platform',
]
export type WayKind = WalkWay

export type WalkFile = {
  builtAt: string
  /** Coordinates in COORD_SCALE units. */
  lat: Int32Array
  lon: Int32Array
  /** Each chain is a run of nodes along one OSM way; consecutive nodes are linked. */
  chainStart: Int32Array
  chainNodes: Int32Array
  /** Index into names, -1 for an unnamed way. */
  chainName: Int32Array
  /** Index into WAY_KINDS. */
  chainKind: Uint8Array
  /** Cost multiplier for choosing a way, in tenths: 10 for none, 16 for a private road. */
  chainPenalty: Uint8Array
  names: string[]
  /** Timetable stop IDs, in timetable order, that the transfers belong to. */
  stopIds: string[]
  /** Per stop, the stops reachable on foot within the transfer limit, with meters along paths. */
  transferStart: Int32Array
  transferStop: Int32Array
  transferMeters: Int32Array
}

class Writer {
  private buf = new Uint8Array(1 << 20)
  private pos = 0

  private room(n: number) {
    if (this.pos + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.pos + n) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.pos))
    this.buf = next
  }

  varint(v: number) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`walk format: bad varint ${v}`)
    this.room(10)
    while (v >= 0x80) {
      this.buf[this.pos++] = (v % 0x80) | 0x80
      v = Math.floor(v / 0x80)
    }
    this.buf[this.pos++] = v
  }

  /** Zigzag, for values that may be negative. */
  svarint(v: number) {
    this.varint(v < 0 ? -2 * v - 1 : 2 * v)
  }

  string(s: string) {
    const bytes = new TextEncoder().encode(s)
    this.varint(bytes.length)
    this.room(bytes.length)
    this.buf.set(bytes, this.pos)
    this.pos += bytes.length
  }

  done(): Uint8Array {
    return this.buf.subarray(0, this.pos)
  }
}

class Reader {
  private pos = 0
  private readonly buf: Uint8Array
  private readonly text = new TextDecoder()

  constructor(buf: Uint8Array) {
    this.buf = buf
  }

  varint(): number {
    let b = this.buf[this.pos++]
    if (b < 0x80) return b
    let v = b & 0x7f
    let scale = 0x80
    do {
      b = this.buf[this.pos++]
      v += (b & 0x7f) * scale
      scale *= 0x80
    } while (b >= 0x80)
    return v
  }

  svarint(): number {
    const v = this.varint()
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2
  }

  string(): string {
    const n = this.varint()
    const s = this.text.decode(this.buf.subarray(this.pos, this.pos + n))
    this.pos += n
    return s
  }
}

export function encodeWalk(f: WalkFile): Uint8Array {
  const w = new Writer()
  w.varint(WALK_VERSION)
  w.string(f.builtAt)

  w.varint(f.names.length)
  for (const n of f.names) w.string(n)

  // Nodes are numbered along the chains, so neighbours sit close and deltas stay small.
  w.varint(f.lat.length)
  for (let i = 0, lat = 0, lon = 0; i < f.lat.length; i++) {
    w.svarint(f.lat[i] - lat)
    w.svarint(f.lon[i] - lon)
    lat = f.lat[i]
    lon = f.lon[i]
  }

  const chains = f.chainName.length
  w.varint(chains)
  for (let c = 0, prev = 0; c < chains; c++) {
    w.varint(f.chainStart[c + 1] - f.chainStart[c])
    w.varint(f.chainName[c] + 1)
    w.varint(f.chainKind[c])
    w.varint(f.chainPenalty[c])
    for (let i = f.chainStart[c]; i < f.chainStart[c + 1]; i++) {
      w.svarint(f.chainNodes[i] - prev)
      prev = f.chainNodes[i]
    }
  }

  w.varint(f.stopIds.length)
  for (const id of f.stopIds) w.string(id)
  for (let s = 0; s < f.stopIds.length; s++) {
    w.varint(f.transferStart[s + 1] - f.transferStart[s])
    for (let i = f.transferStart[s]; i < f.transferStart[s + 1]; i++) {
      w.svarint(f.transferStop[i] - s)
      w.varint(f.transferMeters[i])
    }
  }
  return gzipSync(w.done(), { level: 9 })
}

export function decodeWalk(file: Uint8Array): WalkFile {
  const r = new Reader(gunzipSync(file))
  const version = r.varint()
  if (version !== WALK_VERSION) throw new Error(`walk.bin version ${version}, expected ${WALK_VERSION}; run pnpm data:build`)
  const builtAt = r.string()

  const names = Array.from({ length: r.varint() }, () => r.string())

  const nodes = r.varint()
  const lat = new Int32Array(nodes)
  const lon = new Int32Array(nodes)
  for (let i = 0, la = 0, lo = 0; i < nodes; i++) {
    lat[i] = la += r.svarint()
    lon[i] = lo += r.svarint()
  }

  const chains = r.varint()
  const chainStart = new Int32Array(chains + 1)
  const chainName = new Int32Array(chains)
  const chainKind = new Uint8Array(chains)
  const chainPenalty = new Uint8Array(chains)
  const chainNodes: number[] = []
  for (let c = 0, prev = 0; c < chains; c++) {
    const n = r.varint()
    chainName[c] = r.varint() - 1
    chainKind[c] = r.varint()
    chainPenalty[c] = r.varint()
    for (let i = 0; i < n; i++) chainNodes.push((prev += r.svarint()))
    chainStart[c + 1] = chainNodes.length
  }

  const stopIds = Array.from({ length: r.varint() }, () => r.string())
  const transferStart = new Int32Array(stopIds.length + 1)
  const transferStop: number[] = []
  const transferMeters: number[] = []
  for (let s = 0; s < stopIds.length; s++) {
    const n = r.varint()
    for (let i = 0; i < n; i++) {
      transferStop.push(s + r.svarint())
      transferMeters.push(r.varint())
    }
    transferStart[s + 1] = transferStop.length
  }

  return {
    builtAt,
    lat,
    lon,
    chainStart,
    chainNodes: Int32Array.from(chainNodes),
    chainName,
    chainKind,
    chainPenalty,
    names,
    stopIds,
    transferStart,
    transferStop: Int32Array.from(transferStop),
    transferMeters: Int32Array.from(transferMeters),
  }
}
