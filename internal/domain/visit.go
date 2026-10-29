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
)

// Event is something a rep asks the system to do to a visit.
type Event string

const (
	EventCheckIn  Event = "checkin"
	EventCheckOut Event = "checkout"
	EventReport   Event = "report"
)

// transitions is the whole state machine, in one place.
//
// Records are (state, event) -> next state. Any pair not listed here is an
// illegal transition and is rejected by Apply.
var transitions = map[Status]map[Event]Status{
	StatusPlanned:    {EventCheckIn: StatusCheckedIn},
	StatusCheckedIn:  {EventCheckOut: StatusCheckedOut},
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

	// Version is the optimistic lock counter, bumped by the store on every
	// write. CreatedAt and UpdatedAt are database bookkeeping.
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}
