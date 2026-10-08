import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { testWalkFile } from '../testing/walk.ts'
import { decodeWalk, encodeWalk } from './format.ts'
import { WALK_SPEED } from './estimate.ts'
import { WalkNetwork } from './network.ts'
import { walkSteps } from './steps.ts'

//            Jalan Utama
//   (-6.200, 106.800) ───── (106.803) ───── (106.806) ── Jalan Kompleks (private) north to -6.197
//                               │ Gang Satu
//                           (-6.203, 106.803) ───── (106.806)  Jalan Belakang
//
// A road crossed by a footbridge, further south: north side, stairs, bridge, stairs, south side.
const file = testWalkFile([
  { name: 'Jalan Utama', points: [[-6.2, 106.8], [-6.2, 106.803], [-6.2, 106.806]] },
  { name: 'Gang Satu', kind: 'alley', points: [[-6.2, 106.803], [-6.203, 106.803]] },
  { name: 'Jalan Belakang', points: [[-6.203, 106.803], [-6.203, 106.806]] },
  { name: 'Jalan Kompleks', penalty: 16, points: [[-6.2, 106.806], [-6.197, 106.806]] },
  { name: 'Jalan Raya', points: [[-6.21, 106.8], [-6.21, 106.801]] },
  { kind: 'steps', points: [[-6.21, 106.801], [-6.2101, 106.8011]] },
  { kind: 'footway', points: [[-6.2101, 106.8011], [-6.21012, 106.8011]] },
  { kind: 'footbridge', points: [[-6.21012, 106.8011], [-6.2105, 106.8011]] },
  { kind: 'steps', points: [[-6.2105, 106.8011], [-6.2106, 106.801]] },
  { name: 'Jalan Raya', points: [[-6.2106, 106.801], [-6.2106, 106.8]] },
])
const net = new WalkNetwork(decodeWalk(encodeWalk(file)))
const m = (a: [number, number], b: [number, number]) => net.meters(a[0], a[1], b[0], b[1])
const near = (actual: number, expected: number, slack = 1) => assert.ok(Math.abs(actual - expected) <= slack, `${actual} vs ${expected}`)

describe('walking network', () => {
  test('snaps a point onto the nearest street, with the step onto it', () => {
    const snap = net.snap(-6.2003, 106.8015, 100)!
    assert.equal(net.nameOf(net.edgeChain[snap.edge]), 'Jalan Utama')
    near(snap.lat, -6.2, 1e-6)
    near(snap.lon, 106.8015, 1e-6)
    near(snap.offsetM, m([-6.2003, 106.8015], [-6.2, 106.8015]))
    assert.equal(net.snap(-6.25, 106.9, 100), null)
  })

  test('walks along the streets, not across the block', () => {
    const from = net.snap(-6.2001, 106.8005, 100)!
    const to = net.snap(-6.2031, 106.8055, 100)!
    const reach = net.search(from, 5000, 0)
    const walk = reach.costTo(to)!
    const expected =
      m([-6.2001, 106.8005], [-6.2, 106.8005]) +
      m([-6.2, 106.8005], [-6.2, 106.803]) +
      m([-6.2, 106.803], [-6.203, 106.803]) +
      m([-6.203, 106.803], [-6.203, 106.8055]) +
      m([-6.203, 106.8055], [-6.2031, 106.8055])
    near(walk.meters, expected)
    near(walk.sec, expected / WALK_SPEED)
    assert.ok(walk.meters > m([-6.2001, 106.8005], [-6.2031, 106.8055]) * 1.2)

    const path = reach.pathTo(to)!
    const points = [path[0].from, ...path.map((p) => p.to)]
    assert.deepEqual(points[0], [106.8005, -6.2001])
    assert.deepEqual(points.at(-1), [106.8055, -6.2031])
    // Through both corners of the block.
    for (const corner of [[106.803, -6.2], [106.803, -6.203]]) {
      assert.ok(points.some((p) => near2(p, corner)), `misses ${corner}`)
    }
    near(
      path.reduce((sum, p) => sum + p.meters, 0),
      expected,
    )

    assert.deepEqual(
      walkSteps(net, path).map((s) => [s.maneuver, s.name, s.way, s.distanceM]),
      [
        ['depart', 'Jalan Utama', 'road', Math.round(expected - m([-6.2, 106.803], [-6.203, 106.803]) - m([-6.203, 106.803], [-6.203, 106.8055]) - m([-6.203, 106.8055], [-6.2031, 106.8055]))],
        ['right', 'Gang Satu', 'alley', Math.round(m([-6.2, 106.803], [-6.203, 106.803]))],
        ['left', 'Jalan Belakang', 'road', Math.round(m([-6.203, 106.803], [-6.203, 106.8055]) + m([-6.203, 106.8055], [-6.2031, 106.8055]))],
      ],
    )
    assert.equal(walkSteps(net, path)[0].bearing, 90)
  })

  test('weighs private roads and stairs, but reports their real meters', () => {
    const from = net.snap(-6.2, 106.805, 100)!
    const into = net.snap(-6.198, 106.806, 100)!
    const walk = net.search(from, 5000, 0).costTo(into)!
    const street = m([-6.2, 106.805], [-6.2, 106.806])
    const lane = m([-6.2, 106.806], [-6.198, 106.806])
    near(walk.meters, street + lane)
    near(walk.cost, street + lane * 1.6)
  })

  test('reaches nothing past its limit', () => {
    const from = net.snap(-6.2, 106.8, 100)!
    const reach = net.search(from, 100, 0)
    assert.equal(reach.costTo(net.snap(-6.203, 106.805, 100)!), null)
    assert.ok(reach.costTo(net.snap(-6.2, 106.8005, 100)!))
  })

  test('walks along one street when both ends are on it', () => {
    const from = net.snap(-6.2001, 106.8005, 100)!
    const to = net.snap(-6.2001, 106.8015, 100)!
    const reach = net.search(from, 5000, 0)
    near(reach.costTo(to)!.meters, m([-6.2, 106.8005], [-6.2, 106.8015]) + 2 * m([-6.2001, 106.8005], [-6.2, 106.8005]))
    assert.equal(reach.pathTo(to)!.length, 3)
  })

  test('gives a footbridge and its stairs one step', () => {
    const from = net.snap(-6.21, 106.8002, 100)!
    const to = net.snap(-6.2106, 106.8002, 100)!
    const steps = walkSteps(net, net.search(from, 5000, 0).pathTo(to)!)
    assert.deepEqual(
      steps.map((s) => [s.way, s.name]),
      [
        ['road', 'Jalan Raya'],
        ['footbridge', ''],
        ['road', 'Jalan Raya'],
      ],
    )
  })

  test('rejects a search slot reused while a walk is still read from it', () => {
    const from = net.snap(-6.2, 106.8, 100)!
    const first = net.search(from, 5000, 1)
    net.search(from, 5000, 1)
    assert.throws(() => first.costTo(from), /reused/)
  })
})

const near2 = (p: [number, number], q: number[]) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6
