import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTimetable } from '../scripts/gtfs/build.ts'
import { nameForms, placeName, searchStops, words } from './stops.ts'
import { Timetable } from './timetable/timetable.ts'

const csv = (...lines: string[]) => lines.join('\n') + '\n'

// Name, position, and the routes stopping there.
const STOPS: [string, number, number, string[]][] = [
  ['Monumen Nasional', -6.176, 106.823, ['1', '2']],
  ['Monas 1', -6.177, 106.829, ['M']],
  ['Monas 2', -6.1772, 106.8292, ['M']],
  ['St. Gambir 1', -6.1765, 106.8306, ['M']],
  ['Sbr. St. Gambir', -6.1768, 106.831, ['M']],
  ['Blok M', -6.2436, 106.8003, ['1']],
  ['Blok M Jalur 2', -6.244, 106.8008, ['1']],
  ['Gelora Bung Karno 1', -6.218, 106.802, ['1', '2']],
  ['Ps. Minggu', -6.284, 106.844, ['9']],
  ['Ps. Minggu 2', -6.32, 106.85, ['9']], // another Pasar Minggu, 4 km away
  ['GBK Pintu 7', -6.2185, 106.8045, ['2']], // a gate number, not a platform
  ['SMAN 73', -6.3, 106.9, ['S']],
  ['SMAN 85', -6.25, 106.75, ['S']],
  ['Sbr. SMAN 85', -6.2503, 106.7503, ['S']], // across the road from SMAN 85
  ['Masjid At Taqwa', -6.2845, 106.8445, ['9']], // next to Ps. Minggu
  ['Masjid At Taqwa', -6.244, 106.801, ['1']], // another one, next to Blok M
  ['Jln. Kb. Nanas', -6.3005, 106.9005, ['S']], // next to SMAN 73, a BRT halte
  ['Pasar Cakung', -6.1, 106.95, ['M']], // far from any BRT halte
  ['Jln. Kb. Nanas', -6.1005, 106.9505, ['M']], // another one, next to Pasar Cakung
]

function timetable(): Timetable {
  const routes = [...new Set(STOPS.flatMap(([, , , r]) => r))]
  const files = new Map([
    ['agency.txt', csv('agency_id,agency_name,agency_url,agency_timezone', 'T,Transjakarta,https://example.com,Asia/Jakarta')],
    ['stops.txt', csv('stop_id,stop_name,stop_lat,stop_lon', ...STOPS.map(([name, lat, lon], i) => `s${i},"${name}",${lat},${lon}`))],
    [
      'routes.txt',
      csv(
        'route_id,agency_id,route_short_name,route_long_name,route_desc,route_type',
        ...routes.map((r) => `${r},T,${r},,${r === 'M' ? 'Mikrotrans' : 'BRT'},3`),
      ),
    ],
    [
      'calendar.txt',
      csv(
        'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
        'ALL,1,1,1,1,1,1,1,20260101,20271231',
      ),
    ],
    ['trips.txt', csv('route_id,service_id,trip_id', ...routes.map((r) => `${r},ALL,t${r}`))],
    [
      'stop_times.txt',
      csv(
        'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
        ...routes.flatMap((r) =>
          STOPS.flatMap(([, , , serving], i) => (serving.includes(r) ? [`t${r},05:${String(i).padStart(2, '0')}:00,05:${String(i).padStart(2, '0')}:00,s${i},${i}`] : [])),
        ),
      ),
    ],
  ])
  const { timetable, warnings } = buildTimetable([{ id: 'TJ', name: 'Test', files }], new Date('2026-10-01'))
  if (warnings.length > 0) throw new Error(warnings.join('\n'))
  return new Timetable(timetable)
}

const tt = timetable()
const search = (q: string) => searchStops(tt, q).map((p) => p.name)

test('reduces stop names to the place they serve', () => {
  assert.deepEqual(nameForms('Sbr. Monas 2'), ['Sbr. Monas 2', 'Monas 2', 'Monas'])
  // Platforms are one digit; other numbers are part of the place's name.
  assert.deepEqual(nameForms('Sbr. SMAN 85'), ['Sbr. SMAN 85', 'SMAN 85'])
  assert.equal(placeName('SDN Lebak Bulus 01'), 'SDN Lebak Bulus 01')
  assert.equal(placeName('Sbr. St. Gambir 2'), 'St. Gambir')
  assert.equal(placeName('Blok M Jalur 3'), 'Blok M')
  assert.equal(placeName('Kebon Sirih Arah Selatan'), 'Kebon Sirih')
  assert.equal(placeName('Blok A'), 'Blok A') // the letter is part of the name
  assert.deepEqual(words('Sbr. Univ. Mercu Buana'), ['seberang', 'universitas', 'mercu', 'buana'])
})

test('finds a halte by its popular name', () => {
  // Both match exactly; the halte with more routes comes first.
  assert.deepEqual(search('monas'), ['Monumen Nasional', 'Monas'])
  // A lone "… 1" keeps its number but still answers to the alias.
  assert.deepEqual(search('GBK'), ['Gelora Bung Karno 1', 'GBK Pintu 7'])
})

test('spells out abbreviations and merges platforms', () => {
  assert.deepEqual(search('stasiun gambir'), ['St. Gambir'])
  assert.deepEqual(search('st gambir'), ['St. Gambir'])
  assert.deepEqual(search('blok m'), ['Blok M'])
  // Far apart, so two places that each keep their own name.
  assert.deepEqual(search('pasar minggu'), ['Ps. Minggu', 'Ps. Minggu 2'])
})

test('keeps numbers that tell places apart', () => {
  assert.deepEqual(search('sman 73'), ['SMAN 73'])
  assert.deepEqual(search('sman'), ['SMAN 73', 'SMAN 85'])
})

test('finds a merged halte by any of its stop names', () => {
  assert.deepEqual(search('monas 2'), ['Monas'])
})

test('matches the start of words only', () => {
  assert.deepEqual(search('gamb'), ['St. Gambir'])
  assert.deepEqual(search('ambir'), [])
  assert.deepEqual(search('m'), [])
})

test('hints at a nearby halte, a BRT one when it is close', () => {
  assert.deepEqual(searchStops(tt, 'masjid at taqwa').map((p) => p.address).sort(), [
    'Dekat Halte Blok M · 1',
    'Dekat Halte Ps. Minggu · 9',
  ])
  // The nearest BRT halte is kilometres from the second one, so any nearby halte does.
  assert.deepEqual(searchStops(tt, 'jln kb nanas').map((p) => p.address).sort(), [
    'Dekat Halte Pasar Cakung · M',
    'Dekat Halte SMAN 73 · S',
  ])
})

test('describes a halte by the routes stopping there', () => {
  const [halte] = searchStops(tt, 'monumen nasional')
  assert.equal(halte.kind, 'stop')
  assert.equal(halte.address, 'Halte Transjakarta · 1, 2')
  assert.deepEqual([halte.lat, halte.lon], [-6.176, 106.823])
})
