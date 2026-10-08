import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { WAY_KINDS } from '../../server/walk/format.ts'
import { writePbf } from './testing.ts'
import { buildWalkFile, simplify, walkable } from './walk.ts'

const tags = (o: Record<string, string>) => new Map(Object.entries(o))

test('keeps pedestrians off toll roads, bus lanes and flyovers', () => {
  const banned: Record<string, string>[] = [
    { highway: 'motorway' },
    { highway: 'motorway_link' },
    { highway: 'busway' },
    { highway: 'service', access: 'no', bus: 'designated' },
    { highway: 'primary', foot: 'no' },
    { highway: 'trunk', motorroad: 'yes' },
    { highway: 'primary', bridge: 'yes', name: 'Flyover Pramuka Salemba' },
    { highway: 'trunk', bridge: 'yes', name: 'Jalan Layang Non Tol Antasari' },
    { highway: 'tertiary', bridge: 'yes', layer: '2', name: 'Jalan Layang Cakung' },
    // The ramp down into a car underpass, without its tunnel tag.
    { highway: 'trunk', name: 'Terowongan Bulak Kapal' },
    // Above other roads, a flyover whatever its name; "no sidewalk" is no sidewalk.
    { highway: 'secondary_link', bridge: 'yes', layer: '2' },
    { highway: 'primary', bridge: 'yes', name: 'Flyover Pramuka', sidewalk: 'no' },
    { highway: 'construction' },
  ]
  for (const t of banned) assert.equal(walkable(tags(t)), null, JSON.stringify(t))
  // A river bridge on a main road is fine, and so is a flyover with a sidewalk.
  assert.deepEqual(walkable(tags({ highway: 'primary', bridge: 'yes', name: 'Jembatan Kali Ciliwung' })), { kind: 'road', penalty: 10 })
  assert.ok(walkable(tags({ highway: 'primary', bridge: 'yes', name: 'Flyover Kuningan', sidewalk: 'both' })))
})

test('lets people use private roads to get home, not as shortcuts', () => {
  assert.deepEqual(walkable(tags({ highway: 'residential', access: 'private' })), { kind: 'road', penalty: 16 })
  assert.deepEqual(walkable(tags({ highway: 'residential', access: 'private', foot: 'yes' })), { kind: 'road', penalty: 10 })
  assert.deepEqual(walkable(tags({ highway: 'service', access: 'destination' })), { kind: 'alley', penalty: 10 })
  assert.deepEqual(walkable(tags({ highway: 'footway', foot: 'private' })), { kind: 'footway', penalty: 16 })
})

test('names what each way is for directions', () => {
  const kind = (t: Record<string, string>) => walkable(tags(t))?.kind
  assert.equal(kind({ highway: 'footway', footway: 'crossing' }), 'crossing')
  // A bridge for walkers is a JPO only once the build sees it cross a main road.
  assert.equal(kind({ highway: 'footway', bridge: 'yes' }), 'bridge')
  assert.equal(kind({ highway: 'footway', footway: 'sidewalk', bridge: 'yes' }), 'footway')
  assert.equal(kind({ highway: 'footway', tunnel: 'yes' }), 'underpass')
  assert.equal(kind({ highway: 'footway', tunnel: 'building_passage' }), 'footway')
  assert.equal(kind({ highway: 'steps' }), 'steps')
  assert.equal(kind({ highway: 'footway', footway: 'sidewalk' }), 'footway')
  assert.equal(kind({ highway: 'path' }), 'path')
  assert.equal(kind({ highway: 'living_street' }), 'alley')
  assert.equal(kind({ highway: 'platform' }), 'platform')
  assert.equal(kind({ highway: 'tertiary' }), 'road')
})

test('drops shape points that add nothing, never the ones streets meet at', () => {
  // East with sub-meter wobbles at 1 and 3, a junction at 2, then a corner at 4 turning south.
  const lats = Float64Array.from([-6.2, -6.200001, -6.2, -6.2000005, -6.2, -6.2003])
  const lons = Float64Array.from([106.8, 106.8005, 106.801, 106.8015, 106.802, 106.802])
  const nodes = [0, 1, 2, 3, 4, 5]
  assert.deepEqual(simplify(nodes, (n) => n === 2, lats, lons), [0, 2, 4, 5])
  assert.deepEqual(simplify(nodes, () => false, lats, lons), [0, 4, 5])
})

test('tells a JPO over a main road from a bridge over a ditch, and walks across squares', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gorute-walk-'))
  try {
    const n = (id: number, lat: number, lon: number) => ({ id, lat, lon })
    writeFileSync(
      join(dir, 'walk.osm.pbf'),
      writePbf({
        nodes: [
          // A primary road running east, with a footbridge over it (north to south), a ramp
          // onto the footbridge, and a sidewalk joining both ends.
          n(1, -6.2, 106.8),
          n(2, -6.2, 106.802),
          n(3, -6.1996, 106.801),
          n(4, -6.2004, 106.801),
          n(5, -6.1993, 106.801),
          n(6, -6.1993, 106.8),
          n(7, -6.2007, 106.801),
          n(8, -6.2007, 106.8),
          // A little bridge over a ditch west of there, on the sidewalk.
          n(9, -6.1993, 106.799),
          n(10, -6.1993, 106.7985),
          // A square with paths into it on two sides.
          n(20, -6.21, 106.8),
          n(21, -6.21, 106.801),
          n(22, -6.211, 106.801),
          n(23, -6.211, 106.8),
          n(24, -6.209, 106.8),
          n(25, -6.212, 106.801),
          // A long winding lane, so the network is no island the build drops.
          ...Array.from({ length: 50 }, (_, i) => n(100 + i, -6.2007 - 0.0002 * (i % 2), 106.7995 - 0.0003 * i)),
        ],
        ways: [
          { id: 100, refs: [1, 2], tags: { highway: 'primary', name: 'Jalan Raya' } },
          { id: 101, refs: [3, 4], tags: { highway: 'footway', bridge: 'yes', layer: '1' } },
          { id: 102, refs: [5, 3], tags: { highway: 'footway', bridge: 'yes', layer: '1' } },
          { id: 103, refs: [6, 5], tags: { highway: 'footway' } },
          { id: 104, refs: [4, 7, 8], tags: { highway: 'footway' } },
          { id: 105, refs: [6, 9], tags: { highway: 'footway' } },
          { id: 106, refs: [9, 10], tags: { highway: 'footway', bridge: 'yes' } },
          { id: 107, refs: [6, 1, 8], tags: { highway: 'footway' } },
          { id: 110, refs: [20, 21, 22, 23, 20], tags: { highway: 'pedestrian', area: 'yes', name: 'Taman Uji' } },
          { id: 111, refs: [24, 20], tags: { highway: 'footway' } },
          { id: 112, refs: [22, 25], tags: { highway: 'footway' } },
          { id: 113, refs: [24, 6], tags: { highway: 'footway' } },
          { id: 114, refs: [8, ...Array.from({ length: 50 }, (_, i) => 100 + i)], tags: { highway: 'residential', name: 'Gang Panjang' } },
        ],
      }),
    )
    const file = buildWalkFile(join(dir, 'walk.osm.pbf'), { id: ['A'], lat: [-6.2], lon: [106.8] }, new Date('2026-10-08'))
    const kinds = Array.from({ length: file.chainKind.length }, (_, c) => WAY_KINDS[file.chainKind[c]])
    // The span over the road and its ramp are the JPO; the ditch bridge stays a bridge.
    assert.equal(kinds.filter((k) => k === 'footbridge').length, 2)
    assert.equal(kinds.filter((k) => k === 'bridge').length, 1)
    // Spokes from the middle of the square to points all around it, every ~20 m.
    const middle = file.lat.findIndex((lat, i) => Math.abs(lat / 1e5 - -6.2105) < 1e-5 && Math.abs(file.lon[i] / 1e5 - 106.8005) < 1e-5)
    assert.ok(middle >= 0, 'square has a middle')
    const spokes = Array.from({ length: file.chainKind.length }, (_, c) => [...file.chainNodes.slice(file.chainStart[c], file.chainStart[c + 1])]).filter(
      (nodes) => nodes.includes(middle),
    )
    assert.ok(spokes.length >= 16 && spokes.length <= 48, `${spokes.length} spokes`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
