package domain

import "math"

// Coordinates is a WGS-84 position supplied by the rep at check-in/check-out.
//
// The brief has the coordinates typed in by hand to stand in for a device GPS
// reading, so they are user input and must be validated like any other.
type Coordinates struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Valid reports whether the point is inside the geographic range of the Earth.
// NaN never compares equal to itself, so a NaN coordinate is rejected here
// rather than leaking into the distance calculation.
func (c Coordinates) Valid() bool {
	if math.IsNaN(c.Lat) || math.IsNaN(c.Lng) {
		return false
	}
	return c.Lat >= -90 && c.Lat <= 90 && c.Lng >= -180 && c.Lng <= 180
}

// earthRadiusMeters is the IUGG mean radius. Using a sphere rather than an
// ellipsoid introduces at most ~0.5% distance error, i.e. a few metres at the
// 500 m scale of the rule; the threshold test pins that tolerance down.
const earthRadiusMeters = 6371008.8

// HaversineMeters returns the great-circle distance between two points in metres.
//
// Haversine is chosen over a flat-earth approximation on purpose: the rule
// threshold is 500 m, and an equirectangular shortcut drifts by tens of metres
// at that scale, which would make the boundary test meaningless.
func HaversineMeters(a, b Coordinates) float64 {
	lat1 := a.Lat * math.Pi / 180
	lat2 := b.Lat * math.Pi / 180
	dLat := (b.Lat - a.Lat) * math.Pi / 180
	dLng := (b.Lng - a.Lng) * math.Pi / 180

	sinLat := math.Sin(dLat / 2)
	sinLng := math.Sin(dLng / 2)

	h := sinLat*sinLat + math.Cos(lat1)*math.Cos(lat2)*sinLng*sinLng
	// Clamp before Asin: rounding can push h a hair above 1 for antipodal
	// points, which would produce NaN.
	if h > 1 {
		h = 1
	}
	return 2 * earthRadiusMeters * math.Asin(math.Sqrt(h))
}
