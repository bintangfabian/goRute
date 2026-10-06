export type LonLat = [number, number]

const EARTH_RADIUS_M = 6_371_008.8
const RAD = Math.PI / 180

/** Great-circle distance in meters. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD
  const dLon = (lon2 - lon1) * RAD
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

export function lineLengthM(line: LonLat[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) {
    total += distanceM(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0])
  }
  return total
}

// Google encoded polyline, precision 5 (~1 m). Points are [lon, lat]; the
// encoding itself stores lat before lon.

export function encodePolyline(points: LonLat[]): string {
  let out = ''
  let prevLat = 0
  let prevLon = 0
  for (const [lon, lat] of points) {
    const iLat = Math.round(lat * 1e5)
    const iLon = Math.round(lon * 1e5)
    out += encodeValue(iLat - prevLat) + encodeValue(iLon - prevLon)
    prevLat = iLat
    prevLon = iLon
  }
  return out
}

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1
  let out = ''
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
    n >>= 5
  }
  return out + String.fromCharCode(n + 63)
}

export function decodePolyline(s: string): LonLat[] {
  const points: LonLat[] = []
  let i = 0
  let lat = 0
  let lon = 0
  const next = () => {
    let result = 0
    let shift = 0
    let b: number
    do {
      b = s.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < s.length) {
    lat += next()
    lon += next()
    points.push([lon / 1e5, lat / 1e5])
  }
  return points
}
