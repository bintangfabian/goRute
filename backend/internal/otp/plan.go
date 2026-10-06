package otp

import (
	"context"
	"fmt"
	"time"
)

type Location struct {
	Label    string
	Lat, Lon float64
}

type PlanRequest struct {
	From, To   Location
	Departure  time.Time
	NumResults int
	// Easy biases the search toward fewer transfers and less walking.
	Easy bool
}

type PlanResult struct {
	Itineraries []Itinerary
	// RoutingErrors holds OTP error codes such as NO_TRANSIT_CONNECTION.
	RoutingErrors []string
}

type Itinerary struct {
	Start, End        time.Time
	Duration          time.Duration
	WalkDistance      float64 // meters
	NumberOfTransfers int
	Legs              []Leg
}

type Leg struct {
	Mode       string // WALK, BUS, RAIL, SUBWAY, TRAM, ...
	Start, End time.Time
	Duration   time.Duration
	Distance   float64 // meters
	From, To   Place
	Route      *Route // nil for street legs
	// Geometry is the leg's path as [lon, lat] pairs.
	Geometry [][2]float64
}

type Place struct {
	Name     string
	Lat, Lon float64
}

type Route struct {
	ID        string // feedId:routeId, e.g. "TJ:1"
	ShortName string
	LongName  string
	Desc      string
	Color     string // hex without '#', may be empty
	TextColor string
	Agency    string
}

const planQuery = `query Plan(
  $from: PlanLabeledLocationInput!
  $to: PlanLabeledLocationInput!
  $departure: OffsetDateTime!
  $first: Int!
  $preferences: PlanPreferencesInput
) {
  planConnection(
    origin: $from
    destination: $to
    dateTime: { earliestDeparture: $departure }
    first: $first
    preferences: $preferences
  ) {
    routingErrors { code }
    edges {
      node {
        start end duration walkDistance numberOfTransfers
        legs {
          mode duration distance
          start { scheduledTime }
          end { scheduledTime }
          from { name lat lon }
          to { name lat lon }
          route { gtfsId shortName longName desc color textColor agency { name } }
          legGeometry { points }
        }
      }
    }
  }
}`

// Plan searches itineraries between two locations.
func (c *Client) Plan(ctx context.Context, req PlanRequest) (PlanResult, error) {
	vars := map[string]any{
		"from":      labeledLocation(req.From),
		"to":        labeledLocation(req.To),
		"departure": req.Departure.Format(time.RFC3339),
		"first":     req.NumResults,
	}
	if req.Easy {
		vars["preferences"] = map[string]any{
			"transit": map[string]any{"transfer": map[string]any{"cost": 900}},
			"street":  map[string]any{"walk": map[string]any{"reluctance": 4.0}},
		}
	}

	var data struct {
		PlanConnection struct {
			RoutingErrors []struct {
				Code string `json:"code"`
			} `json:"routingErrors"`
			Edges []struct {
				Node rawItinerary `json:"node"`
			} `json:"edges"`
		} `json:"planConnection"`
	}
	if err := c.query(ctx, planQuery, vars, &data); err != nil {
		return PlanResult{}, err
	}

	var res PlanResult
	for _, e := range data.PlanConnection.RoutingErrors {
		res.RoutingErrors = append(res.RoutingErrors, e.Code)
	}
	for _, e := range data.PlanConnection.Edges {
		it, err := e.Node.convert()
		if err != nil {
			return PlanResult{}, err
		}
		res.Itineraries = append(res.Itineraries, it)
	}
	return res, nil
}

func labeledLocation(l Location) map[string]any {
	return map[string]any{
		"label": l.Label,
		"location": map[string]any{
			"coordinate": map[string]any{"latitude": l.Lat, "longitude": l.Lon},
		},
	}
}

type rawItinerary struct {
	Start             time.Time `json:"start"`
	End               time.Time `json:"end"`
	Duration          float64   `json:"duration"`
	WalkDistance      float64   `json:"walkDistance"`
	NumberOfTransfers int       `json:"numberOfTransfers"`
	Legs              []rawLeg  `json:"legs"`
}

type rawLegTime struct {
	ScheduledTime time.Time `json:"scheduledTime"`
}

type rawLeg struct {
	Mode     string     `json:"mode"`
	Duration float64    `json:"duration"`
	Distance float64    `json:"distance"`
	Start    rawLegTime `json:"start"`
	End      rawLegTime `json:"end"`
	From     Place      `json:"from"`
	To       Place      `json:"to"`
	Route    *struct {
		GtfsID    string `json:"gtfsId"`
		ShortName string `json:"shortName"`
		LongName  string `json:"longName"`
		Desc      string `json:"desc"`
		Color     string `json:"color"`
		TextColor string `json:"textColor"`
		Agency    struct {
			Name string `json:"name"`
		} `json:"agency"`
	} `json:"route"`
	LegGeometry struct {
		Points string `json:"points"`
	} `json:"legGeometry"`
}

func (r rawItinerary) convert() (Itinerary, error) {
	it := Itinerary{
		Start:             r.Start,
		End:               r.End,
		Duration:          seconds(r.Duration),
		WalkDistance:      r.WalkDistance,
		NumberOfTransfers: r.NumberOfTransfers,
		Legs:              make([]Leg, 0, len(r.Legs)),
	}
	for _, l := range r.Legs {
		geom, err := decodePolyline(l.LegGeometry.Points)
		if err != nil {
			return Itinerary{}, fmt.Errorf("otp: leg geometry: %w", err)
		}
		leg := Leg{
			Mode:     l.Mode,
			Start:    l.Start.ScheduledTime,
			End:      l.End.ScheduledTime,
			Duration: seconds(l.Duration),
			Distance: l.Distance,
			From:     l.From,
			To:       l.To,
			Geometry: geom,
		}
		if l.Route != nil {
			leg.Route = &Route{
				ID:        l.Route.GtfsID,
				ShortName: l.Route.ShortName,
				LongName:  l.Route.LongName,
				Desc:      l.Route.Desc,
				Color:     l.Route.Color,
				TextColor: l.Route.TextColor,
				Agency:    l.Route.Agency.Name,
			}
		}
		it.Legs = append(it.Legs, leg)
	}
	return it, nil
}

func seconds(s float64) time.Duration {
	return time.Duration(s * float64(time.Second))
}
