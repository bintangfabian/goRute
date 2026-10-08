import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readOsmBuffer, type Member, type Tags } from './pbf.ts'
import { writePbf } from './testing.ts'

// IDs past 2^32 and a negative latitude exercise the 64-bit varints and zigzag deltas.
const ids = [9_876_543_210, 9_876_543_211, 9_876_543_215]
const data = {
  nodes: [
    { id: ids[0], lat: -6.2, lon: 106.8 },
    { id: ids[1], lat: -6.2001, lon: 106.8002, tags: { crossing: 'zebra' } },
    { id: ids[2], lat: -6.2003, lon: 106.8004 },
  ],
  ways: [{ id: 42, refs: ids, tags: { highway: 'footway', name: 'Jalan Uji' } }],
  relations: [{ id: 7, members: [{ type: 'way' as const, ref: 42, role: 'outer' }], tags: { name: 'Taman Uji' } }],
}

test('reads dense nodes, ways and relations with their tags, from zlib and raw blobs', () => {
  for (const compress of [true, false]) {
    const nodes: [number, number, number, Tags | null][] = []
    const ways: [number, number[], Tags][] = []
    const relations: [number, Member[], Tags][] = []
    readOsmBuffer(writePbf(data, compress), {
      node: (id, lat, lon, tags) => nodes.push([id, lat, lon, tags]),
      way: (id, refs, tags) => ways.push([id, refs, tags]),
      relation: (id, members, tags) => relations.push([id, members, tags]),
    })
    assert.deepEqual(
      nodes.map(([id]) => id),
      ids,
    )
    nodes.forEach(([, lat, lon], i) => {
      assert.ok(Math.abs(lat - data.nodes[i].lat) < 1e-7, `lat ${lat}`)
      assert.ok(Math.abs(lon - data.nodes[i].lon) < 1e-7, `lon ${lon}`)
    })
    assert.deepEqual(
      nodes.map(([, , , tags]) => tags && Object.fromEntries(tags)),
      [null, { crossing: 'zebra' }, null],
    )
    assert.deepEqual(ways, [[42, ids, new Map(Object.entries(data.ways[0].tags))]])
    assert.deepEqual(relations, [[7, data.relations[0].members, new Map([['name', 'Taman Uji']])]])
  }
})

test('skips what nobody asked for', () => {
  let ways = 0
  readOsmBuffer(writePbf(data), { way: () => ways++ })
  assert.equal(ways, 1)
})
