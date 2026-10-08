// The place search endpoints: our index answers at once and says when the
// public geocoder may add places; the geocoder has an endpoint of its own.

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { GET as geocode } from '../api/v1/geocode.ts'
import { GET as places } from '../api/v1/places.ts'
import type { PlacesAnswer } from '../shared/api.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Replaces fetch for one test; returns the URLs asked. */
function stubFetch(answer: () => Promise<Response>): URL[] {
  const asked: URL[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    asked.push(new URL(input instanceof Request ? input.url : input))
    return answer()
  }) as typeof fetch
  return asked
}

const ask = async (handler: (r: Request) => Promise<Response>, path: string) => {
  const res = await handler(new Request(`http://gorute.test${path}`))
  return { res, body: (await res.json()) as PlacesAnswer }
}

test('answers from our own index without waiting on the geocoder', async () => {
  const asked = stubFetch(() => Promise.reject(new Error('the geocoder must not be asked here')))
  const monas = await ask(places, '/api/v1/places?q=monumen%20nasional')
  assert.equal(monas.res.status, 200)
  assert.ok(monas.body.places.some((p) => p.name === 'Monumen Nasional'), JSON.stringify(monas.body.places))
  // Few places found: the app may ask the geocoder for more.
  assert.equal(monas.body.more, true)
  assert.match(monas.res.headers.get('Cache-Control') ?? '', /s-maxage=86400/)
  // Plenty found, or nothing to look for: no geocoder.
  assert.equal((await ask(places, '/api/v1/places?q=indosat')).body.more, false)
  assert.deepEqual((await ask(places, '/api/v1/places?q=...')).body, { places: [] })
  assert.equal(asked.length, 0)
})

test('asks the geocoder near the other end of the trip, and keeps no failure', async () => {
  const feature = { geometry: { coordinates: [106.83, -6.18] }, properties: { osm_type: 'N', osm_id: 1, name: 'Toko Uji', city: 'Jakarta' } }
  const asked = stubFetch(async () => Response.json({ features: [feature] }))
  const found = await ask(geocode, '/api/v1/geocode?q=toko%20uji&lat=-6.39&lon=106.82')
  assert.deepEqual(
    found.body.places.map((p) => p.name),
    ['Toko Uji'],
  )
  assert.equal(asked[0].searchParams.get('lat'), '-6.3900')
  assert.match(found.res.headers.get('Cache-Control') ?? '', /s-maxage=86400/)

  stubFetch(() => Promise.reject(new Error('down')))
  const failed = await geocode(new Request('http://gorute.test/api/v1/geocode?q=toko%20uji'))
  assert.equal(failed.status, 502)
  assert.equal(failed.headers.get('Cache-Control'), 'no-store')
  // Two letters are not worth a slow request.
  assert.deepEqual((await ask(geocode, '/api/v1/geocode?q=ab')).body, { places: [] })
})
