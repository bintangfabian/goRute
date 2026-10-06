import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodePolyline, distanceM, encodePolyline, type LonLat } from './geo.ts'

test('encodes the reference polyline', () => {
  // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
  const points: LonLat[] = [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]
  assert.equal(encodePolyline(points), '_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), points)
})

test('measures distance', () => {
  const m = distanceM(-6.1754, 106.8272, -6.2088, 106.8456) // Monas → Semanggi
  assert.ok(Math.abs(m - 4219) < 20, `got ${m}`)
})
