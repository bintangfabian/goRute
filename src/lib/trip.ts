export type Endpoint = { name: string; lat: number; lon: number }

export const PREFERENCES = [
  { id: 'tercepat', label: 'Tercepat', hint: 'Sampai paling cepat' },
  { id: 'termurah', label: 'Termurah', hint: 'Ongkos paling hemat' },
  { id: 'termudah', label: 'Termudah', hint: 'Transit dan jalan kaki paling sedikit' },
] as const

export type Preference = (typeof PREFERENCES)[number]['id']

export { inServiceArea } from '../../shared/region.ts'
