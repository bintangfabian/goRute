package otp

import (
	"math"
	"testing"
)

func TestDecodePolyline(t *testing.T) {
	// Example from Google's polyline algorithm documentation.
	got, err := decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
	if err != nil {
		t.Fatal(err)
	}
	want := [][2]float64{{-120.2, 38.5}, {-120.95, 40.7}, {-126.453, 43.252}}
	if len(got) != len(want) {
		t.Fatalf("got %d points, want %d", len(got), len(want))
	}
	for i := range want {
		for j := range 2 {
			if math.Abs(got[i][j]-want[i][j]) > 1e-9 {
				t.Errorf("point %d = %v, want %v", i, got[i], want[i])
			}
		}
	}
}

func TestDecodePolylineInvalid(t *testing.T) {
	for _, s := range []string{"_p~iF~ps|U_", " "} {
		if _, err := decodePolyline(s); err == nil {
			t.Errorf("decodePolyline(%q) succeeded, want error", s)
		}
	}
}
