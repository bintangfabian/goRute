import assert from 'node:assert/strict'
import { test } from 'node:test'
import { simplify, walkable } from './walk.ts'

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
})

test('names what each way is for directions', () => {
  const kind = (t: Record<string, string>) => walkable(tags(t))?.kind
  assert.equal(kind({ highway: 'footway', footway: 'crossing' }), 'crossing')
  assert.equal(kind({ highway: 'footway', bridge: 'yes' }), 'footbridge')
  assert.equal(kind({ highway: 'footway', tunnel: 'yes' }), 'underpass')
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
