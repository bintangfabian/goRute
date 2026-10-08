import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildPlacesFile, cityName, initials, placeKind } from './places.ts'
import { writePbf, type TestNode, type TestRelation, type TestWay } from './testing.ts'

const tags = (o: Record<string, string>) => new Map(Object.entries(o))

test('names what a place is in words riders use', () => {
  const label = (t: Record<string, string>) => placeKind(tags(t))?.label
  assert.equal(label({ shop: 'mall' }), 'Mal')
  assert.equal(label({ railway: 'station' }), 'Stasiun')
  assert.equal(label({ amenity: 'hospital' }), 'Rumah sakit')
  assert.equal(label({ amenity: 'place_of_worship', religion: 'muslim' }), 'Masjid')
  assert.equal(label({ amenity: 'place_of_worship', religion: 'christian' }), 'Gereja')
  assert.equal(label({ amenity: 'place_of_worship' }), 'Tempat ibadah')
  assert.equal(label({ landuse: 'residential' }), 'Perumahan')
  assert.equal(label({ building: 'apartments' }), 'Apartemen')
  assert.equal(label({ office: 'telecommunication' }), 'Kantor')
  // Things nobody travels to by name stay out.
  assert.equal(placeKind(tags({ amenity: 'atm' })), null)
  assert.equal(placeKind(tags({ amenity: 'parking' })), null)
  // A mall outweighs a shop, a station a school.
  assert.ok(placeKind(tags({ shop: 'mall' }))!.weight > placeKind(tags({ shop: 'clothes' }))!.weight)
})

test('builds the index: areas by their middle, one entry per place, streets grouped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gorute-places-'))
  try {
    const file = join(dir, 'places.osm.pbf')
    writeFileSync(
      file,
      writePbf({
        nodes: [
          { id: 1, lat: -6.2, lon: 106.8, tags: { name: 'Kebon Uji', place: 'suburb' } },
          { id: 2, lat: -6.201, lon: 106.801, tags: { name: 'Mal Uji', shop: 'mall' } },
          // The station twice: its node, and a platform-ish node by another name 200 m off.
          { id: 3, lat: -6.202, lon: 106.802, tags: { name: 'Stasiun Uji', railway: 'station' } },
          { id: 4, lat: -6.2038, lon: 106.802, tags: { name: 'Uji', public_transport: 'station', train: 'yes' } },
          { id: 5, lat: -6.2, lon: 106.8005, tags: { name: 'ATM Uji', amenity: 'atm' } },
          // The outline of a mosque mapped as a relation, around (-6.205, 106.805).
          { id: 10, lat: -6.204, lon: 106.804 },
          { id: 11, lat: -6.204, lon: 106.806 },
          { id: 12, lat: -6.206, lon: 106.806 },
          { id: 13, lat: -6.206, lon: 106.804 },
          // Jalan Panjang twice nearby, and once in another town; a main road.
          { id: 20, lat: -6.21, lon: 106.8 },
          { id: 21, lat: -6.21, lon: 106.801 },
          { id: 22, lat: -6.21, lon: 106.803 },
          { id: 23, lat: -6.25, lon: 106.8 },
          { id: 24, lat: -6.25, lon: 106.801 },
          { id: 25, lat: -6.22, lon: 106.8 },
          { id: 26, lat: -6.22, lon: 106.81 },
        ],
        ways: [
          { id: 100, refs: [10, 11, 12, 13, 10] },
          { id: 101, refs: [20, 21], tags: { highway: 'residential', name: 'Jalan Panjang' } },
          { id: 102, refs: [21, 22], tags: { highway: 'residential', name: 'Jalan Panjang' } },
          { id: 103, refs: [23, 24], tags: { highway: 'residential', name: 'Jalan Panjang' } },
          { id: 104, refs: [25, 26], tags: { highway: 'primary', name: 'Jalan Protokol' } },
          { id: 105, refs: [25, 26], tags: { highway: 'motorway', name: 'Jalan Tol Uji' } },
        ],
        relations: [
          {
            id: 200,
            members: [{ type: 'way', ref: 100, role: 'outer' }],
            tags: { type: 'multipolygon', name: 'Masjid Raya Uji', amenity: 'place_of_worship', religion: 'muslim' },
          },
        ],
      }),
    )
    const f = buildPlacesFile(file, new Date('2026-10-08'))
    const entries = f.name.map((name, i) => ({
      name,
      label: f.labels[f.kind[i]],
      area: f.area[i] >= 0 ? f.areas[f.area[i]] : '',
      lat: f.lat[i] / 1e5,
      lon: f.lon[i] / 1e5,
      weight: f.weight[i],
    }))
    const names = entries.map((e) => e.name).sort()
    assert.deepEqual(names, ['Jalan Panjang', 'Jalan Panjang', 'Jalan Protokol', 'Kebon Uji', 'Mal Uji', 'Masjid Raya Uji', 'Stasiun Uji'])

    const mosque = entries.find((e) => e.name === 'Masjid Raya Uji')!
    assert.equal(mosque.label, 'Masjid')
    assert.ok(Math.abs(mosque.lat - -6.205) < 0.0006 && Math.abs(mosque.lon - 106.805) < 0.0006, `${mosque.lat}, ${mosque.lon}`)
    assert.equal(entries.find((e) => e.name === 'Mal Uji')!.area, 'Kebon Uji')

    const protokol = entries.find((e) => e.name === 'Jalan Protokol')!
    const panjang = entries.filter((e) => e.name === 'Jalan Panjang')
    assert.equal(protokol.label, 'Jalan')
    assert.ok(panjang.every((p) => protokol.weight > p.weight))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('spells out initials riders type and names cities as they write them', () => {
  assert.equal(initials('Universitas Negeri Jakarta'), 'unj')
  assert.equal(initials('Pondok Indah Mall 2'), 'pim 2')
  assert.equal(initials('RS Dr. Cipto Mangunkusumo'), 'rscm')
  assert.equal(initials('Rumah Sakit Jantung dan Pembuluh Darah Harapan Kita'), 'rsjpdhk')
  // Two letters would match too much; numbers inside a name make no initials.
  assert.equal(initials('Universitas Indonesia'), '')
  assert.equal(initials('SMA Negeri 8 Jakarta'), '')
  assert.equal(cityName('Kab Bogor'), 'Kab. Bogor')
  assert.equal(cityName('Kabupaten Tangerang'), 'Kab. Tangerang')
  assert.equal(cityName('Kota Administrasi Jakarta Selatan'), 'Jakarta Selatan')
  assert.equal(cityName('Depok'), 'Depok')
})

test('says which village, district and city each place is in, from their outlines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gorute-places-'))
  try {
    // A city square from (-6.40, 106.80) to (-6.30, 106.90), one district filling it,
    // and a village in its south-west corner; a campus in the village, a mall in
    // the city outside the village, and a shop outside the city by a named neighbourhood.
    const corners = (id: number, lat: number, lon: number, size: number): TestNode[] => [
      { id, lat, lon },
      { id: id + 1, lat, lon: lon + size },
      { id: id + 2, lat: lat + size, lon: lon + size },
      { id: id + 3, lat: lat + size, lon },
    ]
    const ring = (id: number, first: number): TestWay => ({ id, refs: [first, first + 1, first + 2, first + 3, first] })
    const boundary = (id: number, way: number, level: string, name: string): TestRelation => ({
      id,
      members: [{ type: 'way', ref: way, role: 'outer' }],
      tags: { type: 'boundary', boundary: 'administrative', admin_level: level, name },
    })
    writeFileSync(
      join(dir, 'places.osm.pbf'),
      writePbf({
        nodes: [
          ...corners(1, -6.4, 106.8, 0.1),
          ...corners(11, -6.4, 106.8, 0.05),
          { id: 21, lat: -6.38, lon: 106.82, tags: { name: 'Universitas Uji Negeri', amenity: 'university' } },
          { id: 22, lat: -6.32, lon: 106.88, tags: { name: 'Mal Uji', shop: 'mall' } },
          { id: 23, lat: -6.2, lon: 106.8, tags: { name: 'Toko Jauh', shop: 'bakery' } },
          { id: 24, lat: -6.205, lon: 106.8, tags: { name: 'Kampung Jauh', place: 'neighbourhood' } },
        ],
        ways: [ring(100, 1), ring(101, 11)],
        relations: [boundary(200, 100, '5', 'Kab Uji'), boundary(201, 100, '6', 'Kecamatan Uji'), boundary(202, 101, '7', 'Desa Uji')],
      }),
    )
    const f = buildPlacesFile(join(dir, 'places.osm.pbf'), new Date('2026-10-08'))
    const at = (name: string) => {
      const i = f.name.indexOf(name)
      const region = f.region[i] >= 0 ? f.regions.slice(f.region[i] * 4, f.region[i] * 4 + 4).map((a) => f.areas[a] ?? '') : []
      return { area: f.areas[f.area[i]] ?? '', region, initials: f.initials[i] }
    }
    assert.deepEqual(at('Universitas Uji Negeri'), { area: 'Desa Uji', region: ['Desa Uji', 'Kecamatan Uji', 'Kab. Uji', ''], initials: 'uun' })
    assert.deepEqual(at('Mal Uji'), { area: 'Kecamatan Uji', region: ['', 'Kecamatan Uji', 'Kab. Uji', ''], initials: '' })
    // Outside every outline, the nearest named neighbourhood still says where it is.
    assert.deepEqual(at('Toko Jauh'), { area: 'Kampung Jauh', region: [], initials: '' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('keeps train stations, leaves haltes to the halte search, and drops what is closed or far', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gorute-places-'))
  try {
    writeFileSync(
      join(dir, 'places.osm.pbf'),
      writePbf({
        nodes: [
          // A train station with a bus terminal of the same name next to it, as at Manggarai.
          { id: 1, lat: -6.21, lon: 106.85, tags: { name: 'Manggarai', railway: 'station', public_transport: 'station', train: 'yes' } },
          { id: 2, lat: -6.2125, lon: 106.85, tags: { name: 'Manggarai', amenity: 'bus_station' } },
          // A BRT halte mapped as a station, on a halte of the timetable.
          { id: 3, lat: -6.18, lon: 106.82, tags: { name: 'Monumen Nasional', amenity: 'bus_station', public_transport: 'station', bus: 'yes' } },
          // A closed train station, and a station far outside Jabodetabek.
          { id: 4, lat: -6.2, lon: 106.82, tags: { name: 'Karet', public_transport: 'station', 'disused:railway': 'station' } },
          { id: 5, lat: -8.2, lon: 114.37, tags: { name: 'Banyuwangi', railway: 'station' } },
          // An RT office mapped as a government office.
          { id: 6, lat: -6.11, lon: 106.74, tags: { name: 'PIK RW 03', office: 'government' } },
        ],
      }),
    )
    const f = buildPlacesFile(join(dir, 'places.osm.pbf'), new Date('2026-10-08'), { lat: [-6.1801], lon: [106.8201] })
    const entries = f.name.map((name, i) => `${name} (${f.labels[f.kind[i]]} ${f.weight[i]})`).sort()
    assert.deepEqual(entries, ['Manggarai (Stasiun 3)', 'Manggarai (Terminal bus 3)', 'PIK RW 03 (Kantor 1)'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
