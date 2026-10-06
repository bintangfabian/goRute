package fare

import (
	"testing"
	"time"
)

func at(hhmm string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04", "2026-10-05 "+hhmm, wib)
	if err != nil {
		panic(err)
	}
	return t
}

func testTable() *Table {
	regular := Product{ID: "FP", Price: 3500, Transfers: -1, TransferDuration: 3 * time.Hour}
	t := NewTable()
	t.Add("TJ:1", regular)
	t.Add("TJ:9", regular)
	t.Add("TJ:JAK.10", Product{ID: "GR", Price: 0, Transfers: -1, TransferDuration: 3 * time.Hour})
	t.Add("TJ:1K", Product{ID: "PP", Price: 20000, Transfers: -1, TransferDuration: 3 * time.Hour})
	return t
}

func TestQuote(t *testing.T) {
	tests := []struct {
		name         string
		rides        []Ride
		wantTotal    int
		wantCharges  []int
		wantComplete bool
	}{
		{
			name:         "single BRT ride",
			rides:        []Ride{{"TJ:1", at("08:00")}},
			wantTotal:    3500,
			wantCharges:  []int{3500},
			wantComplete: true,
		},
		{
			name:         "transfer within three hours is free",
			rides:        []Ride{{"TJ:1", at("08:00")}, {"TJ:9", at("08:40")}},
			wantTotal:    3500,
			wantCharges:  []int{3500, 0},
			wantComplete: true,
		},
		{
			name:         "ticket expires after three hours",
			rides:        []Ride{{"TJ:1", at("08:00")}, {"TJ:9", at("11:30")}},
			wantTotal:    7000,
			wantCharges:  []int{3500, 3500},
			wantComplete: true,
		},
		{
			name:         "early morning discount",
			rides:        []Ride{{"TJ:1", at("06:15")}},
			wantTotal:    2000,
			wantCharges:  []int{2000},
			wantComplete: true,
		},
		{
			name:         "mikrotrans is free and royaltrans is charged separately",
			rides:        []Ride{{"TJ:JAK.10", at("08:00")}, {"TJ:1", at("08:20")}, {"TJ:1K", at("09:00")}},
			wantTotal:    23500,
			wantCharges:  []int{0, 3500, 20000},
			wantComplete: true,
		},
		{
			name:         "unknown route makes the quote incomplete",
			rides:        []Ride{{"TJ:1", at("08:00")}, {"KRL:BOO", at("08:30")}},
			wantTotal:    3500,
			wantCharges:  []int{3500, 0},
			wantComplete: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := testTable().Quote(tt.rides)
			if q.Total != tt.wantTotal || q.Complete != tt.wantComplete {
				t.Errorf("total=%d complete=%v, want total=%d complete=%v", q.Total, q.Complete, tt.wantTotal, tt.wantComplete)
			}
			for i, c := range q.Charges {
				if c.Amount != tt.wantCharges[i] {
					t.Errorf("charge[%d] = %d, want %d", i, c.Amount, tt.wantCharges[i])
				}
			}
		})
	}
}

func TestLimitedTransfers(t *testing.T) {
	table := NewTable()
	table.Add("X:A", Product{ID: "ONE", Price: 1000, Transfers: 1})
	q := table.Quote([]Ride{{"X:A", at("08:00")}, {"X:A", at("08:10")}, {"X:A", at("08:20")}})
	if q.Total != 2000 {
		t.Errorf("total = %d, want 2000 (one transfer, then a new ticket)", q.Total)
	}
}
