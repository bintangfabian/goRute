package geocode

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

const blokM = `{"features": [
  {"geometry": {"coordinates": [106.8009, -6.2449]},
   "properties": {"osm_type": "R", "osm_id": 13261793, "name": "Blok M", "district": "Kebayoran Baru", "city": "Jakarta", "state": "Jawa"}},
  {"geometry": {"coordinates": [106.8011, -6.2449]},
   "properties": {"osm_type": "N", "osm_id": 1, "name": "Blok M", "district": "Kebayoran Baru", "city": "Jakarta", "state": "Jawa"}},
  {"geometry": {"coordinates": [106.7981, -6.2445]},
   "properties": {"osm_type": "N", "osm_id": 6196107726, "name": "Blok M BCA", "street": "Jalan Panglima Polim Raya", "district": "Kebayoran Baru", "city": "Jakarta", "state": "Jawa"}},
  {"geometry": {"coordinates": [106.80, -6.20]}, "properties": {"osm_type": "N", "osm_id": 2}}
]}`

func TestSearch(t *testing.T) {
	var gotQuery, gotUA string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery, gotUA = r.URL.Query().Get("q"), r.UserAgent()
		w.Write([]byte(blokM))
	}))
	defer srv.Close()

	places, err := NewPhoton(srv.URL).Search(context.Background(), "blok m")
	if err != nil {
		t.Fatal(err)
	}
	if gotQuery != "blok m" || gotUA != userAgent {
		t.Errorf("request q=%q ua=%q", gotQuery, gotUA)
	}
	if len(places) != 2 {
		t.Fatalf("got %d places, want 2 (duplicate and nameless dropped): %+v", len(places), places)
	}
	want := Place{
		ID:      "N6196107726",
		Name:    "Blok M BCA",
		Address: "Jalan Panglima Polim Raya, Kebayoran Baru, Jakarta",
		Lat:     -6.2445,
		Lon:     106.7981,
	}
	if places[1] != want {
		t.Errorf("places[1] = %+v, want %+v", places[1], want)
	}
}
