package planner

import (
	"cmp"
	"slices"
)

func rank(its []Itinerary) Ranking {
	return Ranking{
		Tercepat: order(its, compareFastest),
		Termurah: order(its, compareCheapest),
		Termudah: order(its, compareEasiest),
	}
}

func order(its []Itinerary, cmpFn func(a, b Itinerary) int) []string {
	sorted := slices.Clone(its)
	slices.SortStableFunc(sorted, cmpFn)
	ids := make([]string, len(sorted))
	for i, it := range sorted {
		ids[i] = it.ID
	}
	return ids
}

// compareFastest prefers the earliest arrival.
func compareFastest(a, b Itinerary) int {
	return cmp.Or(
		a.End.Compare(b.End),
		cmp.Compare(a.Transfers, b.Transfers),
	)
}

// compareCheapest prefers the lowest known fare; trips with unknown fares
// go last because their total is only a lower bound.
func compareCheapest(a, b Itinerary) int {
	return cmp.Or(
		compareBool(!a.Fare.Complete, !b.Fare.Complete),
		cmp.Compare(a.Fare.TotalIDR, b.Fare.TotalIDR),
		a.End.Compare(b.End),
	)
}

// compareEasiest prefers fewer transfers, then less walking.
func compareEasiest(a, b Itinerary) int {
	return cmp.Or(
		cmp.Compare(a.Transfers, b.Transfers),
		cmp.Compare(a.WalkDistanceM, b.WalkDistanceM),
		a.End.Compare(b.End),
	)
}

func compareBool(a, b bool) int {
	switch {
	case a == b:
		return 0
	case !a:
		return -1
	default:
		return 1
	}
}
