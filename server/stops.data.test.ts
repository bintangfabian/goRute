// Halte search against the committed TransJakarta timetable, so renamed
// haltes break the tests rather than the aliases.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALIASES, placeName, searchStops } from './stops.ts'
import { loadTimetable } from './timetable/timetable.ts'

const names = (q: string) => searchStops(loadTimetable(), q).map((p) => p.name)

test('every alias leads to its halte', () => {
  for (const [alias, targets] of Object.entries(ALIASES)) {
    for (const target of targets) {
      const found = names(alias)
      assert.ok(found.map(placeName).includes(target), `${alias} → ${target}, got ${found.join(', ')}`)
    }
  }
})

test('finds common places by the names people use', () => {
  assert.equal(names('Monas')[0], 'Monumen Nasional')
  assert.equal(names('stasiun sudirman')[0], 'St. Sudirman 2')
  assert.equal(names('blok m')[0], 'Blok M')
})

test('tells same-named haltes apart', () => {
  // Cut Mutia's nearest BRT halte is the same for both, so it falls back to any halte.
  for (const name of ['Masjid At Taqwa', 'Cipulir', 'Lapangan Banteng', 'Cut Mutia']) {
    const same = searchStops(loadTimetable(), name).filter((p) => p.name === name)
    const hints = same.map((p) => p.address.match(/^Dekat Halte (.+?) ·/)?.[1])
    assert.ok(same.length > 1 && hints.every(Boolean), `${name}: ${same.map((p) => p.address).join(' / ')}`)
    assert.equal(new Set(hints).size, hints.length, `${name}: ${hints.join(' / ')}`)
  }
})

test('keeps the number when it names a different place', () => {
  assert.equal(names('sman 73')[0], 'SMAN 73')
  assert.equal(names('smkn 48')[0], 'SMKN 48')
  // SMPN 209 and SMPN 126 are a few hundred metres apart but different schools.
  assert.equal(names('smpn 209')[0], 'SMPN 209')
  // SMAN 85 and the stop across the road are one place.
  assert.deepEqual(names('sman 85'), ['SMAN 85'])
  const schools = names('sman')
  assert.equal(new Set(schools).size, schools.length, schools.join(', '))
})
