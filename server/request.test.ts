import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePlanRequest } from './request.ts'

const now = new Date('2026-10-06T08:00:00+07:00')
const parse = (query: string) => parsePlanRequest(new URLSearchParams(query), now)
const trip = 'fromLat=-6.2&fromLon=106.8&toLat=-6.19&toLon=106.82'

test('parses a trip', () => {
  assert.deepEqual(parse(`${trip}&fromName=Blok%20M`), {
    from: { name: 'Blok M', lat: -6.2, lon: 106.8 },
    to: { name: 'Tujuan', lat: -6.19, lon: 106.82 },
    departure: now,
  })
})

test('accepts an RFC 3339 departure time', () => {
  const req = parse(`${trip}&time=2026-10-06T06:30:00%2B07:00`)
  assert.ok(!('error' in req))
  assert.equal(req.departure.toISOString(), '2026-10-05T23:30:00.000Z')
})

test('accepts the departure time the web app sends', () => {
  // usePlan sends new Date(departure).toISOString(): UTC with milliseconds.
  const departure = Date.parse('2026-10-06T23:11:42.123+07:00')
  const req = parse(`${trip}&${new URLSearchParams({ time: new Date(departure).toISOString() })}`)
  assert.ok(!('error' in req))
  assert.equal(req.departure.getTime(), departure)
})

test('rejects bad input with a readable message', () => {
  assert.deepEqual(parse('toLat=-6.19&toLon=106.82'), { error: 'Parameter fromLat dan fromLon wajib berupa angka.' })
  assert.deepEqual(parse('fromLat=-6.2&fromLon=abc&toLat=-6.19&toLon=106.82'), {
    error: 'Parameter fromLat dan fromLon wajib berupa angka.',
  })
  assert.deepEqual(parse('fromLat=-6.2&fromLon=106.8&toLat=-6.9&toLon=107.6'), {
    error: 'Tujuan berada di luar area Jabodetabek.',
  })
  assert.deepEqual(parse(`${trip}&time=besok`), { error: 'Parameter time harus berformat RFC 3339.' })
})
