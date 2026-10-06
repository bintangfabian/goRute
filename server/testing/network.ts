// A tiny GTFS network for tests, compiled by the real pipeline.
//
//   A ──1── B ──1── C ──1── D   E ──2── F
//   └──────────X (express)──────┘
//   └──────────Y (express)──────┘
//
// Stops are ~1.1 km apart along one street; D and E are ~22 m apart, so
// D→E is a walking transfer. Routes X and Y are pricey weekday-only
// expresses; Y is a little slower.

import { buildTimetable } from '../../scripts/gtfs/build.ts'
import { Timetable } from '../timetable/timetable.ts'

const csv = (...lines: string[]) => lines.join('\n') + '\n'

export const STOPS = {
  A: { lat: -6.2, lon: 106.8 },
  B: { lat: -6.2, lon: 106.81 },
  C: { lat: -6.2, lon: 106.82 },
  D: { lat: -6.2, lon: 106.83 },
  E: { lat: -6.2, lon: 106.8302 },
  F: { lat: -6.2, lon: 106.84 },
}

const files = new Map([
  ['agency.txt', csv('agency_id,agency_name,agency_url,agency_timezone', 'T,Test,https://example.com,Asia/Jakarta')],
  [
    'stops.txt',
    csv(
      'stop_id,stop_name,stop_lat,stop_lon',
      ...Object.entries(STOPS).map(([id, s]) => `${id},"Halte ${id}",${s.lat},${s.lon}`),
    ),
  ],
  [
    'routes.txt',
    csv(
      'route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_color,route_text_color',
      '1,T,1,A - D,BRT,3,D62126,FFFFFF',
      '2,T,2,E - F,BRT,3,,',
      'X,T,X,A - D Express,Royaltrans,3,000000,FFFFFF',
      'Y,T,Y,A - D Express 2,Royaltrans,3,000000,FFFFFF',
    ),
  ],
  [
    'calendar.txt',
    csv(
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
      'ALL,1,1,1,1,1,1,1,20260101,20271231',
      'WD,1,1,1,1,1,0,0,20260101,20271231',
    ),
  ],
  ['trips.txt', csv('route_id,service_id,trip_id,trip_headsign', '1,ALL,t1,D', '2,ALL,t2,F', 'X,WD,tx,D', 'Y,WD,ty,D')],
  [
    'stop_times.txt',
    csv(
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
      't1,05:00:00,05:00:00,A,1',
      't1,05:05:00,05:05:00,B,2',
      't1,05:10:00,05:10:00,C,3',
      't1,05:15:00,05:15:00,D,4',
      't2,05:00:00,05:00:00,E,1',
      't2,05:04:00,05:04:00,F,2',
      'tx,05:00:00,05:00:00,A,1',
      'tx,05:08:00,05:08:00,D,2',
      'ty,05:00:00,05:00:00,A,1',
      'ty,05:10:00,05:10:00,D,2',
    ),
  ],
  [
    'frequencies.txt',
    csv(
      'trip_id,start_time,end_time,headway_secs',
      't1,05:00:00,22:00:00,600',
      't2,05:00:00,22:00:00,600',
      'tx,05:00:00,22:00:00,1800',
      'ty,05:00:00,22:00:00,1800',
    ),
  ],
  [
    'fare_attributes.txt',
    csv(
      'fare_id,price,currency_type,payment_method,transfers,transfer_duration',
      'FP,3500,IDR,0,,10800',
      'PP,20000,IDR,0,,10800',
    ),
  ],
  ['fare_rules.txt', csv('fare_id,route_id', 'FP,1', 'FP,2', 'PP,X', 'PP,Y')],
])

export function testTimetable(): Timetable {
  // The router's TransJakarta fare rules key off the "TJ" feed ID.
  const { timetable, warnings } = buildTimetable([{ id: 'TJ', name: 'Test', files }], new Date('2026-10-01'))
  if (warnings.length > 0) throw new Error(warnings.join('\n'))
  return new Timetable(timetable)
}
