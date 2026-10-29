package domain

import (
	"math"
	"testing"
)

// northOf returns the point that is exactly meters due north of base.
//
// Along a meridian the haversine formula collapses to R*Δφ, so the constructed
// distance is exact to floating-point precision. That is what makes the
// 499/500/501 m boundary tests meaningful instead of approximate.
func northOf(base Coordinates, meters float64) Coordinates {
	return Coordinates{
		Lat: base.Lat + (meters/earthRadiusMeters)*(180/math.Pi),
		Lng: base.Lng,
	}
}

var ruijin = Coordinates{Lat: 31.2119, Lng: 121.4661}

func TestHaversineZeroForIdenticalPoint(t *testing.T) {
	if got := HaversineMeters(ruijin, ruijin); got != 0 {
		t.Fatalf("distance to itself = %v, want 0", got)
	}
}

func TestHaversineIsSymmetric(t *testing.T) {
	a := Coordinates{Lat: 31.2304, Lng: 121.4737}
	b := Coordinates{Lat: 39.9042, Lng: 116.4074}
	ab, ba := HaversineMeters(a, b), HaversineMeters(b, a)
	if math.Abs(ab-ba) > 1e-6 {
		t.Fatalf("asymmetric: %v vs %v", ab, ba)
	}
}

func TestHaversineKnownCityPair(t *testing.T) {
	// Shanghai People's Square -> Beijing Tiananmen, published great-circle
	// distance ~1067 km.
	shanghai := Coordinates{Lat: 31.2304, Lng: 121.4737}
	beijing := Coordinates{Lat: 39.9042, Lng: 116.4074}

	got := HaversineMeters(shanghai, beijing)
	const want = 1_067_000.0
	if math.Abs(got-want)/want > 0.01 {
		t.Fatalf("distance = %.0f m, want %.0f m ±1%%", got, want)
	}
}

func TestHaversineMeridianIsLinear(t *testing.T) {
	for _, meters := range []float64{1, 100, 500, 5_000} {
		got := HaversineMeters(ruijin, northOf(ruijin, meters))
		if math.Abs(got-meters) > 1e-6 {
			t.Errorf("%v m due north measured as %v m", meters, got)
		}
	}
}

func TestHaversineAcrossAntimeridian(t *testing.T) {
	east := Coordinates{Lat: 0, Lng: 179.999}
	west := Coordinates{Lat: 0, Lng: -179.999}
	got := HaversineMeters(east, west)
	// 0.002 degrees of longitude at the equator ≈ 222.4 m, and crucially it
	// must not be the ~40 000 km you would get by subtracting longitudes.
	if got < 200 || got > 240 {
		t.Fatalf("distance across antimeridian = %.1f m, want ~222 m", got)
	}
}

func TestCoordinatesValid(t *testing.T) {
	cases := []struct {
		name string
		c    Coordinates
		want bool
	}{
		{"origin", Coordinates{0, 0}, true},
		{"ruijin", ruijin, true},
		{"north pole", Coordinates{90, 0}, true},
		{"south pole", Coordinates{-90, 0}, true},
		{"dateline", Coordinates{0, 180}, true},
		{"lat too high", Coordinates{90.0001, 0}, false},
		{"lat too low", Coordinates{-90.0001, 0}, false},
		{"lng too high", Coordinates{0, 180.0001}, false},
		{"lng too low", Coordinates{0, -180.0001}, false},
		{"NaN lat", Coordinates{math.NaN(), 0}, false},
		{"NaN lng", Coordinates{0, math.NaN()}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.c.Valid(); got != tc.want {
				t.Fatalf("Valid() = %v, want %v", got, tc.want)
			}
		})
	}
}
