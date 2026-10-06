// Package planner turns OTP itineraries into priced, ranked trip options.
package planner

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/bintangfabian/goRute/internal/fare"
	"github.com/bintangfabian/goRute/internal/otp"
)

// Walk-only itineraries longer than this are dropped: nobody asks a
// transit planner to be told to walk for an hour.
const maxWalkOnly = 20 * time.Minute

type Searcher interface {
	Plan(ctx context.Context, req otp.PlanRequest) (otp.PlanResult, error)
}

type Request struct {
	From, To  otp.Location
	Departure time.Time
}

type Planner struct {
	otp   Searcher
	fares *fare.Table
}

func New(otp Searcher, fares *fare.Table) *Planner {
	return &Planner{otp: otp, fares: fares}
}

// Plan runs a default and an "easy" OTP search concurrently and merges
// them. The easy search surfaces options with fewer transfers and less
// walking that the default search prunes as slower.
func (p *Planner) Plan(ctx context.Context, req Request) (Plan, error) {
	searches := []otp.PlanRequest{
		{From: req.From, To: req.To, Departure: req.Departure, NumResults: 5},
		{From: req.From, To: req.To, Departure: req.Departure, NumResults: 3, Easy: true},
	}
	results := make([]otp.PlanResult, len(searches))
	errs := make([]error, len(searches))

	var wg sync.WaitGroup
	for i, s := range searches {
		wg.Go(func() {
			results[i], errs[i] = p.otp.Plan(ctx, s)
		})
	}
	wg.Wait()

	// One failed search still leaves usable options.
	var found []otp.Itinerary
	failed := 0
	for i, r := range results {
		if errs[i] != nil {
			failed++
			continue
		}
		found = append(found, r.Itineraries...)
	}
	if failed == len(searches) {
		return Plan{}, fmt.Errorf("plan: %w", errors.Join(errs...))
	}

	plan := Plan{Itineraries: []Itinerary{}}
	for _, it := range dedupe(found) {
		if isWalkOnly(it) && it.Duration > maxWalkOnly {
			continue
		}
		id := fmt.Sprintf("r%d", len(plan.Itineraries)+1)
		plan.Itineraries = append(plan.Itineraries, p.convert(id, it))
	}
	plan.Ranking = rank(plan.Itineraries)
	return plan, nil
}

// dedupe keeps the earliest-arriving itinerary for each distinct sequence
// of transit rides. OTP returns the same rides at several departure times
// for frequency-based routes, which reads as noise in the UI.
func dedupe(its []otp.Itinerary) []otp.Itinerary {
	index := map[string]int{}
	var out []otp.Itinerary
	for _, it := range its {
		key := signature(it)
		if i, ok := index[key]; ok {
			if it.End.Before(out[i].End) {
				out[i] = it
			}
			continue
		}
		index[key] = len(out)
		out = append(out, it)
	}
	return out
}

func signature(it otp.Itinerary) string {
	var parts []string
	for _, l := range it.Legs {
		if l.Route != nil {
			parts = append(parts, l.Route.ID+"|"+l.From.Name+"|"+l.To.Name)
		}
	}
	if len(parts) == 0 {
		return "WALK"
	}
	return strings.Join(parts, ">")
}

func isWalkOnly(it otp.Itinerary) bool {
	for _, l := range it.Legs {
		if l.Mode != "WALK" {
			return false
		}
	}
	return true
}

func (p *Planner) convert(id string, it otp.Itinerary) Itinerary {
	var rides []fare.Ride
	for _, l := range it.Legs {
		if l.Route != nil {
			rides = append(rides, fare.Ride{RouteID: l.Route.ID, Board: l.Start})
		}
	}
	quote := p.fares.Quote(rides)

	out := Itinerary{
		ID:            id,
		Start:         it.Start,
		End:           it.End,
		DurationSec:   int(it.Duration.Seconds()),
		WalkDistanceM: int(it.WalkDistance),
		Transfers:     it.NumberOfTransfers,
		Fare:          Fare{TotalIDR: quote.Total, Complete: quote.Complete},
		Legs:          make([]Leg, 0, len(it.Legs)),
	}
	ride := 0
	for _, l := range it.Legs {
		leg := Leg{
			Mode:        l.Mode,
			Start:       l.Start,
			End:         l.End,
			DurationSec: int(l.Duration.Seconds()),
			DistanceM:   int(l.Distance),
			From:        Place{Name: l.From.Name, Lat: l.From.Lat, Lon: l.From.Lon},
			To:          Place{Name: l.To.Name, Lat: l.To.Lat, Lon: l.To.Lon},
			Geometry:    l.Geometry,
		}
		if l.Route != nil {
			leg.Route = &Route{
				ID:        l.Route.ID,
				ShortName: l.Route.ShortName,
				LongName:  l.Route.LongName,
				Category:  l.Route.Desc,
				Color:     hexColor(l.Route.Color),
				TextColor: hexColor(l.Route.TextColor),
				Agency:    l.Route.Agency,
			}
			if c := quote.Charges[ride]; c.Known {
				amount := c.Amount
				leg.FareIDR = &amount
			}
			ride++
		}
		out.Legs = append(out.Legs, leg)
	}
	return out
}

func hexColor(c string) string {
	if c == "" {
		return ""
	}
	return "#" + c
}
