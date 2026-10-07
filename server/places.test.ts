import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PLACES_VERSION, PlaceIndex, type PlacesFile } from './places.ts'

function index(places: { name: string; alt?: string; label: string; weight: number; lat: number; lon: number; area?: string }[]): PlaceIndex {
  const labels = [...new Set(places.map((p) => p.label))]
  const areas = [...new Set(places.flatMap((p) => (p.area ? [p.area] : [])))]
  const file: PlacesFile = {
    version: PLACES_VERSION,
    builtAt: '2026-10-08T00:00:00.000Z',
    labels,
    areas,
    name: places.map((p) => p.name),
    alt: places.map((p) => p.alt ?? ''),
    lat: places.map((p) => Math.round(p.lat * 1e5)),
    lon: places.map((p) => Math.round(p.lon * 1e5)),
    kind: places.map((p) => labels.indexOf(p.label)),
    weight: places.map((p) => p.weight),
    area: places.map((p) => (p.area ? areas.indexOf(p.area) : -1)),
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
  { name: 'Monumen Nasional', alt: 'Monas', label: 'Tempat bersejarah', weight: 2, lat: -6.1754, lon: 106.8272, area: 'Gambir' },
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
  assert.equal(monas.address, 'Tempat bersejarah · Gambir')
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
