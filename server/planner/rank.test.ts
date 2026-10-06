import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Itinerary } from '../../shared/api.ts'
import { dominates, rank } from './rank.ts'

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
