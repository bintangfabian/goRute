package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/bintangfabian/goRute/internal/otp"
	"github.com/bintangfabian/goRute/internal/planner"
	"github.com/bintangfabian/goRute/internal/region"
)

var wib = time.FixedZone("WIB", 7*60*60)

func handlePlan(logger *slog.Logger, p TripPlanner) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req, err := parsePlanRequest(r.URL.Query(), time.Now().In(wib))
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		plan, err := p.Plan(ctx, req)
		if err != nil {
			logger.Error("plan failed", "err", err)
			writeError(w, http.StatusBadGateway, "Mesin rute sedang tidak bisa dihubungi. Coba lagi sebentar.")
			return
		}
		writeJSON(w, http.StatusOK, plan)
	})
}

func parsePlanRequest(q url.Values, now time.Time) (planner.Request, error) {
	from, err := parseLocation(q, "from", "Lokasi awal")
	if err != nil {
		return planner.Request{}, err
	}
	to, err := parseLocation(q, "to", "Tujuan")
	if err != nil {
		return planner.Request{}, err
	}

	departure := now
	if v := q.Get("time"); v != "" {
		if departure, err = time.Parse(time.RFC3339, v); err != nil {
			return planner.Request{}, errors.New("Parameter time harus berformat RFC 3339.")
		}
	}
	return planner.Request{From: from, To: to, Departure: departure}, nil
}

func parseLocation(q url.Values, prefix, defaultLabel string) (otp.Location, error) {
	lat, errLat := strconv.ParseFloat(q.Get(prefix+"Lat"), 64)
	lon, errLon := strconv.ParseFloat(q.Get(prefix+"Lon"), 64)
	if errLat != nil || errLon != nil {
		return otp.Location{}, fmt.Errorf("Parameter %sLat dan %sLon wajib berupa angka.", prefix, prefix)
	}
	if !region.Jabodetabek.Contains(lat, lon) {
		return otp.Location{}, fmt.Errorf("%s berada di luar area Jabodetabek.", defaultLabel)
	}
	label := q.Get(prefix + "Name")
	if label == "" {
		label = defaultLabel
	}
	return otp.Location{Label: label, Lat: lat, Lon: lon}, nil
}
