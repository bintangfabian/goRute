import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildPlacesFile, placeKind } from './places.ts'
import { writePbf } from './testing.ts'

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
          { id: 4, lat: -6.2038, lon: 106.802, tags: { name: 'Uji', public_transport: 'station' } },
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
