// The service area: trips are planned and places searched only inside it.
export const JABODETABEK = { minLon: 106.2, minLat: -6.75, maxLon: 107.3, maxLat: -5.95 }

export function inServiceArea(lat: number, lon: number) {
  const b = JABODETABEK
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon
}
