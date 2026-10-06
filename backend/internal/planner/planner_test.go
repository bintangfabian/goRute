package planner

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/bintangfabian/goRute/internal/fare"
	"github.com/bintangfabian/goRute/internal/otp"
)

var wib = time.FixedZone("WIB", 7*60*60)

func clock(hhmm string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04", "2026-10-05 "+hhmm, wib)
	if err != nil {
		panic(err)
	}
	return t
}

func walk(from, to string) otp.Leg {
	return otp.Leg{Mode: "WALK", Start: clock(from), End: clock(to)}
}

func bus(route, from, to string) otp.Leg {
	return otp.Leg{
		Mode:  "BUS",
		Start: clock(from),
		End:   clock(to),
		From:  otp.Place{Name: "A"},
		To:    otp.Place{Name: "B"},
		Route: &otp.Route{ID: route, ShortName: route, Color: "D62126"},
	}
}

func itinerary(walkM float64, transfers int, legs ...otp.Leg) otp.Itinerary {
	start, end := legs[0].Start, legs[len(legs)-1].End
	return otp.Itinerary{
		Start: start, End: end, Duration: end.Sub(start),
		WalkDistance: walkM, NumberOfTransfers: transfers, Legs: legs,
	}
}

type fakeOTP struct {
	byEasy map[bool]otp.PlanResult
	err    error
}

func (f fakeOTP) Plan(_ context.Context, req otp.PlanRequest) (otp.PlanResult, error) {
	return f.byEasy[req.Easy], f.err
}

func testFares() *fare.Table {
	t := fare.NewTable()
	regular := fare.Product{ID: "FP", Price: 3500, Transfers: -1, TransferDuration: 3 * time.Hour}
	t.Add("TJ:1", regular)
	t.Add("TJ:9", regular)
	t.Add("TJ:1K", fare.Product{ID: "PP", Price: 20000, Transfers: -1})
	return t
}

func TestPlan(t *testing.T) {
	// Fastest but pricey Royaltrans.
	royal := itinerary(300, 0, walk("08:00", "08:05"), bus("TJ:1K", "08:05", "08:30"), walk("08:30", "08:32"))
	// Slower with one transfer and more walking, cheapest.
	transfer := itinerary(900, 1, walk("08:00", "08:10"), bus("TJ:1", "08:10", "08:30"), bus("TJ:9", "08:35", "08:45"))
	// Same rides as transfer, departing later: a duplicate.
	transferLater := itinerary(900, 1, walk("08:10", "08:20"), bus("TJ:1", "08:20", "08:40"), bus("TJ:9", "08:45", "08:55"))
	// Direct BRT, little walking, arrives last.
	direct := itinerary(200, 0, walk("08:00", "08:03"), bus("TJ:1", "08:03", "08:50"))
	// An hour of walking: dropped.
	longWalk := itinerary(5000, 0, walk("08:00", "09:00"))

	p := New(fakeOTP{byEasy: map[bool]otp.PlanResult{
		false: {Itineraries: []otp.Itinerary{royal, transfer, transferLater, longWalk}},
		true:  {Itineraries: []otp.Itinerary{direct, transfer}},
	}}, testFares())

	plan, err := p.Plan(context.Background(), Request{Departure: clock("08:00")})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Itineraries) != 3 {
		t.Fatalf("got %d itineraries, want 3 (duplicate and long walk removed)", len(plan.Itineraries))
	}

	byID := map[string]Itinerary{}
	for _, it := range plan.Itineraries {
		byID[it.ID] = it
	}
	faresOf := func(ids []string) []int {
		var fares []int
		for _, id := range ids {
			fares = append(fares, byID[id].Fare.TotalIDR)
		}
		return fares
	}
	// Identify itineraries by fare: royal 20000, transfer 3500, direct 3500.
	if got := faresOf(plan.Ranking.Tercepat); !slices.Equal(got, []int{20000, 3500, 3500}) {
		t.Errorf("tercepat fares = %v, want royal first", got)
	}
	if got := plan.Ranking.Termurah[2]; byID[got].Fare.TotalIDR != 20000 {
		t.Errorf("termurah last = %v, want royal", byID[got].Fare)
	}
	if got := byID[plan.Ranking.Termudah[0]]; got.Transfers != 0 || got.WalkDistanceM != 200 {
		t.Errorf("termudah first = %+v, want direct BRT", got)
	}

	// Cheapest tie (3500) is broken by the earlier arrival: the transfer trip.
	tr := byID[plan.Ranking.Termurah[0]]
	if tr.Transfers != 1 {
		t.Fatalf("termurah first = %+v, want the transfer trip", tr)
	}
	first, second := tr.Legs[1].FareIDR, tr.Legs[2].FareIDR
	if first == nil || *first != 3500 || second == nil || *second != 0 {
		t.Errorf("transfer leg charges = %v, %v; want 3500 then 0", first, second)
	}
	if c := tr.Legs[0].FareIDR; c != nil {
		t.Errorf("walk leg fare = %d, want nil", *c)
	}
	if col := byID[plan.Ranking.Tercepat[0]].Legs[1].Route.Color; col != "#D62126" {
		t.Errorf("route color = %q, want #D62126", col)
	}
}

func TestPlanAllSearchesFail(t *testing.T) {
	p := New(fakeOTP{err: errors.New("connection refused")}, testFares())
	if _, err := p.Plan(context.Background(), Request{}); err == nil {
		t.Fatal("want error when OTP is down")
	}
}

func TestPlanNoRoutes(t *testing.T) {
	p := New(fakeOTP{}, testFares())
	plan, err := p.Plan(context.Background(), Request{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Itineraries == nil || len(plan.Itineraries) != 0 {
		t.Errorf("itineraries = %#v, want empty non-nil slice", plan.Itineraries)
	}
}
