package domain

// RuleCode identifies a compliance rule that fired.
type RuleCode string

const (
	// RuleDurationTooShort fires when the stay is shorter than the minimum.
	RuleDurationTooShort RuleCode = "DURATION_TOO_SHORT"
	// RuleLocationDeviation fires when a check-in/check-out point is too far
	// from the hospital the visit is registered at.
	RuleLocationDeviation RuleCode = "LOCATION_DEVIATION"
)

// Flag is a persisted compliance finding. Detail is for humans; Code is what
// the dashboard counts and what clients switch on.
type Flag struct {
	Code   RuleCode `json:"code"`
	Detail string   `json:"detail"`
}
