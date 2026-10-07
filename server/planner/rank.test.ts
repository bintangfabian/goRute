import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Itinerary } from '../../shared/api.ts'
import { dominates, keepDistinct, outshines, rank } from './rank.ts'

function it(id: string, end: string, totalIdr: number, transfers: number, walkDistanceM: number, complete = true): Itinerary {
  return {
    id,
    start: '2026-10-06T01:00:00.000Z',
    end: `2026-10-06T${end}:00.000Z`,
    durationSec: 0,
    walkDistanceM,
    transfers,
    fare: { totalIdr, complete },
    legs: [],
  }
}

test('ranks by preference', () => {
  const royal = it('royal', '01:30', 20_000, 0, 300)
  const transfer = it('transfer', '01:45', 3500, 1, 900)
  const direct = it('direct', '01:50', 3500, 0, 200)
  const unknown = it('krl', '01:40', 3000, 0, 500, false)

  assert.deepEqual(rank([royal, transfer, direct, unknown]), {
    tercepat: ['royal', 'krl', 'transfer', 'direct'],
    termurah: ['transfer', 'direct', 'royal', 'krl'],
    termudah: ['direct', 'royal', 'krl', 'transfer'],
  })
})

test('an option worse on every count is dominated', () => {
  const direct = { ...it('direct', '01:30', 3500, 0, 400), durationSec: 1800 }
  const detour = { ...it('detour', '01:50', 7000, 1, 900), durationSec: 3000 }
  // Arrives later but leaves later too, riding for less time.
  const later = { ...it('later', '01:35', 3500, 0, 400), durationSec: 1500 }
  const unknown = { ...it('krl', '01:20', 3000, 0, 300, false), durationSec: 1200 }

  assert.equal(dominates(direct, detour), true)
  assert.equal(dominates(detour, direct), false)
  assert.equal(dominates(direct, later), false)
  assert.equal(dominates(direct, direct), false)
  // A fare that is only a lower bound never proves an option cheaper.
  assert.equal(dominates(unknown, detour), false)
})

// Cibubur → Bundaran HI at 17.00: all P11 first, then three ways into Bundaran HI.
const viaNineD = { ...it('P11 > 9D', '12:11', 3500, 1, 18), durationSec: 128 * 60 }
const viaSixA = { ...it('P11 > 9A > 6A', '12:06', 3500, 2, 422), durationSec: 123 * 60 }
const viaSixB = { ...it('P11 > 9 > 6B', '12:09', 3500, 2, 42), durationSec: 126 * 60 }

test('treats trips a few minutes apart as the same trip', () => {
  assert.equal(outshines(viaNineD, viaSixA), true)
  assert.equal(outshines(viaNineD, viaSixB), true)
  assert.equal(outshines(viaSixA, viaNineD), false)
  // 15 m less walking does not keep a slower trip that costs Rp3.500 more.
  const royal = { ...it('1T', '00:57', 20_000, 0, 33), durationSec: 57 * 60 }
  const pricier = { ...it('1K > 9D', '01:11', 23_500, 1, 18), durationSec: 71 * 60 }
  assert.equal(dominates(royal, pricier), false)
  assert.equal(outshines(royal, pricier), true)
  // A cheaper trip is never a copy of a pricier one.
  assert.equal(outshines(royal, { ...viaSixA, end: '2026-10-06T00:58:00.000Z' }), false)
  // Ten minutes sooner is more than the margin.
  const sooner = { ...it('sooner', '12:01', 3500, 2, 422), durationSec: 118 * 60 }
  assert.equal(outshines(viaNineD, sooner), false)
  // The margin shrinks with the trip: 3 minutes of 20 matter.
  const direct = { ...it('direct', '01:20', 3500, 0, 100), durationSec: 20 * 60 }
  const quick = { ...it('quick', '01:17', 3500, 1, 100), durationSec: 17 * 60 }
  assert.equal(outshines(direct, quick), false)
  // An incomplete fare proves nothing.
  assert.equal(outshines({ ...viaNineD, fare: { totalIdr: 3500, complete: false } }, viaSixA), false)
})

const names = (trips: Itinerary[]) => trips.map((t) => t.id).sort()
const orders = <T,>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => orders(xs.toSpliced(i, 1)).map((rest) => [x, ...rest]))
const beats = (a: Itinerary, b: Itinerary) => dominates(a, b) || outshines(a, b)

test('keeps one trip of each kind, whatever the order', () => {
  const sooner = { ...it('sooner', '12:01', 3500, 2, 422), durationSec: 118 * 60 }
  for (const order of orders([viaSixA, viaSixB, viaNineD, sooner])) {
    assert.deepEqual(names(keepDistinct(order)), ['P11 > 9D', 'sooner'])
  }
  assert.deepEqual(keepDistinct([]), [])
})

test('keeps a trip whose only rival loses to a third', () => {
  // Cibubur (-6.369, 106.893) → Bundaran HI at 17.00, all leaving at 17.01:
  // 9D nearly copies 6B and 6B nearly copies 6A, but 6A is 5 min faster than 9D.
  const nineD = { ...it('P11 > 9D', '12:13', 3500, 1, 305), durationSec: 7924 }
  const sixB = { ...it('P11 > 9A > 6B', '12:11', 3500, 2, 409), durationSec: 7777 }
  const sixA = { ...it('P11 > 9A > 6A', '12:08', 3500, 2, 675), durationSec: 7612 }
  assert.ok(outshines(nineD, sixB) && outshines(sixB, sixA) && !beats(nineD, sixA))
  for (const order of orders([nineD, sixB, sixA])) {
    assert.deepEqual(names(keepDistinct(order)), ['P11 > 9A > 6A', 'P11 > 9D'])
  }
})

test('breaks a circle of near copies at the earliest arrival', () => {
  // Each is clearly ahead of the next on one count and within the margins on
  // the rest: a walks 300 m less than b, b arrives 6 min before c, and c
  // rides 6 min less than a.
  const a = { ...it('a', '02:00', 3500, 1, 0), durationSec: 3600 }
  const b = { ...it('b', '01:57', 3500, 1, 300), durationSec: 3420 }
  const c = { ...it('c', '02:03', 3500, 1, 150), durationSec: 3240 }
  assert.ok(outshines(a, b) && outshines(b, c) && outshines(c, a))
  for (const order of orders([a, b, c])) assert.deepEqual(names(keepDistinct(order)), ['b'])
})

test('settles any set of trips the same way whatever the order', () => {
  let seed = 1
  const random = (n: number) => (seed = (seed * 48_271) % 2_147_483_647) % n
  for (let round = 0; round < 1000; round++) {
    // Minutes and a few hundred metres apart, so most trips nearly copy another.
    const trips = Array.from({ length: 2 + random(7) }, (_, i) => ({
      ...it(`t${i}`, `02:${String(random(11)).padStart(2, '0')}`, [3500, 3500, 3500, 7000][random(4)], random(2), random(9) * 50, random(10) > 0),
      durationSec: (55 + random(11)) * 60,
    }))
    const kept = keepDistinct(trips)
    assert.ok(kept.length > 0)
    for (const a of kept) for (const b of kept) assert.ok(!beats(a, b), `${a.id} beats ${b.id}`)
    // A dropped trip loses to a kept one, or beats it in a circle.
    for (const t of trips) assert.ok(kept.includes(t) || kept.some((k) => beats(k, t) || beats(t, k)), `${t.id} dropped`)
    const turn = random(trips.length)
    for (const order of [trips.toReversed(), [...trips.slice(turn), ...trips.slice(0, turn)]]) {
      assert.deepEqual(names(keepDistinct(order)), names(kept))
    }
  }
})
