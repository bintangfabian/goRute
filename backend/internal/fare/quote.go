package fare

import (
	"strings"
	"time"
)

var wib = time.FixedZone("WIB", 7*60*60)

// Ride is one transit leg of a trip.
type Ride struct {
	RouteID string // "feedId:routeId"
	Board   time.Time
}

// Charge is what a rider pays when boarding one ride.
type Charge struct {
	Amount int
	// Known is false when the route has no fare data.
	Known bool
}

type Quote struct {
	Total   int
	Charges []Charge // one per ride
	// Complete is false when any ride's fare is unknown, so Total is a
	// lower bound.
	Complete bool
}

type ticket struct {
	bought        time.Time
	transfersLeft int // -1 means unlimited
}

// Quote prices rides in order. A ticket bought for a product covers later
// rides on the same product while its transfer allowance lasts, which is
// how a Transjakarta fare covers transfers within three hours.
func (t *Table) Quote(rides []Ride) Quote {
	q := Quote{Charges: make([]Charge, len(rides)), Complete: true}
	active := map[string]*ticket{}

	for i, r := range rides {
		p, ok := t.routes[r.RouteID]
		if !ok {
			q.Complete = false
			continue
		}
		if tk := active[p.ID]; tk != nil && p.covers(tk, r.Board) {
			if tk.transfersLeft > 0 {
				tk.transfersLeft--
			}
			q.Charges[i] = Charge{Amount: 0, Known: true}
			continue
		}
		price := priceAt(r.RouteID, p, r.Board)
		active[p.ID] = &ticket{bought: r.Board, transfersLeft: p.Transfers}
		q.Charges[i] = Charge{Amount: price, Known: true}
		q.Total += price
	}
	return q
}

func (p Product) covers(tk *ticket, board time.Time) bool {
	if tk.transfersLeft == 0 {
		return false
	}
	return p.TransferDuration == 0 || board.Sub(tk.bought) <= p.TransferDuration
}

// priceAt applies time-of-day prices that GTFS Fares v1 cannot express:
// Transjakarta's regular Rp3.500 fare is Rp2.000 for boardings between
// 05:00 and 07:00 WIB.
func priceAt(routeID string, p Product, board time.Time) int {
	if strings.HasPrefix(routeID, "TJ:") && p.Price == 3500 {
		if h := board.In(wib).Hour(); h >= 5 && h < 7 {
			return 2000
		}
	}
	return p.Price
}
