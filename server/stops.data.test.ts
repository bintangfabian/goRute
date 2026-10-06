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
