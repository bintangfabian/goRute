export type Endpoint = { name: string; lat: number; lon: number }

export const PREFERENCES = [
  { id: 'tercepat', label: 'Tercepat', hint: 'Sampai paling cepat' },
  { id: 'termurah', label: 'Termurah', hint: 'Ongkos paling hemat' },
  { id: 'termudah', label: 'Termudah', hint: 'Transit dan jalan kaki paling sedikit' },
] as const

export type Preference = (typeof PREFERENCES)[number]['id']

/** Days the departure picker offers, counted from today in WIB. */
export const DEPARTURE_DAYS = [
  { offset: 0, label: 'Hari ini' },
  { offset: 1, label: 'Besok' },
] as const

/**
 * A departure the user picked: a WIB date (YYYYMMDD) and "HH:MM". The date rather than
 * "today"/"tomorrow", so a pick stays on its day when midnight passes with the app open.
 * Null where one is expected means "now".
 */
export type PickedTime = { ymd: number; clock: string }

export { inServiceArea } from '../../shared/region.ts'
