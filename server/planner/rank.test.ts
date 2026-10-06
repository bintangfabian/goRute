import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Itinerary } from '../../shared/api.ts'
import { rank } from './rank.ts'

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
