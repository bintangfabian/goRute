// Reads OpenStreetMap PBF files (https://wiki.openstreetmap.org/wiki/PBF_Format):
// nodes, ways and relations with their tags, one block at a time, with nothing
// but Node's zlib. Metadata (versions, users) is skipped.

import { closeSync, openSync, readSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

export type Tags = Map<string, string>

export type Member = { type: 'node' | 'way' | 'relation'; ref: number; role: string }

export type OsmVisitor = {
  /** Every node; tags is null for the untagged ones, which most are. */
  node?: (id: number, lat: number, lon: number, tags: Tags | null) => void
  way?: (id: number, refs: number[], tags: Tags) => void
  relation?: (id: number, members: Member[], tags: Tags) => void
}

export function readOsm(path: string, visit: OsmVisitor): void {
  const fd = openSync(path, 'r')
  try {
    const size = Buffer.alloc(4)
    while (readSync(fd, size, 0, 4, null) === 4) {
      const header = blobHeader(readExact(fd, size.readUInt32BE(0)))
      const blob = readExact(fd, header.datasize)
      if (header.type === 'OSMData') readBlock(blobData(blob), visit)
    }
  } finally {
    closeSync(fd)
  }
}

/** Decodes the blocks of a PBF file already in memory (used by the tests). */
export function readOsmBuffer(file: Uint8Array, visit: OsmVisitor): void {
  let pos = 0
  while (pos + 4 <= file.length) {
    const length = (file[pos] << 24) | (file[pos + 1] << 16) | (file[pos + 2] << 8) | file[pos + 3]
    const header = blobHeader(file.subarray(pos + 4, pos + 4 + length))
    pos += 4 + length
    const blob = file.subarray(pos, pos + header.datasize)
    pos += header.datasize
    if (header.type === 'OSMData') readBlock(blobData(blob), visit)
  }
}

function readExact(fd: number, length: number): Buffer {
  const buf = Buffer.alloc(length)
  let got = 0
  while (got < length) {
    const n = readSync(fd, buf, got, length - got, null)
    if (n === 0) throw new Error('osm pbf: file ends inside a block')
    got += n
  }
  return buf
}

/** A protobuf reader over part of a buffer. Varints are read as doubles, exact up to 2^53. */
class Pb {
  readonly buf: Uint8Array
  readonly end: number
  pos: number

  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf
    this.pos = start
    this.end = end
  }

  get more() {
    return this.pos < this.end
  }

  varint(): number {
    let b = this.buf[this.pos++]
    if (b < 0x80) return b
    let value = b & 0x7f
    let scale = 0x80
    do {
      b = this.buf[this.pos++]
      value += (b & 0x7f) * scale
      scale *= 0x80
    } while (b >= 0x80)
    return value
  }

  /** A zigzag-encoded sint64. */
  svarint(): number {
    const v = this.varint()
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2
  }

  /** An int64, which protobuf writes as ten bytes when negative. */
  int64(): number {
    const v = this.varint()
    return v >= 2 ** 63 ? v - 2 ** 64 : v
  }

  /** The bounds of a length-delimited field. */
  span(): [number, number] {
    const length = this.varint()
    const start = this.pos
    this.pos += length
    return [start, this.pos]
  }

  message(): Pb {
    const [start, end] = this.span()
    return new Pb(this.buf, start, end)
  }

  bytes(): Uint8Array {
    const [start, end] = this.span()
    return this.buf.subarray(start, end)
  }

  skip(wire: number) {
    if (wire === 0) this.varint()
    else if (wire === 1) this.pos += 8
    else if (wire === 2) this.span()
    else if (wire === 5) this.pos += 4
    else throw new Error(`osm pbf: unknown wire type ${wire}`)
  }

  /** A packed repeated varint field, optionally zigzag-decoded and delta-summed. */
  packed(zigzag: boolean, delta: boolean): number[] {
    const sub = this.message()
    const out: number[] = []
    let sum = 0
    while (sub.more) {
      const v = zigzag ? sub.svarint() : sub.varint()
      out.push(delta ? (sum += v) : v)
    }
    return out
  }
}

const utf8 = new TextDecoder()

function blobHeader(buf: Uint8Array): { type: string; datasize: number } {
  const pb = new Pb(buf)
  let type = ''
  let datasize = 0
  while (pb.more) {
    const key = pb.varint()
    if (key === (1 << 3) + 2) type = utf8.decode(pb.bytes())
    else if (key === (3 << 3) + 0) datasize = pb.varint()
    else pb.skip(key & 7)
  }
  return { type, datasize }
}

function blobData(buf: Uint8Array): Uint8Array {
  const pb = new Pb(buf)
  while (pb.more) {
    const key = pb.varint()
    if (key === (1 << 3) + 2) return pb.bytes()
    if (key === (3 << 3) + 2) return inflateSync(pb.bytes())
    if (key >> 3 >= 4 && key >> 3 <= 8) throw new Error('osm pbf: only raw and zlib blobs are supported')
    pb.skip(key & 7)
  }
  throw new Error('osm pbf: empty blob')
}

type Block = { strings: string[]; granularity: number; latOffset: number; lonOffset: number }

function readBlock(buf: Uint8Array, visit: OsmVisitor) {
  const pb = new Pb(buf)
  const block: Block = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0 }
  const groups: [number, number][] = []
  // Granularity and offsets come after the groups on the wire, so groups are read last.
  while (pb.more) {
    const key = pb.varint()
    const field = key >> 3
    if (field === 1) block.strings = stringTable(pb.message())
    else if (field === 2) groups.push(pb.span())
    else if (field === 17) block.granularity = pb.varint()
    else if (field === 19) block.latOffset = pb.int64()
    else if (field === 20) block.lonOffset = pb.int64()
    else pb.skip(key & 7)
  }
  for (const [start, end] of groups) {
    const group = new Pb(buf, start, end)
    while (group.more) {
      const key = group.varint()
      const field = key >> 3
      if (field === 1 && visit.node) plainNode(group.message(), block, visit.node)
      else if (field === 2 && visit.node) denseNodes(group.message(), block, visit.node)
      else if (field === 3 && visit.way) way(group.message(), block, visit.way)
      else if (field === 4 && visit.relation) relation(group.message(), block, visit.relation)
      else group.skip(key & 7)
    }
  }
}

function stringTable(pb: Pb): string[] {
  const out: string[] = []
  while (pb.more) {
    const key = pb.varint()
    if (key === (1 << 3) + 2) out.push(utf8.decode(pb.bytes()))
    else pb.skip(key & 7)
  }
  return out
}

const degrees = (block: Block, offset: number, value: number) => (offset + block.granularity * value) / 1e9

function tagsOf(keys: number[], vals: number[], strings: string[]): Tags {
  const tags: Tags = new Map()
  for (let i = 0; i < keys.length; i++) tags.set(strings[keys[i]], strings[vals[i]])
  return tags
}

function denseNodes(pb: Pb, block: Block, visit: NonNullable<OsmVisitor['node']>) {
  let ids: number[] = []
  let lats: number[] = []
  let lons: number[] = []
  let keysVals: number[] = []
  while (pb.more) {
    const key = pb.varint()
    const field = key >> 3
    if (field === 1) ids = pb.packed(true, true)
    else if (field === 8) lats = pb.packed(true, true)
    else if (field === 9) lons = pb.packed(true, true)
    else if (field === 10) keysVals = pb.packed(false, false)
    else pb.skip(key & 7)
  }
  let kv = 0
  for (let i = 0; i < ids.length; i++) {
    let tags: Tags | null = null
    // keys_vals lists each node's key/value string indexes, ending with a 0.
    while (kv < keysVals.length && keysVals[kv] !== 0) {
      tags ??= new Map()
      tags.set(block.strings[keysVals[kv]], block.strings[keysVals[kv + 1]])
      kv += 2
    }
    kv++
    visit(ids[i], degrees(block, block.latOffset, lats[i]), degrees(block, block.lonOffset, lons[i]), tags)
  }
}

function plainNode(pb: Pb, block: Block, visit: NonNullable<OsmVisitor['node']>) {
  let id = 0
  let lat = 0
  let lon = 0
  let keys: number[] = []
  let vals: number[] = []
  while (pb.more) {
    const key = pb.varint()
    const field = key >> 3
    if (field === 1) id = pb.svarint()
    else if (field === 2) keys = pb.packed(false, false)
    else if (field === 3) vals = pb.packed(false, false)
    else if (field === 8) lat = pb.svarint()
    else if (field === 9) lon = pb.svarint()
    else pb.skip(key & 7)
  }
  const tags = keys.length > 0 ? tagsOf(keys, vals, block.strings) : null
  visit(id, degrees(block, block.latOffset, lat), degrees(block, block.lonOffset, lon), tags)
}

function way(pb: Pb, block: Block, visit: NonNullable<OsmVisitor['way']>) {
  let id = 0
  let keys: number[] = []
  let vals: number[] = []
  let refs: number[] = []
  while (pb.more) {
    const key = pb.varint()
    const field = key >> 3
    if (field === 1) id = pb.varint()
    else if (field === 2) keys = pb.packed(false, false)
    else if (field === 3) vals = pb.packed(false, false)
    else if (field === 8) refs = pb.packed(true, true)
    else pb.skip(key & 7)
  }
  visit(id, refs, tagsOf(keys, vals, block.strings))
}

const MEMBER_TYPES = ['node', 'way', 'relation'] as const

function relation(pb: Pb, block: Block, visit: NonNullable<OsmVisitor['relation']>) {
  let id = 0
  let keys: number[] = []
  let vals: number[] = []
  let roles: number[] = []
  let refs: number[] = []
  let types: number[] = []
  while (pb.more) {
    const key = pb.varint()
    const field = key >> 3
    if (field === 1) id = pb.varint()
    else if (field === 2) keys = pb.packed(false, false)
    else if (field === 3) vals = pb.packed(false, false)
    else if (field === 8) roles = pb.packed(false, false)
    else if (field === 9) refs = pb.packed(true, true)
    else if (field === 10) types = pb.packed(false, false)
    else pb.skip(key & 7)
  }
  const members = refs.map((ref, i) => ({ type: MEMBER_TYPES[types[i]], ref, role: block.strings[roles[i]] }))
  visit(id, members, tagsOf(keys, vals, block.strings))
}
