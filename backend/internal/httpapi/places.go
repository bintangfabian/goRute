package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/bintangfabian/goRute/internal/geocode"
)

type placesResponse struct {
	Places []geocode.Place `json:"places"`
}

func handlePlaces(logger *slog.Logger, s PlaceSearcher) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if utf8.RuneCountInString(q) < 2 {
			writeJSON(w, http.StatusOK, placesResponse{Places: []geocode.Place{}})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		places, err := s.Search(ctx, q)
		if err != nil {
			logger.Warn("place search failed", "err", err)
			writeError(w, http.StatusBadGateway, "Pencarian tempat sedang bermasalah. Coba lagi sebentar.")
			return
		}
		writeJSON(w, http.StatusOK, placesResponse{Places: places})
	})
}
