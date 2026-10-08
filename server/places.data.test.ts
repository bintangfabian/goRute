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

test('short names go to the place riders mean, wherever they ask from', () => {
  const places = loadPlaces()!
  const cases: [string, RegExp][] = [
    // RS Citra Medika (Depok) and RS Cibitung Medika spell RSCM too, and are nearer from there.
    ['rscm', /^Rumah Sakit Cipto Mangunkusumo$/],
    // Bekasi Timur and every other "Timur" start with "tim"; the museum of Istiqlal is in TMII.
    ['tim', /^Taman Ismail Marzuki$/],
    ['istiqlal', /^Masjid Istiqlal$/],
    ['gbk', /^Stadion Utama Gelora Bung Karno$/],
    ['kokas', /^Kota Kasablanka$/],
    ['unj', /^Universitas Negeri Jakarta$/],
    ['cgk', /^Bandar Udara Internasional Soekarno-Hatta$/],
  ]
  // Depok, Bekasi, Bogor, Tangerang and Tanjung Priok.
  const from = [
    { lat: -6.3946, lon: 106.8226 },
    { lat: -6.2383, lon: 106.9756 },
    { lat: -6.595, lon: 106.8166 },
    { lat: -6.1783, lon: 106.6319 },
    { lat: -6.11, lon: 106.88 },
  ]
  for (const [q, want] of cases) {
    for (const near of from) assert.match(places.search(q, near)[0].name, want, `${q} from ${JSON.stringify(near)}`)
  }
})
