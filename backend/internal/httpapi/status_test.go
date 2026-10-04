package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

type fakeOTP struct {
	feeds []string
	err   error
}

func (f fakeOTP) FeedIDs(context.Context) ([]string, error) { return f.feeds, f.err }

func TestStatus(t *testing.T) {
	tests := []struct {
		name          string
		otp           fakeOTP
		wantReachable bool
		wantFeeds     []string
	}{
		{"otp up", fakeOTP{feeds: []string{"TJ", "KRL"}}, true, []string{"TJ", "KRL"}},
		{"otp down", fakeOTP{err: errors.New("connection refused")}, false, []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), tt.otp)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/status", nil))

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			var got statusResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.OTP.Reachable != tt.wantReachable || !slices.Equal(got.OTP.Feeds, tt.wantFeeds) {
				t.Errorf("otp = %+v, want reachable=%v feeds=%v", got.OTP, tt.wantReachable, tt.wantFeeds)
			}
		})
	}
}
