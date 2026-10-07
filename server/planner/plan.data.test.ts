// Sanity checks against the committed TransJakarta timetable, so a broken
// data build fails the tests rather than the app.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Itinerary } from '../../shared/api.ts'
import { distanceM } from '../geo.ts'
import { loadTimetable } from '../timetable/timetable.ts'
import { loadWalking } from '../walk/walking.ts'
import { planTrip } from './plan.ts'
import { dominates, outshines } from './rank.ts'

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

test('never offers an option another one beats or nearly copies', () => {
  const trips: [[number, number], [number, number], string][] = [
    [[-6.2436, 106.8003], [-6.1352, 106.8133], '08:00'], // Blok M → Kota Tua
    [[-6.309, 106.8826], [-6.1675, 106.79], '08:00'], // Kampung Rambutan → Grogol
    [[-6.369, 106.893], [-6.195, 106.8231], '08:00'], // Cibubur → Bundaran HI
    // Evening: every option rides P11 first and they used to differ by minutes.
    [[-6.369, 106.893], [-6.195, 106.8231], '17:00'],
    [[-6.3628, 106.8938], [-6.1937, 106.823], '17:00'],
  ]
  for (const [from, to, time] of trips) {
    const its = plan(from, to, `2026-10-06T${time}:00+07:00`).itineraries
    for (const a of its) {
      for (const b of its) {
        const pair = `${routes(a).join(' > ')} vs ${routes(b).join(' > ')} at ${time}`
        assert.ok(!dominates(a, b), `beats: ${pair}`)
        assert.ok(!outshines(a, b), `near copy: ${pair}`)
      }
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

test('Royaltrans areas on a weekend: walk to a running bus, or say when one runs', () => {
  const bundaranHI: [number, number] = [-6.195, 106.8231]
  // Bintaro Xchange has only S31 within 2.5 km, and it runs Monday to Friday.
  const saturday = plan([-6.2853, 106.7291], bundaranHI, '2026-10-10T07:00:00+07:00')
  assert.deepEqual(saturday.itineraries, [])
  assert.equal(saturday.reason, 'no-service-near-origin')
  assert.equal(saturday.nextServiceDate, '2026-10-12')
  const monday = plan([-6.2853, 106.7291], bundaranHI, '2026-10-12T07:00:00+07:00')
  assert.ok(monday.itineraries.some((it) => routes(it)[0] === 'S31'))
  // Mega Cinere's D31 and D32 are weekday-only too, but Mikrotrans runs past
  // 1.2 km away: worth the walk on a Saturday.
  const cinere = plan([-6.3297, 106.7838], [-6.1754, 106.8272], '2026-10-10T07:00:00+07:00')
  assert.ok(cinere.itineraries.length > 0)
  for (const it of cinere.itineraries) assert.ok(routes(it).every((r) => !r.startsWith('D3')), routes(it).join(' > '))
})

test('walks along the streets to the halte, with directions', () => {
  const tt = loadTimetable()
  const walking = loadWalking(tt)
  assert.ok(walking, 'data/walk.bin is missing')
  // A home in Tambun, Bekasi, east of the B21 haltes at Bulak Kapal.
  const home = { name: 'Rumah', lat: -6.24871, lon: 107.03645 }
  const p = planTrip(tt, { from: home, to: { name: 'Gambir', lat: -6.1766, lon: 106.8305 }, departure: new Date('2026-10-08T07:00:00+07:00') }, walking)
  const walk = p.itineraries[0].legs[0]
  assert.equal(walk.mode, 'WALK')
  const stop = walk.to
  // Along streets: many points, and longer than a straight line.
  assert.ok(walk.geometry.length > 20, `${walk.geometry.length} points`)
  assert.ok(walk.distanceM > distanceM(home.lat, home.lon, stop.lat, stop.lon) * 1.1, `${walk.distanceM} m`)
  const steps = walk.steps!
  assert.ok(steps.length >= 3 && steps[0].maneuver === 'depart', JSON.stringify(steps))
  assert.ok(steps.some((s) => s.name.startsWith('Jalan')), JSON.stringify(steps))
  const stepped = steps.reduce((m, s) => m + s.distanceM, 0)
  assert.ok(Math.abs(stepped - walk.distanceM) < walk.distanceM * 0.05, `${stepped} vs ${walk.distanceM}`)
})

test('transfers between haltes walk along paths', () => {
  const tt = loadTimetable()
  loadWalking(tt)
  const from = tt.stopName.indexOf('BNN 2')
  const to = tt.stopName.indexOf('Cawang')
  const flat = tt.transfers[from]
  let meters = -1
  for (let i = 0; i < flat.length; i += 3) if (flat[i] === to) meters = flat[i + 1]
  // Over the footbridge: farther than the straight line between the two.
  assert.ok(meters > distanceM(tt.stopLat[from], tt.stopLon[from], tt.stopLat[to], tt.stopLon[to]), `${meters} m`)
})
