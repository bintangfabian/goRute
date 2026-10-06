import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDays, daysBetween, wibClock, wibDay, wibTime } from './time.ts'

const wib = (local: string) => Date.parse(`${local}+07:00`)

test('starts a WIB day at 17:00 UTC the day before', () => {
  assert.deepEqual(wibDay(Date.parse('2026-10-06T16:59:00Z')), {
    ymd: 20261006,
    weekday: 1,
    midnightMs: wib('2026-10-06T00:00:00'),
  })
  assert.equal(wibDay(Date.parse('2026-10-06T17:00:00Z')).ymd, 20261007)
})

test('adds days across a month end', () => {
  assert.deepEqual(addDays(wibDay(wib('2026-10-31T23:30:00')), 1), {
    ymd: 20261101,
    weekday: 6,
    midnightMs: wib('2026-11-01T00:00:00'),
  })
})

test('counts WIB days between two moments', () => {
  assert.equal(daysBetween(wib('2026-10-06T23:50:00'), wib('2026-10-07T00:10:00')), 1)
  assert.equal(daysBetween(wib('2026-10-06T00:10:00'), wib('2026-10-06T23:50:00')), 0)
  assert.equal(daysBetween(wib('2026-10-06T23:50:00'), wib('2026-10-08T06:50:00')), 2)
})

test('reads and sets the WIB clock', () => {
  // 06:30 WIB is 23:30 UTC the day before.
  assert.equal(wibClock(wib('2026-10-07T06:30:00')), '06:30')
  assert.equal(wibClock(wib('2026-10-06T23:50:00')), '23:50')
  const now = wib('2026-10-06T23:50:00')
  assert.equal(wibTime(now, 0, '07:00'), wib('2026-10-06T07:00:00'))
  assert.equal(wibTime(now, 1, '07:00'), wib('2026-10-07T07:00:00'))
})
