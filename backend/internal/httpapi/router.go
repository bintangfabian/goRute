// Package httpapi exposes the goRute HTTP API consumed by the web app.
// Keep it in sync with api/openapi.yaml.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/bintangfabian/goRute/internal/geocode"
	"github.com/bintangfabian/goRute/internal/planner"
)

// FeedLister is the part of the OTP client the status endpoint needs.
type FeedLister interface {
	FeedIDs(ctx context.Context) ([]string, error)
}

type TripPlanner interface {
	Plan(ctx context.Context, req planner.Request) (planner.Plan, error)
}

type PlaceSearcher interface {
	Search(ctx context.Context, query string) ([]geocode.Place, error)
}

type Deps struct {
	OTP     FeedLister
	Planner TripPlanner
	Places  PlaceSearcher
}

func NewRouter(logger *slog.Logger, deps Deps) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.Handle("GET /api/v1/status", handleStatus(logger, deps.OTP))
	mux.Handle("GET /api/v1/plan", handlePlan(logger, deps.Planner))
	mux.Handle("GET /api/v1/places", handlePlaces(logger, deps.Places))
	return logRequests(logger, mux)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError sends a message the web app can show to the user as is.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func logRequests(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration", time.Since(start),
		)
	})
}
