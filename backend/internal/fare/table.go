// Package fare prices trips in rupiah from GTFS Fares v1 data plus the
// operator rules GTFS cannot express.
package fare

import (
	"archive/zip"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Product is one GTFS fare_attributes row.
type Product struct {
	ID    string
	Price int // rupiah
	// Transfers allowed on one ticket; -1 means unlimited.
	Transfers int
	// TransferDuration is how long after the first boarding the ticket
	// stays valid for transfers; 0 means no limit.
	TransferDuration time.Duration
}

// Table maps routes ("feedId:routeId", as OTP names them) to the product
// that covers them.
type Table struct {
	routes map[string]Product
}

func NewTable() *Table {
	return &Table{routes: map[string]Product{}}
}

// Add registers the product that covers routeID.
func (t *Table) Add(routeID string, p Product) {
	t.routes[routeID] = p
}

// Len returns the number of priced routes.
func (t *Table) Len() int { return len(t.routes) }

// LoadOTPDir reads the GTFS feeds listed in an OTP build-config.json, so
// prices always come from the same data OTP routes on.
func LoadOTPDir(dir string) (*Table, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "build-config.json"))
	if err != nil {
		return nil, err
	}
	var cfg struct {
		TransitFeeds []struct {
			Type   string `json:"type"`
			FeedID string `json:"feedId"`
			Source string `json:"source"`
		} `json:"transitFeeds"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("build-config.json: %w", err)
	}

	t := NewTable()
	for _, f := range cfg.TransitFeeds {
		if f.Type != "gtfs" {
			continue
		}
		if err := t.loadGTFS(f.FeedID, filepath.Join(dir, f.Source)); err != nil {
			return nil, fmt.Errorf("%s: %w", f.Source, err)
		}
	}
	return t, nil
}

func (t *Table) loadGTFS(feedID, path string) error {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer zr.Close()

	attrs, err := readCSV(&zr.Reader, "fare_attributes.txt")
	if errors.Is(err, os.ErrNotExist) {
		return nil // feed without fares
	} else if err != nil {
		return err
	}
	products := map[string]Product{}
	for _, row := range attrs {
		p, err := parseProduct(row)
		if err != nil {
			return fmt.Errorf("fare_attributes.txt: %w", err)
		}
		products[p.ID] = p
	}

	rules, err := readCSV(&zr.Reader, "fare_rules.txt")
	if err != nil {
		return err
	}
	for _, row := range rules {
		// Only route-based rules are supported; zone-based ones need
		// stop zones that no Jabodetabek feed publishes yet.
		if row["origin_id"] != "" || row["destination_id"] != "" || row["contains_id"] != "" {
			continue
		}
		p, ok := products[row["fare_id"]]
		if !ok || row["route_id"] == "" {
			continue
		}
		t.Add(feedID+":"+row["route_id"], p)
	}
	return nil
}

func parseProduct(row map[string]string) (Product, error) {
	price, err := strconv.ParseFloat(row["price"], 64)
	if err != nil {
		return Product{}, fmt.Errorf("fare %q: price: %w", row["fare_id"], err)
	}
	p := Product{ID: row["fare_id"], Price: int(price), Transfers: -1}
	if v := row["transfers"]; v != "" {
		if p.Transfers, err = strconv.Atoi(v); err != nil {
			return Product{}, fmt.Errorf("fare %q: transfers: %w", p.ID, err)
		}
	}
	if v := row["transfer_duration"]; v != "" {
		secs, err := strconv.Atoi(v)
		if err != nil {
			return Product{}, fmt.Errorf("fare %q: transfer_duration: %w", p.ID, err)
		}
		p.TransferDuration = time.Duration(secs) * time.Second
	}
	return p, nil
}

// readCSV returns the rows of a GTFS file keyed by column name.
func readCSV(fsys *zip.Reader, name string) ([]map[string]string, error) {
	f, err := fsys.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\ufeff")
	}

	var rows []map[string]string
	for {
		rec, err := r.Read()
		if err == io.EOF {
			return rows, nil
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		row := make(map[string]string, len(header))
		for i, col := range header {
			if i < len(rec) {
				row[col] = strings.TrimSpace(rec[i])
			}
		}
		rows = append(rows, row)
	}
}
