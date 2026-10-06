export type Endpoint = { name: string; lat: number; lon: number }

export const PREFERENCES = [
  { id: 'tercepat', label: 'Tercepat', hint: 'Sampai paling cepat' },
  { id: 'termurah', label: 'Termurah', hint: 'Ongkos paling hemat' },
  { id: 'termudah', label: 'Termudah', hint: 'Transit dan jalan kaki paling sedikit' },
] as const

export type Preference = (typeof PREFERENCES)[number]['id']

/** Days the departure picker offers, counted from today in WIB. */
export const DEPARTURE_DAYS = [
  { day: 0, label: 'Hari ini' },
  { day: 1, label: 'Besok' },
] as const

/** A departure the user picked, in WIB; null where one is expected means "now". */
export type PickedTime = { day: (typeof DEPARTURE_DAYS)[number]['day']; clock: string }

export { inServiceArea } from '../../shared/region.ts'
