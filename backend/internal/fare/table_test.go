package fare

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeGTFS(t *testing.T, path string, files map[string]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	zw := zip.NewWriter(f)
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestLoadOTPDir(t *testing.T) {
	dir := t.TempDir()
	config := `{"transitFeeds": [{"type": "gtfs", "feedId": "TJ", "source": "tj.zip"}]}`
	if err := os.WriteFile(filepath.Join(dir, "build-config.json"), []byte(config), 0o644); err != nil {
		t.Fatal(err)
	}
	writeGTFS(t, filepath.Join(dir, "tj.zip"), map[string]string{
		"fare_attributes.txt": "\ufefffare_id,price,currency_type,payment_method,transfers,agency_id,transfer_duration\n" +
			"FP,3500,IDR,0,,Tije,10800\n" +
			"FP2,3500,IDR,0,1,Tije,10800\n",
		"fare_rules.txt": "fare_id,route_id,origin_id,destination_id,contains_id\n" +
			"FP,1,,,\n" +
			"FP2,4B,,,\n" +
			"FP,9,Z1,Z2,\n", // zone rule: ignored
	})

	table, err := LoadOTPDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if table.Len() != 2 {
		t.Fatalf("Len() = %d, want 2", table.Len())
	}
	want := Product{ID: "FP2", Price: 3500, Transfers: 1, TransferDuration: 3 * time.Hour}
	if got := table.routes["TJ:4B"]; got != want {
		t.Errorf("TJ:4B = %+v, want %+v", got, want)
	}
	if got := table.routes["TJ:1"].Transfers; got != -1 {
		t.Errorf("TJ:1 transfers = %d, want -1 (unlimited)", got)
	}
}
