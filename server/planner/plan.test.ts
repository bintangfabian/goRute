import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Itinerary, Plan } from '../../shared/api.ts'
import { STOPS, testTimetable } from '../testing/network.ts'
import { testWalkFile } from '../testing/walk.ts'
import { WalkNetwork } from '../walk/network.ts'
import { Walking } from '../walk/walking.ts'
import { planTrip, premiumRoutes } from './plan.ts'

const tt = testTimetable()

function plan(from: keyof typeof STOPS, to: keyof typeof STOPS, time: string): Plan {
  return planTrip(tt, {
    from: { name: 'Asal', ...STOPS[from] },
    to: { name: 'Tujuan', ...STOPS[to] },
    departure: new Date(time),
  })
}

const routes = (it: Itinerary) => it.legs.flatMap((l) => (l.route ? [l.route.shortName] : []))
const byId = (p: Plan, id: string | undefined) => p.itineraries.find((it) => it.id === id)!
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })

describe('planTrip', () => {
  test('offers the fast express and the cheap local route', () => {
    const p = plan('A', 'F', '2026-10-06T08:00:00+07:00') // Tuesday

    // Banning X alone only turns up Y, the other express: the local trip
    // shows up only when every premium route is banned at once.
    assert.deepEqual(p.itineraries.map(routes).sort(), [
      ['1', '2'],
      ['X', '2'],
    ])

    const fastest = byId(p, p.ranking.tercepat[0])
    assert.deepEqual(routes(fastest), ['X', '2'])
    assert.equal(clock(fastest.start), '08:00')
    assert.equal(clock(fastest.end), '08:14')
    assert.equal(fastest.transfers, 1)
    assert.equal(fastest.fare.totalIdr, 23_500)

    const cheapest = byId(p, p.ranking.termurah[0])
    assert.deepEqual(routes(cheapest), ['1', '2'])
    assert.equal(clock(cheapest.end), '08:24')
    assert.deepEqual(
      cheapest.legs.map((l) => l.fareIdr),
      [3500, null, 0], // ride, transfer walk D→E, ride covered by the first ticket
    )
  })

  test('describes each leg', () => {
    const p = plan('A', 'F', '2026-10-06T08:00:00+07:00')
    const it = byId(p, p.ranking.tercepat[0])
    assert.deepEqual(
      it.legs.map((l) => [l.mode, l.from.name, l.to.name, clock(l.start), clock(l.end)]),
      [
        ['BUS', 'Halte A', 'Halte D', '08:00', '08:08'],
        ['WALK', 'Halte D', 'Halte E', '08:08', '08:08'],
        ['BUS', 'Halte E', 'Halte F', '08:10', '08:14'],
      ],
    )
    const express = it.legs[0]
    assert.equal(express.route?.id, 'TJ:X')
    assert.equal(express.route?.color, '#000000')
    assert.ok(express.distanceM > 3000 && express.distanceM < 3500, `distance ${express.distanceM}`)
    assert.deepEqual(express.geometry[0], [STOPS.A.lon, STOPS.A.lat])
  })

  test('skips services that do not run that day', () => {
    const p = plan('A', 'F', '2026-10-10T08:00:00+07:00') // Saturday: no express
    assert.deepEqual(p.itineraries.map(routes), [['1', '2']])
  })

  test('applies the early-morning fare', () => {
    const p = plan('A', 'D', '2026-10-06T06:00:00+07:00')
    const local = p.itineraries.find((it) => routes(it).join() === '1')!
    assert.equal(local.fare.totalIdr, 2000)
  })

  test('walks when the destination is close', () => {
    const p = plan('D', 'E', '2026-10-06T08:00:00+07:00')
    assert.equal(p.itineraries.length, 1)
    assert.deepEqual(
      p.itineraries[0].legs.map((l) => l.mode),
      ['WALK'],
    )
    assert.equal(p.itineraries[0].fare.totalIdr, 0)
  })

  test('catches the first trip of the next day', () => {
    const p = plan('A', 'D', '2026-10-06T23:00:00+07:00')
    const it = byId(p, p.ranking.tercepat[0])
    assert.equal(clock(it.start), '05:00')
    assert.equal(it.start.slice(0, 10), '2026-10-06') // 05:00 WIB on the 7th is the 6th in UTC
  })

  test('returns nothing when no stop is in reach', () => {
    const p = planTrip(tt, {
      from: { name: 'Bogor', lat: -6.6, lon: 106.8 },
      to: { name: 'Tujuan', ...STOPS.F },
      departure: new Date('2026-10-06T08:00:00+07:00'),
    })
    assert.deepEqual(p.itineraries, [])
    assert.equal(p.reason, 'far-from-origin')
    const back = planTrip(tt, {
      from: { name: 'Asal', ...STOPS.F },
      to: { name: 'Bogor', lat: -6.6, lon: 106.8 },
      departure: new Date('2026-10-06T08:00:00+07:00'),
    })
    assert.equal(back.reason, 'far-from-destination')
    assert.equal(plan('A', 'F', '2026-10-06T08:00:00+07:00').reason, undefined)
  })

  test('walks along streets to and from the haltes, with directions', () => {
    // One street through every halte, and a side street from the south meeting it at B.
    const walking = new Walking(
      new WalkNetwork(
        testWalkFile([
          { name: 'Jalan Lurus', points: [[-6.2, 106.795], [-6.2, 106.81], [-6.2, 106.845]] },
          { name: 'Jalan Samping', kind: 'alley', points: [[-6.204, 106.81], [-6.2, 106.81]] },
        ]),
      ),
      tt,
    )
    const p = planTrip(
      tt,
      { from: { name: 'Rumah', lat: -6.204, lon: 106.81 }, to: { name: 'Tujuan', ...STOPS.F }, departure: new Date('2026-10-06T08:00:00+07:00') },
      walking,
    )
    const it = byId(p, p.ranking.termurah[0])
    assert.deepEqual(routes(it), ['1', '2'])
    const [walkIn, ride] = it.legs
    assert.equal(walkIn.mode, 'WALK')
    assert.equal(walkIn.to.name, 'Halte B')
    // Up the side street to the corner, then along the street: never across the block.
    assert.deepEqual(walkIn.geometry[0], [106.81, -6.204])
    assert.ok(walkIn.geometry.some(([lon, lat]) => lon === 106.81 && lat === -6.2), JSON.stringify(walkIn.geometry))
    assert.deepEqual(
      walkIn.steps?.map((s) => [s.maneuver, s.name]),
      [['depart', 'Jalan Samping']],
    )
    assert.equal(walkIn.steps?.[0].bearing, 0)
    assert.ok(Math.abs(walkIn.distanceM - 445) < 5, `walk ${walkIn.distanceM} m`)

    assert.equal(ride.headsign, 'D')
    assert.deepEqual(
      ride.stops?.map((s) => s.name),
      ['Halte C'],
    )

    // A walk-only trip follows the street too.
    const short = planTrip(
      tt,
      { from: { name: 'Asal', lat: -6.2, lon: 106.8295 }, to: { name: 'Tujuan', lat: -6.2, lon: 106.8305 }, departure: new Date('2026-10-06T08:00:00+07:00') },
      walking,
    )
    const walk = short.itineraries.find((i) => i.legs.length === 1)!
    assert.equal(walk.legs[0].steps?.[0].name, 'Jalan Lurus')
  })

  test('walks further, or says so, when the buses nearby are off that day', () => {
    // Z runs on weekdays from G, a 2.2 km walk west of A (past the usual
    // 1.2 km), to H, which nothing else serves. Q's service has ended.
    const csv = (...lines: string[]) => lines.join('\n') + '\n'
    const files = new Map([
      ['agency.txt', csv('agency_id,agency_name,agency_url,agency_timezone', 'R,Royal,https://example.com,Asia/Jakarta')],
      [
        'stops.txt',
        csv('stop_id,stop_name,stop_lat,stop_lon', 'G,Halte G,-6.2,106.785', 'H,Halte H,-6.3,106.8', 'K,Halte K,-6.4,106.8'),
      ],
      [
        'routes.txt',
        csv('route_id,agency_id,route_short_name,route_long_name,route_desc,route_type', 'Z,R,Z,G - H,Royaltrans,3', 'Q,R,Q,K - K,Royaltrans,3'),
      ],
      [
        'calendar.txt',
        csv(
          'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
          'WD,1,1,1,1,1,0,0,20260101,20271231',
          'GONE,1,1,1,1,1,1,1,20250101,20251231',
        ),
      ],
      ['trips.txt', csv('route_id,service_id,trip_id', 'Z,WD,z1', 'Q,GONE,q1')],
      [
        'stop_times.txt',
        csv(
          'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
          'z1,06:00:00,06:00:00,G,1',
          'z1,06:20:00,06:20:00,H,2',
          'q1,06:00:00,06:00:00,K,1',
          'q1,06:30:00,06:30:00,K,2',
        ),
      ],
      ['fare_attributes.txt', csv('fare_id,price,currency_type,payment_method,transfers,transfer_duration', 'RP,20000,IDR,0,0,')],
      ['fare_rules.txt', csv('fare_id,route_id', 'RP,Z', 'RP,Q')],
    ])
    const royal = testTimetable([{ id: 'RT', name: 'Royal', files }])
    const at = (from: [number, number], to: keyof typeof STOPS, time: string) =>
      planTrip(royal, {
        from: { name: 'Asal', lat: from[0], lon: from[1] },
        to: { name: 'Tujuan', ...STOPS[to] },
        departure: new Date(time),
      })
    const saturday = '2026-10-10T08:00:00+07:00'

    // G's only bus is off on Saturday, so the trip walks on to A for route 1.
    const walked = at([-6.2, 106.785], 'D', saturday)
    assert.deepEqual(walked.itineraries.map(routes), [['1']])
    assert.ok(walked.itineraries[0].legs[0].distanceM > 1200, `walk ${walked.itineraries[0].legs[0].distanceM} m`)

    // Nothing else runs near H: say so, and when buses run at both ends again.
    const fromH = at([-6.3, 106.8], 'D', saturday)
    assert.deepEqual(fromH.itineraries, [])
    assert.equal(fromH.reason, 'no-service-near-origin')
    assert.equal(fromH.nextServiceDate, '2026-10-12')
    assert.equal(at([-6.3, 106.8], 'D', '2026-10-11T08:00:00+07:00').nextServiceDate, '2026-10-12') // from Sunday
    const toH = planTrip(royal, {
      from: { name: 'Asal', ...STOPS.A },
      to: { name: 'Tujuan', lat: -6.3, lon: 106.8 },
      departure: new Date(saturday),
    })
    assert.equal(toH.reason, 'no-service-near-destination')
    assert.equal(toH.nextServiceDate, '2026-10-12')
    // On Monday Z runs, it just never gets to D.
    assert.equal(at([-6.3, 106.8], 'D', '2026-10-12T08:00:00+07:00').reason, 'no-trip')
    // No bus near K in the week ahead, so no date to offer.
    const fromK = at([-6.4, 106.8], 'D', saturday)
    assert.equal(fromK.reason, 'no-service-near-origin')
    assert.equal(fromK.nextServiceDate, undefined)
  })
})

test('counts a route as premium only against fares of its own feed', () => {
  // An MRT feed whose flat fare is below TransJakarta's regular Rp3.500.
  const csv = (...lines: string[]) => lines.join('\n') + '\n'
  const files = new Map([
    ['agency.txt', csv('agency_id,agency_name,agency_url,agency_timezone', 'M,MRT,https://example.com,Asia/Jakarta')],
    ['stops.txt', csv('stop_id,stop_name,stop_lat,stop_lon', 'P,Stasiun P,-6.21,106.8', 'Q,Stasiun Q,-6.22,106.8')],
    ['routes.txt', csv('route_id,agency_id,route_short_name,route_long_name,route_desc,route_type', 'M1,M,M1,P - Q,MRT,1')],
    [
      'calendar.txt',
      csv(
        'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
        'ALL,1,1,1,1,1,1,1,20260101,20271231',
      ),
    ],
    ['trips.txt', csv('route_id,service_id,trip_id', 'M1,ALL,m1')],
    [
      'stop_times.txt',
      csv('trip_id,arrival_time,departure_time,stop_id,stop_sequence', 'm1,05:00:00,05:00:00,P,1', 'm1,05:03:00,05:03:00,Q,2'),
    ],
    ['fare_attributes.txt', csv('fare_id,price,currency_type,payment_method,transfers,transfer_duration', 'MP,3000,IDR,0,0,')],
    ['fare_rules.txt', csv('fare_id,route_id', 'MP,M1')],
  ])
  const both = testTimetable([{ id: 'MRT', name: 'MRT', files }])
  assert.deepEqual([...premiumRoutes(both)].map((r) => both.routes[r].id).sort(), ['TJ:X', 'TJ:Y'])
})
