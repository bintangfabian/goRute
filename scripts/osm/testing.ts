// Writes small OSM PBF files for tests: protobuf fields as the format describes them.

import { deflateSync } from 'node:zlib'

export type TestNode = { id: number; lat: number; lon: number; tags?: Record<string, string> }
export type TestWay = { id: number; refs: number[]; tags?: Record<string, string> }
export type TestRelation = { id: number; members: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[]; tags?: Record<string, string> }

const varint = (n: number): number[] => {
  const out: number[] = []
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80)
    n = Math.floor(n / 0x80)
  }
  out.push(n)
  return out
}
const zigzag = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n)
const key = (field: number, wire: number) => varint(field * 8 + wire)
const bytes = (field: number, data: ArrayLike<number>) => [...key(field, 2), ...varint(data.length), ...Array.from(data)]
const text = (field: number, s: string) => bytes(field, new TextEncoder().encode(s))
const packed = (field: number, values: number[], zz = false) => bytes(field, values.flatMap((v) => varint(zz ? zigzag(v) : v)))
const deltas = (values: number[]) => values.map((v, i) => v - (values[i - 1] ?? 0))

function blob(type: string, payload: number[], compress: boolean): number[] {
  const body = compress ? [...key(2, 0), ...varint(payload.length), ...bytes(3, deflateSync(Uint8Array.from(payload)))] : bytes(1, payload)
  const header = [...text(1, type), ...key(3, 0), ...varint(body.length)]
  return [(header.length >>> 24) & 0xff, (header.length >>> 16) & 0xff, (header.length >>> 8) & 0xff, header.length & 0xff, ...header, ...body]
}

/**
 * A PBF file with one data block. Coordinates use granularity 100 with offsets,
 * as osmium writes them, so the reader's arithmetic is exercised.
 */
export function writePbf(data: { nodes?: TestNode[]; ways?: TestWay[]; relations?: TestRelation[] }, compress = true): Uint8Array {
  const strings = ['']
  const s = (v: string) => {
    let i = strings.indexOf(v)
    if (i < 0) i = strings.push(v) - 1
    return i
  }
  const tagPairs = (tags: Record<string, string> = {}) => Object.entries(tags).map(([k, v]) => [s(k), s(v)])
  const nodes = (data.nodes ?? []).toSorted((a, b) => a.id - b.id)
  const LAT_OFFSET = 1000
  const LON_OFFSET = 2000
  const groups: number[][] = []
  if (nodes.length) {
    groups.push(
      bytes(2, [
        ...packed(1, deltas(nodes.map((n) => n.id)), true),
        ...packed(8, deltas(nodes.map((n) => Math.round((n.lat * 1e9 - LAT_OFFSET) / 100))), true),
        ...packed(9, deltas(nodes.map((n) => Math.round((n.lon * 1e9 - LON_OFFSET) / 100))), true),
        ...packed(
          10,
          nodes.flatMap((n) => [...tagPairs(n.tags).flat(), 0]),
        ),
      ]),
    )
  }
  for (const w of data.ways ?? []) {
    const t = tagPairs(w.tags)
    groups.push(
      bytes(3, [
        ...key(1, 0),
        ...varint(w.id),
        ...packed(2, t.map(([k]) => k)),
        ...packed(3, t.map(([, v]) => v)),
        ...packed(8, deltas(w.refs), true),
      ]),
    )
  }
  for (const r of data.relations ?? []) {
    const t = tagPairs(r.tags)
    groups.push(
      bytes(4, [
        ...key(1, 0),
        ...varint(r.id),
        ...packed(2, t.map(([k]) => k)),
        ...packed(3, t.map(([, v]) => v)),
        ...packed(
          8,
          r.members.map((m) => s(m.role)),
        ),
        ...packed(
          9,
          deltas(r.members.map((m) => m.ref)),
          true,
        ),
        ...packed(
          10,
          r.members.map((m) => ['node', 'way', 'relation'].indexOf(m.type)),
        ),
      ]),
    )
  }
  const block = [
    ...bytes(1, strings.flatMap((v) => text(1, v))),
    ...groups.flatMap((g) => bytes(2, g)),
    ...key(17, 0),
    ...varint(100),
    ...key(19, 0),
    ...varint(LAT_OFFSET),
    ...key(20, 0),
    ...varint(LON_OFFSET),
  ]
  return Uint8Array.from([...blob('OSMHeader', text(4, 'OsmSchema-V0.6'), compress), ...blob('OSMData', block, compress)])
}
