import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PLACES_VERSION, PlaceIndex, type PlacesFile } from './places.ts'

type TestPlace = {
  name: string
  alt?: string
  nicknames?: string
  initials?: string
  label: string
  weight: number
  lat: number
  lon: number
  area?: string
  /** Village, district, city. */
  region?: [string, string, string]
}

function index(places: TestPlace[]): PlaceIndex {
  const labels = [...new Set(places.map((p) => p.label))]
  const areas = [...new Set(places.flatMap((p) => [p.area ?? '', ...(p.region ?? [])]).filter(Boolean))]
  const regionKeys = [...new Set(places.flatMap((p) => (p.region ? [p.region.join('|')] : [])))]
  const file: PlacesFile = {
    version: PLACES_VERSION,
    builtAt: '2026-10-08T00:00:00.000Z',
    labels,
    areas,
    regions: regionKeys.flatMap((k) => [...k.split('|').map((a) => areas.indexOf(a)), -1]),
    name: places.map((p) => p.name),
    alt: places.map((p) => p.alt ?? ''),
    nicknames: places.map((p) => p.nicknames ?? ''),
    initials: places.map((p) => p.initials ?? ''),
    lat: places.map((p) => Math.round(p.lat * 1e5)),
    lon: places.map((p) => Math.round(p.lon * 1e5)),
    kind: places.map((p) => labels.indexOf(p.label)),
    weight: places.map((p) => p.weight),
    area: places.map((p) => (p.area ? areas.indexOf(p.area) : -1)),
    region: places.map((p) => (p.region ? regionKeys.indexOf(p.region.join('|')) : -1)),
  }
  return new PlaceIndex(file)
}

const JAKARTA = { lat: -6.2, lon: 106.82 }
const BOGOR = { lat: -6.6, lon: 106.8 }

const places = index([
  { name: 'Kemang', label: 'Kota', weight: 3, lat: -6.5, lon: 106.74 },
  { name: 'Lippo Mall Kemang', label: 'Mal', weight: 3, lat: -6.26, lon: 106.81, area: 'Bangka' },
  { name: 'Kemanggisan', label: 'Terminal bus', weight: 3, lat: -6.19, lon: 106.78 },
  { name: 'Jalan Sudirman Indah', label: 'Jalan', weight: 1.5, lat: -6.3, lon: 106.5 },
  { name: 'Jalan Jenderal Sudirman', label: 'Jalan', weight: 3.5, lat: -6.21, lon: 106.82, area: 'Setiabudi' },
  {
    name: 'Monumen Nasional',
    alt: 'Monas',
    label: 'Tempat bersejarah',
    weight: 2,
    lat: -6.1754,
    lon: 106.8272,
    area: 'Gambir',
    region: ['Gambir', 'Gambir', 'Jakarta Pusat'],
  },
  { name: 'Toko Monas', label: 'Toko', weight: 1, lat: -6.4, lon: 106.9 },
  { name: 'RS Pondok Indah', label: 'Rumah sakit', weight: 3, lat: -6.28, lon: 106.78 },
])
const names = (q: string, near = JAKARTA) => places.search(q, near).map((p) => p.name)

test('ranks the place typed above places that merely share its first letters', () => {
  assert.equal(names('kemang')[0], 'Kemang')
  assert.ok(names('kemang').indexOf('Lippo Mall Kemang') < names('kemang').indexOf('Kemanggisan'))
})

test('weighs what a place is and how near it is against how the name starts', () => {
  // The avenue, not the lane that happens to start with the words typed.
  assert.equal(names('jalan sudirman')[0], 'Jalan Jenderal Sudirman')
})

test('finds places by their other names, and says what and where they are', () => {
  const [monas] = places.search('monas', JAKARTA)
  assert.equal(monas.name, 'Monumen Nasional')
  assert.equal(monas.address, 'Tempat bersejarah · Gambir, Jakarta Pusat')
  assert.equal(monas.kind, 'place')
  assert.ok(Math.abs(monas.lat - -6.1754) < 1e-5)
  // "rs" is spelled out the same way in the name and the query.
  assert.equal(names('rumah sakit pondok')[0], 'RS Pondok Indah')
})

test('prefers places near the rider among equals', () => {
  const twins = index([
    { name: 'Pasar Baru', label: 'Pasar', weight: 2, lat: -6.16, lon: 106.83 },
    { name: 'Pasar Baru', label: 'Pasar', weight: 2, lat: -6.59, lon: 106.79 },
  ])
  assert.ok(Math.abs(twins.search('pasar baru', JAKARTA)[0].lat - -6.16) < 1e-6)
  assert.ok(Math.abs(twins.search('pasar baru', BOGOR)[0].lat - -6.59) < 1e-6)
  assert.deepEqual(twins.search('x', JAKARTA), [])
})

test('reads words naming the area or the kind of place as where and what, not part of the name', () => {
  const DEPOK: [string, string, string] = ['Pondok Cina', 'Beji', 'Depok']
  const campus = index([
    { name: 'Universitas Indonesia', alt: 'UI', label: 'Kampus', weight: 3, lat: -6.36, lon: 106.83, area: 'Pondok Cina', region: DEPOK },
    { name: 'Universitas Indonesia', alt: 'UI', label: 'Kampus', weight: 3, lat: -6.19, lon: 106.85, area: 'Kenari', region: ['Kenari', 'Senen', 'Jakarta Pusat'] },
    { name: 'Kos Dekat UI Depok', label: 'Gedung', weight: 1, lat: -6.36, lon: 106.82, area: 'Kukusan', region: ['Kukusan', 'Beji', 'Depok'] },
    { name: 'Rumah Sakit Umum Pusat Fatmawati', label: 'Rumah sakit', weight: 3, lat: -6.29, lon: 106.79 },
    { name: 'Jalan RS Fatmawati', label: 'Jalan', weight: 3.2, lat: -6.27, lon: 106.79 },
  ])
  const top = (q: string) => campus.search(q, JAKARTA)[0]
  // The campus in Depok, not a boarding house named after it, nor the campus in Salemba.
  assert.deepEqual([top('ui depok').name, top('ui depok').address], ['Universitas Indonesia', 'Kampus · Pondok Cina, Depok'])
  assert.equal(top('ui dep').address, 'Kampus · Pondok Cina, Depok')
  assert.equal(top('kampus ui depok').address, 'Kampus · Pondok Cina, Depok')
  assert.equal(top('rs fatmawati').name, 'Rumah Sakit Umum Pusat Fatmawati')
  assert.equal(top('jalan fatmawati').name, 'Jalan RS Fatmawati')
  // Only area words, or a word naming nothing here: no guesses.
  assert.deepEqual(campus.search('depok beji', JAKARTA), [])
  assert.deepEqual(campus.search('ui bogor', JAKARTA), [])
})

test('finds initials only when typed whole, and names written with other spaces', () => {
  const malls = index([
    { name: 'Pondok Indah Mall 2', initials: 'pim 2', label: 'Mal', weight: 3, lat: -6.27, lon: 106.78 },
    { name: 'Pimpinan Wilayah', label: 'Kantor', weight: 2, lat: -6.2, lon: 106.82 },
    { name: 'Universitas Atmajaya', label: 'Kampus', weight: 3, lat: -6.22, lon: 106.82 },
  ])
  const found = (q: string) => malls.search(q, JAKARTA).map((p) => p.name)
  assert.equal(found('pim')[0], 'Pondok Indah Mall 2')
  assert.equal(found('pim 2')[0], 'Pondok Indah Mall 2')
  // Two letters only find a whole name or whole initials.
  assert.deepEqual(found('pi'), [])
  assert.deepEqual(found('atma jaya'), ['Universitas Atmajaya'])
})

test('puts the place a nickname names first, however near other matches are', () => {
  const BEKASI = { lat: -6.24, lon: 106.98 }
  const near = index([
    { name: 'Taman Ismail Marzuki', nicknames: 'TIM', label: 'Kawasan', weight: 1, lat: -6.189, lon: 106.84 },
    { name: 'Bekasi Timur', label: 'Stasiun', weight: 3, lat: -6.247, lon: 107.018 },
    { name: 'Masjid Istiqlal', nicknames: 'Istiqlal', label: 'Masjid', weight: 2.5, lat: -6.17, lon: 106.831 },
    { name: 'Bayt Al Quran dan Museum Islam Istiqlal', label: 'Museum', weight: 3, lat: -6.3, lon: 106.89 },
  ])
  assert.equal(near.search('tim', BEKASI)[0].name, 'Taman Ismail Marzuki')
  assert.equal(near.search('istiqlal', BEKASI)[0].name, 'Masjid Istiqlal')
  // Only typed whole: half of it is still everything that starts so.
  assert.equal(near.search('timu', BEKASI)[0].name, 'Bekasi Timur')
})
