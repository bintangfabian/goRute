// Package pipeline collects upstream transit data and prepares it for OTP.
package pipeline

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// Source is an upstream dataset that is downloaded as-is.
type Source struct {
	// File is the file name under the raw data directory.
	File string
	URL  string
}

// Sources lists the datasets fetched by `pipeline fetch`.
// KRL (scraped) and the hand-made MRT/LRT feeds are produced by later stages.
var Sources = []Source{
	{File: "transjakarta-gtfs.zip", URL: "https://gtfs.transjakarta.co.id/files/file_gtfs.zip"},
}

// Download saves src into dir and returns the number of bytes written.
// It writes to a temporary file first so a failed download never
// replaces a previously good copy.
func Download(ctx context.Context, client *http.Client, src Source, dir string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src.URL, nil)
	if err != nil {
		return 0, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("GET %s: %s", src.URL, resp.Status)
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return 0, err
	}
	tmp, err := os.CreateTemp(dir, src.File+".*.part")
	if err != nil {
		return 0, err
	}
	defer os.Remove(tmp.Name())

	n, err := io.Copy(tmp, resp.Body)
	if err == nil {
		// CreateTemp uses 0600; the OTP container must be able to read the file.
		err = tmp.Chmod(0o644)
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return 0, err
	}
	return n, os.Rename(tmp.Name(), filepath.Join(dir, src.File))
}
