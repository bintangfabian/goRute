import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LonLat } from '../../server/geo.ts'
import { testTimetable } from '../../server/testing/network.ts'
import { parseTime, snapToShape } from './build.ts'

test('expands frequencies into trips and groups them into patterns', () => {
  const tt = testTimetable()
  const local = tt.patterns.find((p) => tt.routes[p.route].shortName === '1')!
  assert.deepEqual([...local.dep], [0, 300, 600, 900])
  assert.equal(local.starts.length, 102) // every 10 min from 05:00 until 22:00
  assert.equal(local.starts[0], 5 * 3600)
  assert.equal(local.starts.at(-1), 21 * 3600 + 50 * 60)
  assert.equal(tt.fares[tt.routes[local.route].fare].price, 3500)
})

test('reads service calendars', () => {
  const tt = testTimetable()
  const names = (flags: Uint8Array) => tt.services.filter((_, i) => flags[i]).map((s) => s.id)
  assert.deepEqual(names(tt.activeServices(20261006, 1)), ['TJ:ALL', 'TJ:WD']) // Tuesday
  assert.deepEqual(names(tt.activeServices(20261010, 5)), ['TJ:ALL']) // Saturday
  assert.deepEqual(names(tt.activeServices(20280101, 5)), []) // after end_date
})

test('snaps stops to a looping shape in travel order', () => {
  // Out along y=0 and back along y=0.0001 (~11 m apart).
  const shape: LonLat[] = [
    [0, 0],
    [0.01, 0],
    [0.02, 0],
    [0.02, 0.0001],
    [0.01, 0.0001],
    [0, 0.0001],
  ]
  const stops: LonLat[] = [
    [0, 0],
    [0.01, 0.00005],
    [0.02, 0.00005],
    [0.01, 0.00005],
    [0, 0.0001],
  ]
  assert.deepEqual(snapToShape(shape, stops), [0, 1, 2, 4, 5])
})

test('parses GTFS times past midnight', () => {
  assert.equal(parseTime('25:10:05'), 25 * 3600 + 10 * 60 + 5)
  assert.equal(parseTime('7:05:00'), 7 * 3600 + 5 * 60)
  assert.equal(parseTime(''), null)
})
