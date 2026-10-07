// Sanity checks against the committed place index, so a broken data build
// fails the tests rather than the search box.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadPlaces } from './places.ts'

const MONAS = { lat: -6.1754, lon: 106.8272 }

test('finds offices, landmarks mapped as areas, and the avenue people mean', () => {
  const places = loadPlaces()!
  assert.ok(places.size > 100_000, `${places.size} places`)
  const top = (q: string) => places.search(q, MONAS)
  assert.ok(top('indosat').filter((p) => /indosat/i.test(p.name)).length >= 3, JSON.stringify(top('indosat')))
  assert.equal(top('masjid istiqlal')[0].name, 'Masjid Istiqlal')
  const sudirman = top('jalan sudirman')[0]
  assert.equal(sudirman.name, 'Jalan Jenderal Sudirman')
  // In central Jakarta, between Senayan and Bundaran HI.
  assert.ok(sudirman.lat > -6.25 && sudirman.lat < -6.18 && sudirman.lon > 106.79 && sudirman.lon < 106.84, `${sudirman.lat}, ${sudirman.lon}`)
})
