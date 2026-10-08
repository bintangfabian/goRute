// Directions in Indonesian, in the words navigation apps use: the walking
// steps of a leg, and what to ride. Shared so the server tests the wording
// the web app shows.

import type { Leg, WalkStep, WalkWay } from './api.ts'

const COMPASS = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut']

/** "barat daya" for a heading of 225°. */
export function compass(bearing: number): string {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]
}

/** What an unnamed way is called. */
const WAY_WORDS: Record<WalkWay, string> = {
  road: 'jalan',
  footway: 'trotoar',
  crossing: 'penyeberangan',
  footbridge: 'jembatan penyeberangan',
  underpass: 'terowongan penyeberangan',
  steps: 'tangga',
  path: 'jalan setapak',
  alley: 'gang',
  pedestrian: 'area pejalan kaki',
  platform: 'peron',
  bridge: 'jembatan',
}

const TURNS: Record<Exclude<WalkStep['maneuver'], 'depart'>, string> = {
  straight: 'Lanjutkan',
  'slight-left': 'Belok sedikit ke kiri',
  left: 'Belok kiri',
  'sharp-left': 'Belok tajam ke kiri',
  'slight-right': 'Belok sedikit ke kanan',
  right: 'Belok kanan',
  'sharp-right': 'Belok tajam ke kanan',
  uturn: 'Putar balik',
}

/** One walking step as a sentence: "Belok kiri ke Jalan Kenari", "Naik jembatan penyeberangan (JPO)". */
export function stepText(step: WalkStep): string {
  switch (step.way) {
    case 'crossing':
      return 'Menyeberang jalan'
    case 'footbridge':
      return 'Naik jembatan penyeberangan (JPO)'
    case 'underpass':
      return 'Lewat terowongan penyeberangan'
    case 'steps':
      return 'Lewat tangga'
    case 'bridge':
      return step.name ? `Lewat ${step.name}` : 'Lewat jembatan'
  }
  // A street by its name; an unnamed alley or sidewalk by what it is; an unnamed road not at all.
  const along = step.name ? ` di ${step.name}` : step.way === 'road' ? '' : ` lewat ${WAY_WORDS[step.way]}`
  if (step.maneuver === 'depart') return `Jalan ke arah ${compass(step.bearing)}${along}`
  const into = step.name ? ` ke ${step.name}` : step.way === 'road' ? '' : ` ke ${WAY_WORDS[step.way]}`
  if (step.maneuver === 'uturn') return `Putar balik${along}`
  return `${TURNS[step.maneuver]}${into}`
}

/** TransJakarta's own names for its services, shorter than the GTFS categories. */
const SERVICES: Record<string, string> = {
  BRT: 'TransJakarta BRT',
  'Angkutan Umum Integrasi': 'TransJakarta Non-BRT',
  Mikrotrans: 'Mikrotrans',
  Transjabodetabek: 'Transjabodetabek',
  Royaltrans: 'Royaltrans',
  Rusun: 'Bus Rusun',
  'Bus Wisata': 'Bus Wisata',
}

/** Agencies as they write their own names; the GTFS feed says "Transjakarta". */
const AGENCY_NAMES: Record<string, string> = { Transjakarta: 'TransJakarta' }

export const agencyName = (agency: string) => AGENCY_NAMES[agency] ?? agency

/** "TransJakarta BRT" for a corridor bus, "Mikrotrans" for a minibus. */
export function serviceName(leg: Leg): string {
  const category = leg.route?.category ?? ''
  return SERVICES[category] ?? (category || agencyName(leg.route?.agency ?? '') || 'Bus')
}

/** What the rider pays when boarding, in words. */
export function fareText(leg: Leg): string {
  if (leg.fareIdr === null) return 'Tarif belum diketahui'
  if (leg.fareIdr > 0) return `Rp${leg.fareIdr.toLocaleString('id-ID')}`
  // Free either because the route is (Mikrotrans) or because an earlier ticket still covers it.
  return leg.fareCovered ? 'Rp0, masih tiket sebelumnya' : 'Gratis'
}
