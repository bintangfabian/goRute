// Package geocode searches places with a Photon geocoder (OSM-based).
package geocode

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/bintangfabian/goRute/internal/region"
)

const (
	userAgent  = "goRute/0.1 (+https://github.com/bintangfabian/goRute)"
	maxResults = 6
)

type Place struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Address string  `json:"address"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
}

type Photon struct {
	baseURL string
	http    *http.Client
}

func NewPhoton(baseURL string) *Photon {
	return &Photon{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 8 * time.Second},
	}
}

// Search returns places in Jabodetabek matching query, best match first.
func (p *Photon) Search(ctx context.Context, query string) ([]Place, error) {
	b := region.Jabodetabek
	lat, lon := b.Center()
	params := url.Values{
		"q":     {query},
		"limit": {strconv.Itoa(maxResults * 2)}, // headroom for duplicates
		"bbox":  {fmt.Sprintf("%g,%g,%g,%g", b.MinLon, b.MinLat, b.MaxLon, b.MaxLat)},
		"lat":   {strconv.FormatFloat(lat, 'f', 4, 64)},
		"lon":   {strconv.FormatFloat(lon, 'f', 4, 64)},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/api/?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := p.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("photon: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("photon: unexpected status %s", resp.Status)
	}

	var fc featureCollection
	if err := json.NewDecoder(resp.Body).Decode(&fc); err != nil {
		return nil, fmt.Errorf("photon: decode response: %w", err)
	}
	return fc.places(), nil
}

type featureCollection struct {
	Features []struct {
		Geometry struct {
			Coordinates [2]float64 `json:"coordinates"` // [lon, lat]
		} `json:"geometry"`
		Properties struct {
			OSMType  string `json:"osm_type"`
			OSMID    int64  `json:"osm_id"`
			Name     string `json:"name"`
			Street   string `json:"street"`
			District string `json:"district"`
			City     string `json:"city"`
			County   string `json:"county"`
			State    string `json:"state"`
		} `json:"properties"`
	} `json:"features"`
}

func (fc featureCollection) places() []Place {
	seen := map[string]bool{}
	places := []Place{}
	for _, f := range fc.Features {
		pr := f.Properties
		lon, lat := f.Geometry.Coordinates[0], f.Geometry.Coordinates[1]
		if pr.Name == "" {
			continue
		}
		// Photon often returns the same place twice (e.g. a relation and
		// its label node); collapse matches within ~100 m.
		key := fmt.Sprintf("%s|%.3f|%.3f", strings.ToLower(pr.Name), round(lat), round(lon))
		if seen[key] {
			continue
		}
		seen[key] = true
		places = append(places, Place{
			ID:      fmt.Sprintf("%s%d", pr.OSMType, pr.OSMID),
			Name:    pr.Name,
			Address: address(pr.Name, pr.Street, pr.District, pr.City, pr.County, pr.State),
			Lat:     lat,
			Lon:     lon,
		})
		if len(places) == maxResults {
			break
		}
	}
	return places
}

// address joins up to three distinct, non-empty parts that differ from
// the place name.
func address(name string, parts ...string) string {
	var out []string
	for _, p := range parts {
		if p == "" || p == name || slices.Contains(out, p) {
			continue
		}
		out = append(out, p)
		if len(out) == 3 {
			break
		}
	}
	return strings.Join(out, ", ")
}

func round(v float64) float64 {
	return math.Round(v*1000) / 1000
}
