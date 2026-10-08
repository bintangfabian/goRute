// Outlines of areas (cities, districts, villages, and named estates like BSD
// City) and which of them a point lies in, so a place can say where it is.

/** Edges are kept in rows this tall, so a lookup only tests the edges at its latitude. */
const ROW_DEG = 0.005
/** Outlines are found through a grid of cells this big. */
const CELL_DEG = 0.05

type Outline = {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
  /** Square degrees, to pick the smallest of overlapping outlines. */
  size: number
  /** Per row, the edges crossing it as lon1, lat1, lon2, lat2. */
  rows: number[][]
}

/** One kind of area (all villages, say): outlines added one by one, then looked up by point. */
export class Areas {
  private readonly outlines: Outline[] = []
  private readonly grid = new Map<string, number[]>()

  get size() {
    return this.outlines.length
  }

  /**
   * Adds an area made of closed rings of lon, lat pairs; holes are rings too
   * (a point is inside when it is inside an odd number of rings). Returns its index.
   */
  add(rings: number[][]): number {
    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity
    let size = 0
    for (const r of rings) {
      let twice = 0
      for (let i = 0; i + 3 < r.length; i += 2) {
        twice += r[i] * r[i + 3] - r[i + 2] * r[i + 1]
        minLon = Math.min(minLon, r[i])
        maxLon = Math.max(maxLon, r[i])
        minLat = Math.min(minLat, r[i + 1])
        maxLat = Math.max(maxLat, r[i + 1])
      }
      size = Math.max(size, Math.abs(twice) / 2)
    }
    const rows: number[][] = Array.from({ length: Math.floor((maxLat - minLat) / ROW_DEG) + 1 }, () => [])
    for (const r of rings) {
      for (let i = 0; i + 3 < r.length; i += 2) {
        const [lon1, lat1, lon2, lat2] = [r[i], r[i + 1], r[i + 2], r[i + 3]]
        const from = Math.floor((Math.min(lat1, lat2) - minLat) / ROW_DEG)
        const to = Math.floor((Math.max(lat1, lat2) - minLat) / ROW_DEG)
        for (let row = from; row <= to; row++) rows[row].push(lon1, lat1, lon2, lat2)
      }
    }
    const id = this.outlines.push({ minLat, maxLat, minLon, maxLon, size, rows }) - 1
    for (let y = Math.floor(minLat / CELL_DEG); y <= Math.floor(maxLat / CELL_DEG); y++) {
      for (let x = Math.floor(minLon / CELL_DEG); x <= Math.floor(maxLon / CELL_DEG); x++) {
        const key = `${y},${x}`
        const list = this.grid.get(key)
        if (list) list.push(id)
        else this.grid.set(key, [id])
      }
    }
    return id
  }

  /** The smallest area the point lies in, -1 for none. */
  at(lat: number, lon: number): number {
    let best = -1
    for (const id of this.grid.get(`${Math.floor(lat / CELL_DEG)},${Math.floor(lon / CELL_DEG)}`) ?? []) {
      const o = this.outlines[id]
      if (lat < o.minLat || lat > o.maxLat || lon < o.minLon || lon > o.maxLon) continue
      if (best >= 0 && this.outlines[best].size <= o.size) continue
      if (inside(o, lat, lon)) best = id
    }
    return best
  }
}

/** Even-odd rule over the edges in the point's row. */
function inside(o: Outline, lat: number, lon: number): boolean {
  const edges = o.rows[Math.floor((lat - o.minLat) / ROW_DEG)] ?? []
  let odd = false
  for (let i = 0; i < edges.length; i += 4) {
    const [lon1, lat1, lon2, lat2] = [edges[i], edges[i + 1], edges[i + 2], edges[i + 3]]
    if (lat1 > lat !== lat2 > lat && lon < ((lon2 - lon1) * (lat - lat1)) / (lat2 - lat1) + lon1) odd = !odd
  }
  return odd
}

/**
 * Joins the ways of an outline (lists of node indices, in any order and
 * direction) into closed rings; null when they do not close, as when part
 * of the outline is missing from the extract.
 */
export function joinRings(ways: number[][]): number[][] | null {
  const open = ways.filter((w) => w.length >= 2).map((w) => [...w])
  const rings: number[][] = []
  while (open.length > 0) {
    let ring = open.pop()!
    while (ring[0] !== ring[ring.length - 1]) {
      const end = ring[ring.length - 1]
      const next = open.findIndex((w) => w[0] === end || w[w.length - 1] === end)
      if (next < 0) return null
      const [way] = open.splice(next, 1)
      ring = ring.concat((way[0] === end ? way : way.reverse()).slice(1))
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings.length > 0 ? rings : null
}
