// Sanity checks against the committed TransJakarta timetable, so a broken
// data build fails the tests rather than the app.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Itinerary } from '../../shared/api.ts'
import { loadTimetable } from '../timetable/timetable.ts'
import { planTrip } from './plan.ts'
import { dominates } from './rank.ts'

const routes = (it: Itinerary) => it.legs.flatMap((l) => (l.route ? [l.route.shortName] : []))

function plan(from: [number, number], to: [number, number], time: string) {
  return planTrip(loadTimetable(), {
    from: { name: 'Asal', lat: from[0], lon: from[1] },
    to: { name: 'Tujuan', lat: to[0], lon: to[1] },
    departure: new Date(time),
  })
}

test('Blok M → Bundaran HI rides corridor 1', () => {
  const p = plan([-6.2433, 106.8011], [-6.1951, 106.8215], '2026-10-06T08:00:00+07:00')
  const fastest = p.itineraries.find((it) => it.id === p.ranking.tercepat[0])!
  assert.deepEqual(routes(fastest), ['1'])
  assert.equal(fastest.fare.totalIdr, 3500)
  assert.ok(fastest.durationSec < 60 * 60, `took ${fastest.durationSec / 60} min`)
})

test('Kampung Rambutan → Grogol transfers once on one fare', () => {
  const p = plan([-6.3093, 106.8822], [-6.1665, 106.7905], '2026-10-06T08:00:00+07:00')
  const cheapest = p.itineraries.find((it) => it.id === p.ranking.termurah[0])!
  assert.equal(cheapest.transfers, 1)
  assert.equal(cheapest.fare.totalIdr, 3500)
  assert.ok(routes(cheapest)[0].startsWith('7'), routes(cheapest).join(' > '))
})

test('never offers an option another one beats on every count', () => {
  const trips: [[number, number], [number, number]][] = [
    [[-6.2436, 106.8003], [-6.1352, 106.8133]], // Blok M → Kota Tua
    [[-6.309, 106.8826], [-6.1675, 106.79]], // Kampung Rambutan → Grogol
    [[-6.369, 106.893], [-6.195, 106.8231]], // Cibubur → Bundaran HI
  ]
  for (const [from, to] of trips) {
    const its = plan(from, to, '2026-10-06T08:00:00+07:00').itineraries
    for (const a of its) {
      for (const b of its) assert.ok(!dominates(a, b), `${routes(a).join(' > ')} beats ${routes(b).join(' > ')}`)
    }
  }
})

test('offers the regular fare next to Royaltrans', () => {
  const cibubur: [number, number] = [-6.369, 106.893]
  const bundaranHI: [number, number] = [-6.195, 106.8231]
  const cheapest = (time: string) => {
    const p = plan(cibubur, bundaranHI, time)
    return p.itineraries.find((it) => it.id === p.ranking.termurah[0])!
  }
  assert.equal(cheapest('2026-10-06T07:00:00+07:00').fare.totalIdr, 3500)
  // Over an hour slower than the Rp20.000 Royaltrans, but Rp18.000 cheaper.
  assert.equal(cheapest('2026-10-06T05:30:00+07:00').fare.totalIdr, 2000)
})

test('walks a short trip instead of offering a slower, pricier bus', () => {
  // Bundaran HI → Grand Indonesia, about 500 m.
  const p = plan([-6.195, 106.8231], [-6.1951, 106.8196], '2026-10-06T10:00:00+07:00')
  assert.deepEqual(p.itineraries.map(routes), [[]])
})
