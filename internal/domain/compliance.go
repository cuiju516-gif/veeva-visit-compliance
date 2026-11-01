package domain

import (
	"encoding/json"
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

	// Provenance, injected by the caller. The domain never reads a clock: an
	// evaluation that recorded time.Now() would be untestable and would make
	// two identical inputs produce different snapshots.
	RuleVersion string
	EvaluatedAt time.Time
	Source      string
}

// Evaluation is the snapshot stored on a visit: the verdict *and* the evidence
// that produced it. Thresholds and rule version are copied in on purpose — if
// an administrator later edits a rule_version row, the snapshot still says what
// was actually applied.
type Evaluation struct {
	DurationSec  *int64    `json:"durationSec"`
	DistanceInM  *float64  `json:"distanceInM"`
	DistanceOutM *float64  `json:"distanceOutM"`
	Flags        []Flag    `json:"flags"`
	Abnormal     bool      `json:"abnormal"`
	Thresholds   Thresholds `json:"thresholds"`
	RuleVersion  string    `json:"ruleVersion"`
	EvaluatedAt  time.Time `json:"evaluatedAt"`
	Source       string    `json:"source"`
}

// ThresholdsJSON is the wire shape of the thresholds inside a snapshot. The Go
// field names are not the contract's field names, so the mapping is explicit
// rather than left to the default encoder.
type thresholdsJSON struct {
	MinDurationSec int     `json:"minDurationSec"`
	MaxDistanceM   float64 `json:"maxDistanceM"`
}

// MarshalJSON pins the snapshot's shape: the API contract names these fields,
// and a rename here would silently change stored history.
func (e Evaluation) MarshalJSON() ([]byte, error) {
	type alias struct {
		DurationSec  *int64         `json:"durationSec"`
		DistanceInM  *float64       `json:"distanceInM"`
		DistanceOutM *float64       `json:"distanceOutM"`
		Flags        []Flag         `json:"flags"`
		Abnormal     bool           `json:"abnormal"`
		Thresholds   thresholdsJSON `json:"thresholds"`
		RuleVersion  string         `json:"ruleVersion"`
		EvaluatedAt  time.Time      `json:"evaluatedAt"`
		Source       string         `json:"source"`
	}
	flags := e.Flags
	if flags == nil {
		flags = []Flag{}
	}
	return json.Marshal(alias{
		DurationSec:  e.DurationSec,
		DistanceInM:  e.DistanceInM,
		DistanceOutM: e.DistanceOutM,
		Flags:        flags,
		Abnormal:     e.Abnormal,
		Thresholds: thresholdsJSON{
			MinDurationSec: e.Thresholds.MinDurationSeconds,
			MaxDistanceM:   e.Thresholds.MaxDistanceMeters,
		},
		RuleVersion: e.RuleVersion,
		EvaluatedAt: e.EvaluatedAt,
		Source:      e.Source,
	})
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

// Snapshot runs the rules and returns the verdict together with the evidence
// that produced it: the distances, the thresholds, the rule version and when it
// was decided. This is what gets stored on the visit.
//
// The comparison itself stays in Evaluate; this only captures its inputs.
func Snapshot(in EvaluationInput) (Evaluation, error) {
	flags, err := Evaluate(in)
	if err != nil {
		return Evaluation{}, err
	}

	duration, err := StayDuration(in.CheckinAt, in.CheckoutAt)
	if err != nil {
		return Evaluation{}, err
	}
	durationSec := int64(duration / time.Second)
	distanceIn := HaversineMeters(in.Checkin, in.HospitalBase)
	distanceOut := HaversineMeters(in.Checkout, in.HospitalBase)

	return Evaluation{
		DurationSec:  &durationSec,
		DistanceInM:  &distanceIn,
		DistanceOutM: &distanceOut,
		Flags:        flags,
		Abnormal:     IsAbnormal(flags),
		Thresholds:   in.Thresholds,
		RuleVersion:  in.RuleVersion,
		EvaluatedAt:  in.EvaluatedAt,
		Source:       in.Source,
	}, nil
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

// EvaluateCheckinPoint runs the location rule against the check-in point only.
//
// Used when a visit is voided: there is no check-out, so the stay duration does
// not exist and R1 cannot be evaluated. R2 still can, and it must — a voided
// visit leaves the "completed" counter, but it must not leave its abnormality
// behind (docs/需求说明.md §3.2 迁移 6 的"补判").
func EvaluateCheckinPoint(checkin, base Coordinates, th Thresholds) ([]Flag, error) {
	if err := th.Validate(); err != nil {
		return nil, err
	}
	if !checkin.Valid() {
		return nil, fmt.Errorf("check-in coordinates out of range: %v,%v", checkin.Lat, checkin.Lng)
	}
	if !base.Valid() {
		return nil, fmt.Errorf("hospital coordinates out of range: %v,%v", base.Lat, base.Lng)
	}

	distance := HaversineMeters(checkin, base)
	if !exceedsLimit(distance, th.MaxDistanceMeters) {
		return nil, nil
	}
	return []Flag{{
		Code: RuleLocationDeviation,
		Detail: fmt.Sprintf("check-in was %.0f m from the hospital, limit is %.0f m",
			distance, th.MaxDistanceMeters),
	}}, nil
}

// SnapshotCheckinPoint is the void-path counterpart of Snapshot. A voided visit
// has a check-in and no check-out, so there is no duration and R1 cannot be
// evaluated; the location rule still can, and the snapshot records that this
// verdict came from a backfill rather than from a check-out.
func SnapshotCheckinPoint(in EvaluationInput) (Evaluation, error) {
	flags, err := EvaluateCheckinPoint(in.Checkin, in.HospitalBase, in.Thresholds)
	if err != nil {
		return Evaluation{}, err
	}
	distanceIn := HaversineMeters(in.Checkin, in.HospitalBase)

	return Evaluation{
		DurationSec:  nil, // no check-out, so no duration: not "zero", unknown
		DistanceInM:  &distanceIn,
		DistanceOutM: nil,
		Flags:        flags,
		Abnormal:     IsAbnormal(flags),
		Thresholds:   in.Thresholds,
		RuleVersion:  in.RuleVersion,
		EvaluatedAt:  in.EvaluatedAt,
		Source:       in.Source,
	}, nil
}

// UnmarshalJSON is the inverse of MarshalJSON. It exists because the stored
// shape uses the contract's field names (minDurationSec), which do not match the
// Go field names on Thresholds — without it the thresholds silently decode as
// zero, and a snapshot that says "300 s" would read back as "0 s".
func (e *Evaluation) UnmarshalJSON(data []byte) error {
	type alias struct {
		DurationSec  *int64         `json:"durationSec"`
		DistanceInM  *float64       `json:"distanceInM"`
		DistanceOutM *float64       `json:"distanceOutM"`
		Flags        []Flag         `json:"flags"`
		Abnormal     bool           `json:"abnormal"`
		Thresholds   thresholdsJSON `json:"thresholds"`
		RuleVersion  string         `json:"ruleVersion"`
		EvaluatedAt  time.Time      `json:"evaluatedAt"`
		Source       string         `json:"source"`
	}
	var a alias
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	*e = Evaluation{
		DurationSec:  a.DurationSec,
		DistanceInM:  a.DistanceInM,
		DistanceOutM: a.DistanceOutM,
		Flags:        a.Flags,
		Abnormal:     a.Abnormal,
		Thresholds: Thresholds{
			MinDurationSeconds: a.Thresholds.MinDurationSec,
			MaxDistanceMeters:  a.Thresholds.MaxDistanceM,
		},
		RuleVersion: a.RuleVersion,
		EvaluatedAt: a.EvaluatedAt,
		Source:      a.Source,
	}
	if e.Flags == nil {
		e.Flags = []Flag{}
	}
	return nil
}
