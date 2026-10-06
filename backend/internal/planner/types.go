package planner

import "time"

// The types below are the JSON shapes of /api/v1/plan; keep them in sync
// with api/openapi.yaml.

type Plan struct {
	Itineraries []Itinerary `json:"itineraries"`
	Ranking     Ranking     `json:"ranking"`
}

// Ranking lists itinerary IDs from best to worst for each preference.
type Ranking struct {
	Tercepat []string `json:"tercepat"`
	Termurah []string `json:"termurah"`
	Termudah []string `json:"termudah"`
}

type Itinerary struct {
	ID            string    `json:"id"`
	Start         time.Time `json:"start"`
	End           time.Time `json:"end"`
	DurationSec   int       `json:"durationSec"`
	WalkDistanceM int       `json:"walkDistanceM"`
	Transfers     int       `json:"transfers"`
	Fare          Fare      `json:"fare"`
	Legs          []Leg     `json:"legs"`
}

type Fare struct {
	TotalIDR int `json:"totalIdr"`
	// Complete is false when some ride has no fare data, so TotalIDR is a
	// lower bound.
	Complete bool `json:"complete"`
}

type Leg struct {
	Mode        string    `json:"mode"`
	Start       time.Time `json:"start"`
	End         time.Time `json:"end"`
	DurationSec int       `json:"durationSec"`
	DistanceM   int       `json:"distanceM"`
	From        Place     `json:"from"`
	To          Place     `json:"to"`
	Route       *Route    `json:"route"`
	// FareIDR is paid when boarding this leg: 0 when an earlier ticket
	// covers it, nil for walking or unknown fares.
	FareIDR  *int         `json:"fareIdr"`
	Geometry [][2]float64 `json:"geometry"`
}

type Place struct {
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

type Route struct {
	ID        string `json:"id"`
	ShortName string `json:"shortName"`
	LongName  string `json:"longName"`
	Category  string `json:"category"`
	Color     string `json:"color"`
	TextColor string `json:"textColor"`
	Agency    string `json:"agency"`
}
