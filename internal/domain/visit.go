// Package domain holds the business rules of the field-visit system.
//
// Everything here is pure: no database, no HTTP, no clock. Time values and
// coordinates are passed in, flags come out. That is what makes every boundary
// case in the compliance rules a cheap table-driven test instead of an
// integration test.
package domain

import (
	"errors"
	"fmt"
	"time"
)

// Status is the lifecycle state of a visit.
type Status string

const (
	// StatusPlanned is the state right after a rep books the visit.
	StatusPlanned Status = "PLANNED"
	// StatusCheckedIn means the rep has arrived and recorded a position.
	StatusCheckedIn Status = "CHECKED_IN"
	// StatusCheckedOut means the rep has left; duration and flags now exist.
	StatusCheckedOut Status = "CHECKED_OUT"
	// StatusReported means the call report has been filed. Flags may still exist.
	StatusReported Status = "REPORTED"
	// StatusCancelled means the plan never happened. It carries a reason, has no
	// check-in, and counts as "cancelled" rather than "completed".
	StatusCancelled Status = "CANCELLED"
	// StatusVoided means the rep attended but the visit does not count. There is
	// a check-in and never a check-out, so it has no duration and R1 cannot run.
	StatusVoided Status = "VOIDED"
	// StatusDeleted is a correction: the plan should never have existed. It is
	// kept as a row so the denominator of "planned" cannot be shrunk silently.
	StatusDeleted Status = "DELETED"
)

// Event is something a rep asks the system to do to a visit.
type Event string

const (
	EventCheckIn  Event = "checkin"
	EventCheckOut Event = "checkout"
	EventReport   Event = "report"
	EventCancel   Event = "cancel"
	EventVoid     Event = "void"
	EventDelete   Event = "delete"
)

// transitions is the whole state machine, in one place.
//
// Records are (state, event) -> next state. Any pair not listed here is an
// illegal transition and is rejected by Apply.
var transitions = map[Status]map[Event]Status{
	StatusPlanned: {
		EventCheckIn: StatusCheckedIn,
		EventCancel:  StatusCancelled,
		EventDelete:  StatusDeleted,
	},
	StatusCheckedIn: {
		EventCheckOut: StatusCheckedOut,
		// Voiding is only possible before check-out: once the compliance verdict
		// exists, letting the rep undo it would make the verdict advisory.
		EventVoid: StatusVoided,
	},
	StatusCheckedOut: {EventReport: StatusReported},
}

// TransitionError reports an attempt to apply an event that the visit's current
// state does not allow, e.g. checking out a visit that was never checked in.
type TransitionError struct {
	Current Status
	Event   Event
}

func (e *TransitionError) Error() string {
	return fmt.Sprintf("visit is %s, cannot apply %q", e.Current, e.Event)
}

// ErrIncomplete means an operation needed timestamps the visit does not have yet.
var ErrIncomplete = errors.New("visit is incomplete: check-in and check-out are both required")

// Apply returns the state that results from applying event to current.
//
// It returns a *TransitionError when the transition is not in the state machine,
// which the API layer maps to 409 Conflict.
func Apply(current Status, event Event) (Status, error) {
	next, ok := transitions[current][event]
	if !ok {
		return current, &TransitionError{Current: current, Event: event}
	}
	return next, nil
}

// CanCheckIn reports whether the visit may be checked in. Used by the UI to
// disable buttons; the server never trusts it, it calls Apply.
func CanCheckIn(s Status) bool { _, err := Apply(s, EventCheckIn); return err == nil }

// CanCheckOut reports whether the visit may be checked out.
func CanCheckOut(s Status) bool { _, err := Apply(s, EventCheckOut); return err == nil }

// CanReport reports whether a call report may be filed.
func CanReport(s Status) bool { _, err := Apply(s, EventReport); return err == nil }

// Visit is the aggregate the domain reasons about. It is intentionally a plain
// value: the store maps rows to it and the API maps it to a DTO, but the rules
// below depend on nothing else.
type Visit struct {
	ID        string
	MRID      string
	HCPID     string
	ProductID string

	PlannedAt time.Time
	Status    Status

	CheckinAt   *time.Time
	CheckinPos  *Coordinates
	CheckoutAt  *time.Time
	CheckoutPos *Coordinates

	// Duration is derived on check-out and never accepted from clients.
	Duration time.Duration

	Flags []Flag

	TalkingPoints        string
	HCPFeedback          string
	MaterialsDistributed bool

	// Terminal-state evidence. Exactly one group is populated, and which one is
	// determined by Status — the database enforces the same pairing in
	// chk_visit_state_evidence.
	CancelReason string
	CancelledAt  *time.Time
	VoidReason   string
	VoidCause    string
	VoidedAt     *time.Time
	DeletedAt    *time.Time
	ReportedAt   *time.Time

	// Version is the optimistic lock counter, bumped by the store on every
	// write. CreatedAt and UpdatedAt are database bookkeeping.
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Void causes. The dashboard distinguishes "the rep decided not to count it"
// from "nobody came back to check out".
const (
	VoidCauseManual  = "MANUAL"
	VoidCauseTimeout = "TIMEOUT"
)

// DeleteWindowOpen reports whether a PLANNED visit may still be deleted.
//
// Deleting is the only operation that can shrink the "planned" denominator, so
// it gets a narrow window: shortly after creation (it was a mistake, not a
// change of plan) and well before the visit was due to start. Outside the
// window the rep must cancel instead, which keeps a reason and a counter.
func DeleteWindowOpen(createdAt, plannedAt, now time.Time) bool {
	return now.Before(plannedAt.Add(-time.Hour)) && !now.After(createdAt.Add(time.Hour))
}

// DeleteWindowReport explains, in the same units the UI shows, why the window
// is closed. Returning this instead of a bare bool keeps the 409 message honest.
func DeleteWindowReport(createdAt, plannedAt, now time.Time) string {
	const layout = "2006-01-02 15:04"
	switch {
	case !now.Before(plannedAt.Add(-time.Hour)):
		// Checked first: it is the condition the rep cannot fix by acting
		// sooner, so it is the more useful thing to say.
		return "plan starts within an hour (" + plannedAt.Format(layout) + "); cancel instead of deleting"
	case now.After(createdAt.Add(time.Hour)):
		return "created more than an hour ago (" + createdAt.Format(layout) + "); cancel instead of deleting"
	default:
		return ""
	}
}

// CanCancel reports whether the plan may be cancelled. A cancelled visit keeps
// a reason and a counter, which is why it is preferred over deleting.
func CanCancel(s Status) bool { _, err := Apply(s, EventCancel); return err == nil }

// CanVoid reports whether the visit may be voided. Only legal before check-out.
func CanVoid(s Status) bool { _, err := Apply(s, EventVoid); return err == nil }

// CanDelete reports whether the visit may be deleted. The time window is not
// part of the state machine — it depends on the clock, not on the state — so
// callers must also consult DeleteWindowOpen.
func CanDelete(s Status) bool { _, err := Apply(s, EventDelete); return err == nil }
