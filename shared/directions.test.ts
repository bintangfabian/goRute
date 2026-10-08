import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Leg, WalkStep } from './api.ts'
import { compass, fareText, serviceName, stepText } from './directions.ts'

const step = (s: Partial<WalkStep>): WalkStep => ({ maneuver: 'left', name: '', way: 'road', distanceM: 100, bearing: 0, ...s })

test('names the compass direction to set off in', () => {
  assert.equal(compass(0), 'utara')
  assert.equal(compass(91), 'timur')
  assert.equal(compass(225), 'barat daya')
  assert.equal(compass(350), 'utara')
  assert.equal(compass(-45), 'barat laut')
})

test('says each step the way navigation apps do', () => {
  assert.equal(stepText(step({ maneuver: 'depart', bearing: 270, name: 'Jalan Mawar' })), 'Jalan ke arah barat di Jalan Mawar')
  assert.equal(stepText(step({ maneuver: 'depart', bearing: 180, way: 'alley' })), 'Jalan ke arah selatan lewat gang')
  assert.equal(stepText(step({ maneuver: 'depart', bearing: 90 })), 'Jalan ke arah timur')
  assert.equal(stepText(step({ maneuver: 'left', name: 'Jalan Kenari' })), 'Belok kiri ke Jalan Kenari')
  assert.equal(stepText(step({ maneuver: 'slight-right', way: 'footway' })), 'Belok sedikit ke kanan ke trotoar')
  assert.equal(stepText(step({ maneuver: 'straight', name: 'Jalan Pahlawan' })), 'Lanjutkan ke Jalan Pahlawan')
  assert.equal(stepText(step({ maneuver: 'right' })), 'Belok kanan')
  assert.equal(stepText(step({ maneuver: 'uturn', name: 'Jalan Raya' })), 'Putar balik di Jalan Raya')
})

test('calls out crossings, footbridges, underpasses and stairs whatever the turn', () => {
  assert.equal(stepText(step({ way: 'crossing', name: 'Jalan Sudirman' })), 'Menyeberang jalan')
  assert.equal(stepText(step({ way: 'footbridge', maneuver: 'right' })), 'Naik jembatan penyeberangan (JPO)')
  assert.equal(stepText(step({ way: 'underpass' })), 'Lewat terowongan penyeberangan')
  assert.equal(stepText(step({ way: 'steps' })), 'Lewat tangga')
  assert.equal(stepText(step({ way: 'bridge' })), 'Lewat jembatan')
})

test('names the service and the fare to pay', () => {
  const ride = (category: string, fareIdr: number | null, fareCovered?: boolean) =>
    ({ route: { category, agency: 'TransJakarta' }, fareIdr, fareCovered }) as unknown as Leg
  assert.equal(serviceName(ride('BRT', 3500)), 'TransJakarta BRT')
  assert.equal(serviceName(ride('Angkutan Umum Integrasi', 3500)), 'TransJakarta Non-BRT')
  assert.equal(serviceName(ride('Mikrotrans', 0)), 'Mikrotrans')
  assert.equal(serviceName(ride('Bus Baru', 0)), 'Bus Baru')
  assert.equal(fareText(ride('BRT', 3500)), 'Rp3.500')
  // A Mikrotrans is free wherever it comes in the trip; a transfer the first ticket covers is not.
  assert.equal(fareText(ride('Mikrotrans', 0)), 'Gratis')
  assert.equal(fareText(ride('BRT', 0, true)), 'Rp0, masih tiket sebelumnya')
  assert.equal(fareText(ride('KRL', null)), 'Tarif belum diketahui')
})
