package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

type statusResponse struct {
	API string    `json:"api"`
	OTP otpStatus `json:"otp"`
}

type otpStatus struct {
	Reachable bool     `json:"reachable"`
	Feeds     []string `json:"feeds"`
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleStatus reports whether the API can reach OTP and which feeds it serves.
// It always returns 200 so the web app can render a degraded state.
func handleStatus(logger *slog.Logger, otp FeedLister) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		resp := statusResponse{API: "ok", OTP: otpStatus{Feeds: []string{}}}
		feeds, err := otp.FeedIDs(ctx)
		if err != nil {
			logger.Warn("otp unreachable", "err", err)
		} else {
			resp.OTP = otpStatus{Reachable: true, Feeds: feeds}
		}
		writeJSON(w, http.StatusOK, resp)
	})
}
