// Turn-by-turn directions for a walk: the pieces of a path grouped by the
// street they are on, with the turn into each street.

import type { WalkStep } from '../../shared/api.ts'
import type { LonLat } from '../geo.ts'
import type { Stretch, WalkNetwork } from './network.ts'

/**
 * Stretches shorter than this fold into their neighbours. OSM often names a
 * few meters of a street differently ("Jalan Insinyur Haji Juanda" then
 * "Jalan Ir. H. Juanda"), and a step for each would be noise.
 */
const MIN_STEP_M = 25
/** Crossings, footbridges, stairs and underpasses stay their own step however short: they are what a walker looks out for. */
const LANDMARKS = new Set(['crossing', 'footbridge', 'bridge', 'steps', 'underpass'])
/** What stairs lead up or down to, and belong to as one step. */
const REACHED_BY_STAIRS = new Set(['footbridge', 'underpass', 'bridge'])
/** On ways without a name, a turn this sharp where one way meets the next is a step of its own. */
const UNNAMED_TURN_DEG = 60
/** The heading of a step is taken over this distance, so a jagged first meter does not decide the turn. */
const HEADING_M = 15
/** A straight walk onto or off the paths this long (into a campus, across a field) is a step of its own. */
const OWN_STEP_M = 30

/** `offPath` marks the straight walk onto or off the paths; `turned`, a run begun at a turn between unnamed ways. */
type Run = { name: string; way: WalkStep['way']; meters: number; pieces: Stretch[]; offPath?: boolean; turned?: boolean }

export function walkSteps(net: WalkNetwork, pieces: Stretch[]): WalkStep[] {
  // Group pieces by street: a name when the way has one, otherwise the kind of
  // way. Short steps onto and off the paths join the street next to them.
  const runs: Run[] = []
  let offPath: Stretch[] = []
  const flush = () => {
    const meters = offPath.reduce((m, p) => m + p.meters, 0)
    if (offPath.length === 0 || (meters < OWN_STEP_M && runs.length > 0)) {
      for (const p of offPath) add(runs.at(-1)!, p)
    } else if (meters >= OWN_STEP_M) {
      const run: Run = { name: '', way: 'road', meters: 0, pieces: [], offPath: true }
      for (const p of offPath) add(run, p)
      runs.push(run)
    } else return // short, before any street: it joins the first one
    offPath = []
  }
  for (const piece of pieces) {
    if (piece.chain < 0) {
      offPath.push(piece)
      continue
    }
    const lead = runs.length === 0 ? offPath.reduce((m, p) => m + p.meters, 0) < OWN_STEP_M : false
    if (!lead) flush()
    const name = net.nameOf(piece.chain)
    const way = net.kindOf(piece.chain)
    const last = runs.at(-1)
    // Unnamed alleys and sidewalks have no name to tell the turns by: where one way meets
    // the next at a sharp angle, the walk turns.
    const lastPiece = last?.pieces.findLast((p) => p.chain >= 0)
    const turned =
      !name && lastPiece !== undefined && lastPiece.chain !== piece.chain && Math.abs(angle(bearing(lastPiece.from, lastPiece.to), bearing(piece.from, piece.to))) >= UNNAMED_TURN_DEG
    if (last && !turned && sameStreet(last, name, way)) {
      add(last, piece)
      continue
    }
    const run: Run = { name, way, meters: 0, pieces: [], turned }
    for (const p of lead ? [...offPath, piece] : [piece]) add(run, p)
    if (lead) offPath = []
    runs.push(run)
  }
  // No path piece at all: a straight walk between two points next to each other.
  if (runs.length === 0) {
    if (offPath.length === 0) return []
    const run: Run = { name: '', way: 'road', meters: 0, pieces: [] }
    for (const p of offPath) add(run, p)
    runs.push(run)
    offPath = []
  }
  flush()

  // Fold short runs into a neighbour, then join neighbours that became the same street.
  // A short stretch between two crossings stays (crossing twice is two steps), unless it
  // only joins the stairs to the footbridge they lead up to.
  const foldable = (r: Run | undefined) => r !== undefined && !LANDMARKS.has(r.way) && !r.offPath
  const oneStructure = (a: Run | undefined, b: Run | undefined) =>
    a !== undefined && b !== undefined && [a.way, b.way].every((w) => w === 'steps' || REACHED_BY_STAIRS.has(w))
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]
    if (run.meters >= MIN_STEP_M || LANDMARKS.has(run.way) || run.offPath || runs.length === 1) continue
    const [before, after] = [runs[i - 1], runs[i + 1]]
    const into = foldable(before) ? before : foldable(after) ? after : oneStructure(before, after) ? before : null
    if (!into) continue
    if (into === runs[i - 1]) into.pieces.push(...run.pieces)
    else into.pieces.unshift(...run.pieces)
    into.meters += run.meters
    runs.splice(i--, 1)
  }
  // The stairs up to a footbridge or down to an underpass are part of crossing it.
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].way !== 'steps') continue
    const into = [runs[i - 1], runs[i + 1]].find((r) => r && REACHED_BY_STAIRS.has(r.way))
    if (!into) continue
    if (into === runs[i - 1]) into.pieces.push(...runs[i].pieces)
    else into.pieces.unshift(...runs[i].pieces)
    into.meters += runs[i].meters
    runs.splice(i--, 1)
  }
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].way !== runs[i - 1].way || !REACHED_BY_STAIRS.has(runs[i].way)) continue
    runs[i - 1].pieces.push(...runs[i].pieces)
    runs[i - 1].meters += runs[i].meters
    runs.splice(i--, 1)
  }

  for (let i = 1; i < runs.length; i++) {
    if (runs[i].offPath || runs[i].turned || !sameStreet(runs[i - 1], runs[i].name, runs[i].way)) continue
    runs[i - 1].pieces.push(...runs[i].pieces)
    runs[i - 1].meters += runs[i].meters
    runs.splice(i--, 1)
  }

  return runs.map((run, i) => {
    const bearing = heading(run.pieces, 'start')
    return {
      maneuver: i === 0 ? 'depart' : turn(heading(runs[i - 1].pieces, 'end'), bearing),
      name: run.name,
      way: run.way,
      distanceM: Math.round(run.meters),
      bearing: Math.round(bearing),
    }
  })
}

function add(run: Run, piece: Stretch) {
  run.pieces.push(piece)
  run.meters += piece.meters
}

function sameStreet(run: Run, name: string, way: WalkStep['way']): boolean {
  if (run.offPath) return false
  if (LANDMARKS.has(run.way) || LANDMARKS.has(way)) return run.way === way && run.name === name
  return name ? run.name === name : !run.name && run.way === way
}

/** Compass heading over the first or last HEADING_M of a run, along the path rather than the step onto it. */
function heading(pieces: Stretch[], at: 'start' | 'end'): number {
  const along = pieces.filter((p) => p.chain >= 0)
  const use = along.length > 0 ? along : pieces
  const list = at === 'start' ? use : [...use].reverse()
  const origin = at === 'start' ? list[0].from : list[0].to
  let far: LonLat = at === 'start' ? list[0].to : list[0].from
  let walked = 0
  for (const p of list) {
    far = at === 'start' ? p.to : p.from
    walked += p.meters
    if (walked >= HEADING_M) break
  }
  return at === 'start' ? bearing(origin, far) : bearing(far, origin)
}

function bearing(a: LonLat, b: LonLat): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  const deg = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI
  return (deg + 360) % 360
}

/** The change of heading, -180 to 180 degrees; positive turns right. */
const angle = (from: number, to: number) => ((to - from + 540) % 360) - 180

/** The turn from one heading to the next. */
function turn(from: number, to: number): WalkStep['maneuver'] {
  const turned = angle(from, to)
  const size = Math.abs(turned)
  const side = turned > 0 ? 'right' : 'left'
  if (size <= 20) return 'straight'
  if (size <= 50) return `slight-${side}`
  if (size <= 130) return side
  if (size <= 165) return `sharp-${side}`
  return 'uturn'
}
