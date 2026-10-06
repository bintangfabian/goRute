import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toPlaces, type FeatureCollection } from './geocode.ts'

const feature = (name: string | undefined, lon: number, lat: number, props: object = {}) => ({
  geometry: { coordinates: [lon, lat] as [number, number] },
  properties: { name, osm_type: 'N', osm_id: Math.round(lon * 1e4), ...props },
})

test('dedupes nearby duplicates and builds an address', () => {
  const fc: FeatureCollection = {
    features: [
      feature('Blok M', 106.8011, -6.2433, { street: 'Jalan Melawai', city: 'Jakarta Selatan', state: 'Jakarta' }),
      feature('Blok M', 106.80112, -6.24331), // same place, label node
      feature(undefined, 106.8, -6.2), // unnamed
      feature('Blok M Square', 106.802, -6.2445, { district: 'Melawai', city: 'Blok M Square' }),
    ],
  }
  assert.deepEqual(
    toPlaces(fc).map((p) => [p.name, p.address]),
    [
      ['Blok M', 'Jalan Melawai, Jakarta Selatan, Jakarta'],
      ['Blok M Square', 'Melawai'],
    ],
  )
})
