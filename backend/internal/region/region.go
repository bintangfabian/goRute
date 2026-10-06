// Package region defines the service area. It matches the bounding box
// scripts/fetch-osm.sh clips OSM data to, so OTP can route anywhere in it.
package region

type Bounds struct {
	MinLon, MinLat, MaxLon, MaxLat float64
}

var Jabodetabek = Bounds{MinLon: 106.20, MinLat: -6.75, MaxLon: 107.30, MaxLat: -5.95}

func (b Bounds) Contains(lat, lon float64) bool {
	return lat >= b.MinLat && lat <= b.MaxLat && lon >= b.MinLon && lon <= b.MaxLon
}

// Center is used to bias place search results.
func (b Bounds) Center() (lat, lon float64) {
	return (b.MinLat + b.MaxLat) / 2, (b.MinLon + b.MaxLon) / 2
}
