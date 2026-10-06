export type Endpoint = { name: string; lat: number; lon: number }

export const PREFERENCES = [
  { id: 'tercepat', label: 'Tercepat', hint: 'Sampai paling cepat' },
  { id: 'termurah', label: 'Termurah', hint: 'Ongkos paling hemat' },
  { id: 'termudah', label: 'Termudah', hint: 'Transit dan jalan kaki paling sedikit' },
] as const

export type Preference = (typeof PREFERENCES)[number]['id']

// Mirrors backend/internal/region: the area OTP has data for.
const JABODETABEK = { minLon: 106.2, minLat: -6.75, maxLon: 107.3, maxLat: -5.95 }

export function inServiceArea(lat: number, lon: number) {
  const b = JABODETABEK
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon
}
