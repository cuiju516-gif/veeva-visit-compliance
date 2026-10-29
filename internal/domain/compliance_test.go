package domain

import (
	"errors"
	"strings"
	"testing"
	"time"
)

// The brief's two thresholds are 5 minutes and 500 metres, and it is the
// boundaries either side of them that decide whether the implementation is
// right. These tests are the specification.

var checkinAt = time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC)

func evalAt(stay time.Duration, metersFromHospital float64) ([]Flag, error) {
	return Evaluate(EvaluationInput{
		CheckinAt:    checkinAt,
		CheckoutAt:   checkinAt.Add(stay),
		Checkin:      ruijin,
		Checkout:     northOf(ruijin, metersFromHospital),
		HospitalBase: ruijin,
		Thresholds:   DefaultThresholds(),
	})
}

func TestDurationBoundaries(t *testing.T) {
	cases := []struct {
		name    string
		stay    time.Duration
		wantBad bool
	}{
		{"4m59s is too short", 299 * time.Second, true},
		{"exactly 5m is compliant", 300 * time.Second, false},
		{"5m01s is compliant", 301 * time.Second, false},
		{"zero-length stay is too short", 0, true},
		{"sub-second stay is too short", 900 * time.Millisecond, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flags, err := evalAt(tc.stay, 100)
			if err != nil {
				t.Fatalf("Evaluate: %v", err)
			}
			if got := HasFlag(flags, RuleDurationTooShort); got != tc.wantBad {
				t.Fatalf("DURATION_TOO_SHORT = %v, want %v (flags: %+v)", got, tc.wantBad, flags)
			}
		})
	}
}

func TestDistanceBoundaries(t *testing.T) {
	cases := []struct {
		name    string
		meters  float64
		wantBad bool
	}{
		{"499 m is compliant", 499, false},
		{"exactly 500 m is compliant", 500, false},
		{"500.4 m is abnormal", 500.4, true},
		{"501 m is abnormal", 501, true},
		{"2 km is abnormal", 2000, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flags, err := evalAt(10*time.Minute, tc.meters)
			if err != nil {
				t.Fatalf("Evaluate: %v", err)
			}
			if got := HasFlag(flags, RuleLocationDeviation); got != tc.wantBad {
				t.Fatalf("LOCATION_DEVIATION = %v, want %v (flags: %+v)", got, tc.wantBad, flags)
			}
		})
	}
}

func TestCheckoutPointIsAlsoChecked(t *testing.T) {
	// Check in exactly at the hospital, then leave it: the second point must
	// be evaluated too, otherwise a rep could check in at the door and walk.
	flags, err := Evaluate(EvaluationInput{
		CheckinAt:    checkinAt,
		CheckoutAt:   checkinAt.Add(10 * time.Minute),
		Checkin:      ruijin,
		Checkout:     northOf(ruijin, 900),
		HospitalBase: ruijin,
		Thresholds:   DefaultThresholds(),
	})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if !HasFlag(flags, RuleLocationDeviation) {
		t.Fatalf("check-out 900 m away was not flagged: %+v", flags)
	}
	if len(flags) != 1 {
		t.Fatalf("expected a single flag, got %+v", flags)
	}
}

func TestBothRulesFireAndAreBothReported(t *testing.T) {
	flags, err := evalAt(60*time.Second, 2_000)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if len(flags) != 2 {
		t.Fatalf("expected 2 flags (short stay + deviation), got %d: %+v", len(flags), flags)
	}
	// Sorted, and both codes present: the brief says the visit is marked
	// abnormal, an auditor needs every reason.
	if !HasFlag(flags, RuleDurationTooShort) || !HasFlag(flags, RuleLocationDeviation) {
		t.Fatalf("missing one of the two rules: %+v", flags)
	}
	if flags[0].Code > flags[1].Code {
		t.Fatalf("flags are not sorted by code: %+v", flags)
	}
	for _, f := range flags {
		if f.Detail == "" {
			t.Fatalf("flag %s has no human-readable detail", f.Code)
		}
	}
}

func TestCompliantVisitHasNoFlags(t *testing.T) {
	flags, err := evalAt(12*time.Minute, 12)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if IsAbnormal(flags) {
		t.Fatalf("expected a compliant visit, got %+v", flags)
	}
}

func TestIncompleteVisitIsNotEvaluated(t *testing.T) {
	_, err := Evaluate(EvaluationInput{
		Checkin:      ruijin,
		Checkout:     ruijin,
		HospitalBase: ruijin,
		Thresholds:   DefaultThresholds(),
	})
	if !errors.Is(err, ErrIncomplete) {
		t.Fatalf("err = %v, want ErrIncomplete", err)
	}
}

func TestCheckoutBeforeCheckinIsRejected(t *testing.T) {
	_, err := Evaluate(EvaluationInput{
		CheckinAt:    checkinAt,
		CheckoutAt:   checkinAt.Add(-time.Minute),
		Checkin:      ruijin,
		Checkout:     ruijin,
		HospitalBase: ruijin,
		Thresholds:   DefaultThresholds(),
	})
	if !errors.Is(err, ErrNegativeDuration) {
		t.Fatalf("err = %v, want ErrNegativeDuration", err)
	}
}

func TestInvalidCoordinatesAreRejected(t *testing.T) {
	_, err := Evaluate(EvaluationInput{
		CheckinAt:    checkinAt,
		CheckoutAt:   checkinAt.Add(10 * time.Minute),
		Checkin:      Coordinates{Lat: 95, Lng: 0},
		Checkout:     ruijin,
		HospitalBase: ruijin,
		Thresholds:   DefaultThresholds(),
	})
	if err == nil {
		t.Fatal("expected an error for out-of-range coordinates")
	}
}

func TestThresholdsAreConfigurable(t *testing.T) {
	// A 3-minute visit is compliant at a 2-minute threshold and abnormal at the
	// default one: proves the constant is injected, not hard-coded.
	in := EvaluationInput{
		CheckinAt:    checkinAt,
		CheckoutAt:   checkinAt.Add(3 * time.Minute),
		Checkin:      ruijin,
		Checkout:     ruijin,
		HospitalBase: ruijin,
		Thresholds:   Thresholds{MinDurationSeconds: 120, MaxDistanceMeters: 500},
	}
	flags, err := Evaluate(in)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if IsAbnormal(flags) {
		t.Fatalf("3 min stay should pass a 2 min threshold: %+v", flags)
	}

	in.Thresholds = DefaultThresholds()
	flags, err = Evaluate(in)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if !HasFlag(flags, RuleDurationTooShort) {
		t.Fatalf("3 min stay should fail the 5 min threshold: %+v", flags)
	}
}

func TestInvalidThresholdsRejected(t *testing.T) {
	_, err := Evaluate(EvaluationInput{
		CheckinAt:    checkinAt,
		CheckoutAt:   checkinAt.Add(time.Hour),
		Checkin:      ruijin,
		Checkout:     ruijin,
		HospitalBase: ruijin,
		Thresholds:   Thresholds{MinDurationSeconds: 0, MaxDistanceMeters: 500},
	})
	if err == nil {
		t.Fatal("a zero duration threshold must be rejected, not silently disable the rule")
	}
}

func TestStayDuration(t *testing.T) {
	got, err := StayDuration(checkinAt, checkinAt.Add(7*time.Minute+30*time.Second))
	if err != nil {
		t.Fatalf("StayDuration: %v", err)
	}
	if got != 7*time.Minute+30*time.Second {
		t.Fatalf("duration = %v, want 7m30s", got)
	}

	if _, err := StayDuration(checkinAt, checkinAt.Add(-time.Second)); !errors.Is(err, ErrNegativeDuration) {
		t.Fatalf("err = %v, want ErrNegativeDuration", err)
	}
}

func TestApplyStateMachine(t *testing.T) {
	cases := []struct {
		from    Status
		event   Event
		want    Status
		wantErr bool
	}{
		{StatusPlanned, EventCheckIn, StatusCheckedIn, false},
		{StatusCheckedIn, EventCheckOut, StatusCheckedOut, false},
		{StatusCheckedOut, EventReport, StatusReported, false},

		{StatusPlanned, EventCheckOut, StatusPlanned, true},    // never checked in
		{StatusPlanned, EventReport, StatusPlanned, true},      // report before check-out
		{StatusCheckedIn, EventCheckIn, StatusCheckedIn, true}, // double check-in
		{StatusCheckedIn, EventReport, StatusCheckedIn, true},
		{StatusCheckedOut, EventCheckIn, StatusCheckedOut, true},
		{StatusCheckedOut, EventCheckOut, StatusCheckedOut, true}, // double check-out
		{StatusReported, EventReport, StatusReported, true},       // already reported
		{StatusReported, EventCheckIn, StatusReported, true},
	}
	for _, tc := range cases {
		t.Run(string(tc.from)+"/"+string(tc.event), func(t *testing.T) {
			got, err := Apply(tc.from, tc.event)
			if tc.wantErr {
				var te *TransitionError
				if !errors.As(err, &te) {
					t.Fatalf("err = %v, want *TransitionError", err)
				}
				if got != tc.from {
					t.Fatalf("state changed on an illegal transition: %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("state = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCanHelpers(t *testing.T) {
	if !CanCheckIn(StatusPlanned) || CanCheckIn(StatusCheckedIn) {
		t.Error("CanCheckIn is wrong")
	}
	if !CanCheckOut(StatusCheckedIn) || CanCheckOut(StatusPlanned) {
		t.Error("CanCheckOut is wrong")
	}
	if !CanReport(StatusCheckedOut) || CanReport(StatusCheckedIn) {
		t.Error("CanReport is wrong")
	}
}

// TestFlagDetailMatchesStoredDuration pins the consistency that a demo recording
// exposed: the human-readable detail used to round (3.7 s -> "4s") while the
// duration column truncates (3), so the same stay had two numbers.
func TestFlagDetailMatchesStoredDuration(t *testing.T) {
	start := time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC)
	flags, err := Evaluate(EvaluationInput{
		CheckinAt:    start,
		CheckoutAt:   start.Add(3700 * time.Millisecond),
		Checkin:      ruijin,
		Checkout:     ruijin,
		HospitalBase: ruijin,
		Thresholds:   DefaultThresholds(),
	})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if len(flags) != 1 {
		t.Fatalf("expected one flag, got %+v", flags)
	}
	if !strings.Contains(flags[0].Detail, "stay was 3s") {
		t.Fatalf("detail = %q, want it to truncate like the stored duration", flags[0].Detail)
	}
}

// TestExceedsLimit pins the location threshold's comparison policy at the
// precision the tolerance defines. Without this test the difference between
// `>` and `>=` is unobservable through the public API, because the haversine
// result carries far less noise than the tolerance and the epsilon swallows the
// distinction — a mutation of the operator would survive the rest of the suite.
func TestExceedsLimit(t *testing.T) {
	const limit = 500.0
	cases := []struct {
		name     string
		distance float64
		want     bool
	}{
		{"well inside", 499, false},
		{"exactly at the limit", limit, false},
		{"half the tolerance over", limit + distanceEpsilonMeters/2, false},
		{"exactly one tolerance over", limit + distanceEpsilonMeters, false},
		{"two tolerances over", limit + 2*distanceEpsilonMeters, true},
		{"just over in metres", limit + 0.001, true},
		{"far", 2000, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := exceedsLimit(tc.distance, limit); got != tc.want {
				t.Fatalf("exceedsLimit(%v, %v) = %v, want %v", tc.distance, limit, got, tc.want)
			}
		})
	}
}
