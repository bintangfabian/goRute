// Prices trips in rupiah from GTFS Fares v1 data plus the operator rules
// GTFS cannot express.

import type { FareProduct } from './timetable/format.ts'

export type FareRide = {
  /** "feedId:route_id" */
  routeId: string
  /** Undefined when the route has no fare data. */
  product: FareProduct | undefined
  boardMs: number
}

export type Quote = {
  total: number
  /** Paid when boarding each ride; null when unknown. */
  charges: (number | null)[]
  /** Per ride, whether a ticket bought for an earlier ride still covers it (so it costs nothing). */
  covered: boolean[]
  /** False when some ride has no fare data, so total is a lower bound. */
  complete: boolean
}

/**
 * Prices rides in order. A ticket bought for a product covers later rides
 * on the same product while its transfer allowance lasts, which is how one
 * TransJakarta fare covers transfers within three hours.
 */
export function quoteFares(rides: FareRide[]): Quote {
  const quote: Quote = { total: 0, charges: [], covered: [], complete: true }
  const tickets = new Map<string, { boughtMs: number; transfersLeft: number }>()

  for (const ride of rides) {
    const p = ride.product
    if (!p) {
      quote.complete = false
      quote.charges.push(null)
      quote.covered.push(false)
      continue
    }
    const ticket = tickets.get(p.id)
    if (ticket && covers(p, ticket, ride.boardMs)) {
      if (ticket.transfersLeft > 0) ticket.transfersLeft--
      quote.charges.push(0)
      // A free route (Mikrotrans) is free again, not paid for by the earlier ride.
      quote.covered.push(p.price > 0)
      continue
    }
    const price = priceAt(ride.routeId, p, ride.boardMs)
    tickets.set(p.id, { boughtMs: ride.boardMs, transfersLeft: p.transfers })
    quote.charges.push(price)
    quote.covered.push(false)
    quote.total += price
  }
  return quote
}

function covers(p: FareProduct, ticket: { boughtMs: number; transfersLeft: number }, boardMs: number) {
  if (ticket.transfersLeft === 0) return false
  return p.transferDurationSec === 0 || boardMs - ticket.boughtMs <= p.transferDurationSec * 1000
}

/**
 * Time-of-day prices that GTFS Fares v1 cannot express: TransJakarta's
 * regular Rp3.500 fare is Rp2.000 for boardings between 05:00 and 07:00 WIB.
 */
function priceAt(routeId: string, p: FareProduct, boardMs: number) {
  if (routeId.startsWith('TJ:') && p.price === 3500) {
    const hour = new Date(boardMs + 7 * 3600_000).getUTCHours()
    if (hour >= 5 && hour < 7) return 2000
  }
  return p.price
}
