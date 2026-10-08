import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Areas, joinRings } from './areas.ts'

/** A closed square ring of lon, lat pairs. */
const square = (lon: number, lat: number, size: number) => [lon, lat, lon + size, lat, lon + size, lat + size, lon, lat + size, lon, lat]

test('finds the area a point lies in, minding holes and picking the smallest of overlapping ones', () => {
  const areas = new Areas()
  // A regency with a city cut out of it, as Kabupaten Bogor holds Kota Bogor.
  const regency = areas.add([square(106.6, -6.7, 0.4), square(106.7, -6.6, 0.1)])
  const city = areas.add([square(106.7, -6.6, 0.1)])
  const estate = areas.add([square(106.65, -6.65, 0.02)])
  assert.equal(areas.at(-6.55, 106.75), city)
  assert.equal(areas.at(-6.4, 106.65), regency)
  assert.equal(areas.at(-6.64, 106.66), estate)
  assert.equal(areas.at(-6.2, 106.8), -1)
  assert.equal(areas.size, 3)
})

test('joins the ways around an area into rings, whatever their order and direction', () => {
  // A square of nodes 1-4 drawn as three ways, one of them backwards.
  assert.deepEqual(joinRings([[1, 2], [4, 3, 2], [4, 1]]), [[4, 1, 2, 3, 4]])
  // Two separate rings: an island.
  assert.equal(joinRings([[1, 2, 3, 1], [5, 6, 7, 5]])?.length, 2)
  // A way missing from the extract leaves the outline open.
  assert.equal(joinRings([[1, 2], [2, 3]]), null)
})
