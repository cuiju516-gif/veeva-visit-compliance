package domain

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

// Thresholds are the two numbers from the brief, kept injectable so that tests
// can pin the boundaries instead of hard-coding them in two places.
type Thresholds struct {
	// MinDurationSeconds is the shortest compliant stay. 300 = 5 minutes.
	MinDurationSeconds int
	// MaxDistanceMeters is the largest compliant distance from the hospital.
	MaxDistanceMeters float64
}

// DefaultThresholds returns the values given by the exercise brief.
func DefaultThresholds() Thresholds {
	return Thresholds{MinDurationSeconds: 300, MaxDistanceMeters: 500}
}

// Validate rejects configurations that would silently disable a rule.
func (t Thresholds) Validate() error {
	if t.MinDurationSeconds <= 0 {
		return fmt.Errorf("min duration must be positive, got %d", t.MinDurationSeconds)
	}
	if t.MaxDistanceMeters <= 0 {
		return fmt.Errorf("max distance must be positive, got %v", t.MaxDistanceMeters)
	}
	return nil
}

// distanceEpsilonMeters absorbs floating-point noise when a point is exactly on
// the threshold. It is a comparison tolerance of one micrometre, not slack in
// the measurement: 500.4 m is still abnormal.
const distanceEpsilonMeters = 1e-6

// exceedsLimit is the whole boundary policy for the location rule, in one place:
// strictly greater than the limit, by more than the comparison tolerance.
//
// It is a named function so the policy can be asserted with exact float inputs.
// Testing it only through haversine would leave > and >= indistinguishable: the
// computed distance carries ~1e-10 of noise, which is far smaller than the
// tolerance, so a mutation of the operator would survive the whole suite.
func exceedsLimit(distance, limit float64) bool {
	return distance > limit+distanceEpsilonMeters
}

// ErrNegativeDuration means check-out precedes check-in.
var ErrNegativeDuration = errors.New("check-out cannot precede check-in")

// StayDuration returns checkout - checkin, the stay length used by rule R1.
//
// The value comes from server-side timestamps only; a client-supplied duration
// would make the rule trivially bypassable.
func StayDuration(checkin, checkout time.Time) (time.Duration, error) {
	if checkout.Before(checkin) {
		return 0, ErrNegativeDuration
	}
	return checkout.Sub(checkin), nil
}

// EvaluationInput is everything the rules need, gathered by the caller.
type EvaluationInput struct {
	CheckinAt    time.Time
	CheckoutAt   time.Time
	Checkin      Coordinates
	Checkout     Coordinates
	HospitalBase Coordinates
	Thresholds   Thresholds
}

// Deviation describes one point that is too far from the hospital.
type Deviation struct {
	Point    string // "check-in" or "check-out"
	Distance float64
}

// Evaluate applies every rule and returns all findings, sorted by rule code.
//
// There is no short-circuit: if the stay was too short *and* the rep was 2 km
// away, both flags are returned. The brief asks for the visit to be marked
// abnormal; an auditor needs to know why, and "all reasons" is the only version
// of that answer that stays true as rules are added.
func Evaluate(in EvaluationInput) ([]Flag, error) {
	if err := in.Thresholds.Validate(); err != nil {
		return nil, err
	}
	if in.CheckinAt.IsZero() || in.CheckoutAt.IsZero() {
		return nil, ErrIncomplete
	}
	if !in.Checkin.Valid() {
		return nil, fmt.Errorf("check-in coordinates out of range: %v,%v", in.Checkin.Lat, in.Checkin.Lng)
	}
	if !in.Checkout.Valid() {
		return nil, fmt.Errorf("check-out coordinates out of range: %v,%v", in.Checkout.Lat, in.Checkout.Lng)
	}
	if !in.HospitalBase.Valid() {
		return nil, fmt.Errorf("hospital coordinates out of range: %v,%v", in.HospitalBase.Lat, in.HospitalBase.Lng)
	}

	duration, err := StayDuration(in.CheckinAt, in.CheckoutAt)
	if err != nil {
		return nil, err
	}

	var flags []Flag

	// No epsilon here, deliberately. Durations are integer nanoseconds derived
	// from two time.Time values, so "exactly 5 minutes" is exactly 5 minutes —
	// adding a nanosecond of slack would hide the difference between < and <=,
	// which is the one decision this rule has to get right.
	if min := time.Duration(in.Thresholds.MinDurationSeconds) * time.Second; duration < min {
		flags = append(flags, Flag{
			Code:   RuleDurationTooShort,
			Detail: fmt.Sprintf("stay was %s, minimum is %s", formatDuration(duration), formatDuration(min)),
		})
	}

	limit := in.Thresholds.MaxDistanceMeters
	for _, d := range []Deviation{
		{Point: "check-in", Distance: HaversineMeters(in.Checkin, in.HospitalBase)},
		{Point: "check-out", Distance: HaversineMeters(in.Checkout, in.HospitalBase)},
	} {
		if exceedsLimit(d.Distance, limit) {
			flags = append(flags, Flag{
				Code: RuleLocationDeviation,
				Detail: fmt.Sprintf("%s was %.0f m from the hospital, limit is %.0f m",
					d.Point, d.Distance, limit),
			})
		}
	}

	sort.Slice(flags, func(i, j int) bool { return flags[i].Code < flags[j].Code })
	return flags, nil
}

// IsAbnormal reports whether any rule fired.
func IsAbnormal(flags []Flag) bool { return len(flags) > 0 }

// HasFlag reports whether a specific rule fired.
func HasFlag(flags []Flag, code RuleCode) bool {
	for _, f := range flags {
		if f.Code == code {
			return true
		}
	}
	return false
}

// formatDuration renders a stay for a human. Seconds are truncated, not
// rounded, so the text always agrees with the stored duration_seconds column
// (which is floor(checkout - checkin)): a 3.7 s stay reads "3s" in both places
// rather than "4s" here and 3 in the database.
func formatDuration(d time.Duration) string {
	secs := int(d / time.Second)
	if secs < 60 {
		return fmt.Sprintf("%ds", secs)
	}
	return fmt.Sprintf("%dm%02ds", secs/60, secs%60)
}
