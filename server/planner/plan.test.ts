import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Itinerary, Plan } from '../../shared/api.ts'
import { STOPS, testTimetable } from '../testing/network.ts'
import { planTrip } from './plan.ts'

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
  })
})
