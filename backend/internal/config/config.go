// Package config loads runtime settings from environment variables.
package config

import "os"

type Config struct {
	// Addr is the listen address of the HTTP API.
	Addr string
	// OTPURL is the base URL of the OpenTripPlanner instance.
	OTPURL string
}

func Load() Config {
	return Config{
		Addr:   getenv("GORUTE_ADDR", ":8080"),
		OTPURL: getenv("GORUTE_OTP_URL", "http://localhost:8081"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
