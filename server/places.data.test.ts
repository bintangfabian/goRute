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

test('reads campus and landmark initials and the area a query names', () => {
  const places = loadPlaces()!
  const top = (q: string) => places.search(q, MONAS)[0]
  assert.deepEqual([top('ui depok').name, top('ui depok').address], ['Universitas Indonesia', 'Kampus · Pondok Cina, Depok'])
  assert.equal(top('unj').name, 'Universitas Negeri Jakarta')
  assert.match(top('untar').name, /^Universitas Tarumanagara/)
  assert.equal(top('rscm').name, 'Rumah Sakit Cipto Mangunkusumo')
  assert.equal(top('gbk').name, 'Stadion Utama Gelora Bung Karno')
  assert.match(top('pim').name, /^Pondok Indah Mall/)
  assert.equal(top('cgk').name, 'Bandar Udara Internasional Soekarno-Hatta')
  assert.equal(top('kokas').name, 'Kota Kasablanka')
  const fatmawati = top('rs fatmawati')
  assert.deepEqual([fatmawati.category, /Fatmawati/.test(fatmawati.name)], ['Rumah sakit', true])
  assert.ok(places.search('atma jaya', MONAS).some((p) => p.name === 'Universitas Katolik Indonesia Atmajaya'))
  const indomarets = places.search('indomaret depok', MONAS)
  assert.ok(indomarets.length >= 3 && indomarets.every((p) => p.name === 'Indomaret' && p.address.endsWith(', Depok')), JSON.stringify(indomarets))
  assert.equal(top('monas').address, 'Tempat bersejarah · Gambir, Jakarta Pusat')
})
