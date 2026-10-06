// Sanity checks against the committed TransJakarta timetable, so a broken
// data build fails the tests rather than the app.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Itinerary } from '../../shared/api.ts'
import { loadTimetable } from '../timetable/timetable.ts'
import { planTrip } from './plan.ts'

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
