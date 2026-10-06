package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bintangfabian/goRute/internal/planner"
)

type fakePlanner struct {
	got planner.Request
	err error
}

func (f *fakePlanner) Plan(_ context.Context, req planner.Request) (planner.Plan, error) {
	f.got = req
	return planner.Plan{Itineraries: []planner.Itinerary{}}, f.err
}

func TestPlanHandler(t *testing.T) {
	const blokMToMonas = "/api/v1/plan?fromLat=-6.2441&fromLon=106.8&toLat=-6.1754&toLon=106.8272"
	tests := []struct {
		name       string
		url        string
		plannerErr error
		wantStatus int
	}{
		{"ok", blokMToMonas + "&toName=Monas", nil, http.StatusOK},
		{"missing destination", "/api/v1/plan?fromLat=-6.2441&fromLon=106.8", nil, http.StatusBadRequest},
		{"outside jabodetabek", "/api/v1/plan?fromLat=-6.2441&fromLon=106.8&toLat=-6.9175&toLon=107.6191", nil, http.StatusBadRequest},
		{"bad time", blokMToMonas + "&time=besok", nil, http.StatusBadRequest},
		{"otp down", blokMToMonas, errors.New("connection refused"), http.StatusBadGateway},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &fakePlanner{err: tt.plannerErr}
			router := NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), Deps{Planner: p})
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.url, nil))
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body)
			}
		})
	}
}

func TestParsePlanRequest(t *testing.T) {
	now := time.Date(2026, 10, 5, 8, 0, 0, 0, wib)
	req, err := parsePlanRequest(map[string][]string{
		"fromLat": {"-6.2441"}, "fromLon": {"106.8"},
		"toLat": {"-6.1754"}, "toLon": {"106.8272"}, "toName": {"Monas"},
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	if req.From.Label != "Lokasi awal" || req.To.Label != "Monas" {
		t.Errorf("labels = %q, %q", req.From.Label, req.To.Label)
	}
	if !req.Departure.Equal(now) {
		t.Errorf("departure = %v, want now", req.Departure)
	}
}
