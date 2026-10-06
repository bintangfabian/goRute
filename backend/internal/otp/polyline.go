package otp

import "errors"

var errBadPolyline = errors.New("invalid encoded polyline")

// decodePolyline decodes a Google encoded polyline (precision 5) into
// [lon, lat] pairs, the order GeoJSON and MapLibre expect.
func decodePolyline(s string) ([][2]float64, error) {
	var coords [][2]float64
	var lat, lon int
	for i := 0; i < len(s); {
		dlat, n, err := decodeValue(s[i:])
		if err != nil {
			return nil, err
		}
		i += n
		dlon, n, err := decodeValue(s[i:])
		if err != nil {
			return nil, err
		}
		i += n
		lat += dlat
		lon += dlon
		coords = append(coords, [2]float64{float64(lon) / 1e5, float64(lat) / 1e5})
	}
	return coords, nil
}

// decodeValue reads one zigzag-encoded value and returns it with the
// number of bytes consumed.
func decodeValue(s string) (value, n int, err error) {
	var result, shift int
	for i := 0; i < len(s); i++ {
		b := int(s[i]) - 63
		if b < 0 || b > 63 {
			return 0, 0, errBadPolyline
		}
		result |= (b & 0x1f) << shift
		shift += 5
		if b < 0x20 {
			if result&1 != 0 {
				return ^(result >> 1), i + 1, nil
			}
			return result >> 1, i + 1, nil
		}
	}
	return 0, 0, errBadPolyline
}
