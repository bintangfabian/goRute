import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quoteFares } from './fare.ts'
import type { FareProduct } from './timetable/format.ts'

const regular: FareProduct = { id: 'TJ:FP', price: 3500, transfers: -1, transferDurationSec: 10_800 }
const royal: FareProduct = { id: 'TJ:PP', price: 20_000, transfers: -1, transferDurationSec: 10_800 }
const oneTransfer: FareProduct = { id: 'TJ:FP2', price: 3500, transfers: 1, transferDurationSec: 10_800 }

const at = (hhmm: string) => Date.parse(`2026-10-06T${hhmm}:00+07:00`)
const ride = (product: FareProduct | undefined, hhmm: string, routeId = 'TJ:1') => ({
  routeId,
  product,
  boardMs: at(hhmm),
})

test('one ticket covers transfers within three hours', () => {
  const q = quoteFares([ride(regular, '08:00'), ride(regular, '09:30'), ride(regular, '11:00')])
  assert.deepEqual(q, { total: 3500, charges: [3500, 0, 0], complete: true })
})

test('a new ticket is needed after three hours', () => {
  const q = quoteFares([ride(regular, '08:00'), ride(regular, '11:01')])
  assert.deepEqual(q.charges, [3500, 3500])
})

test('different products are paid separately', () => {
  const q = quoteFares([ride(regular, '08:00'), ride(royal, '08:30', 'TJ:1T'), ride(regular, '09:00')])
  assert.deepEqual(q, { total: 23_500, charges: [3500, 20_000, 0], complete: true })
})

test('limited transfers run out', () => {
  const q = quoteFares([ride(oneTransfer, '08:00'), ride(oneTransfer, '08:30'), ride(oneTransfer, '09:00')])
  assert.deepEqual(q.charges, [3500, 0, 3500])
})

test('TransJakarta costs Rp2.000 from 05:00 to 07:00', () => {
  assert.deepEqual(quoteFares([ride(regular, '04:59')]).charges, [3500])
  assert.deepEqual(quoteFares([ride(regular, '05:00')]).charges, [2000])
  assert.deepEqual(quoteFares([ride(regular, '06:59')]).charges, [2000])
  assert.deepEqual(quoteFares([ride(regular, '07:00')]).charges, [3500])
  assert.deepEqual(quoteFares([ride(royal, '06:00', 'TJ:1T')]).charges, [20_000])
  assert.deepEqual(quoteFares([ride(regular, '06:00', 'KRL:x')]).charges, [3500])
})

test('unknown fares make the total a lower bound', () => {
  const q = quoteFares([ride(regular, '08:00'), ride(undefined, '08:30', 'KRL:bogor')])
  assert.deepEqual(q, { total: 3500, charges: [3500, null], complete: false })
})
