package domain

import (
	"testing"
	"time"
)


func TestDeleteWindow(t *testing.T) {
	planned := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	created := planned.Add(-30 * 24 * time.Hour)

	cases := []struct {
		name    string
		created time.Time
		now     time.Time
		open    bool
	}{
		{"just created, far from start", created, created.Add(10 * time.Minute), true},
		{"exactly at the one-hour creation edge", created, created.Add(time.Hour), true},
		{"one minute past creation window", created, created.Add(61 * time.Minute), false},
		{"exactly one hour before start", created, planned.Add(-time.Hour), false},
		{"two hours before start", created, planned.Add(-2 * time.Hour), false},
		{"already started", created, planned, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DeleteWindowOpen(tc.created, planned, tc.now); got != tc.open {
				t.Fatalf("DeleteWindowOpen = %v, want %v", got, tc.open)
			}
			// The report is empty exactly when the window is open.
			report := DeleteWindowReport(tc.created, planned, tc.now)
			if tc.open && report != "" {
				t.Fatalf("window open but report = %q", report)
			}
			if !tc.open && report == "" {
				t.Fatalf("window closed but report is empty")
			}
		})
	}
}

func TestTerminalTransitions(t *testing.T) {
	cases := []struct {
		from  Status
		event Event
		to    Status
		ok    bool
	}{
		{StatusPlanned, EventCancel, StatusCancelled, true},
		{StatusPlanned, EventDelete, StatusDeleted, true},
		{StatusCheckedIn, EventVoid, StatusVoided, true},
		// A plan cannot be voided: voiding claims the rep was there.
		{StatusPlanned, EventVoid, "", false},
		// A cancelled plan cannot then be checked in.
		{StatusCancelled, EventCheckIn, "", false},
		// Once checked out the verdict exists; voiding would undo it.
		{StatusCheckedOut, EventVoid, "", false},
		// Deleted is terminal.
		{StatusDeleted, EventCancel, "", false},
	}

	for _, tc := range cases {
		got, err := Apply(tc.from, tc.event)
		if tc.ok {
			if err != nil || got != tc.to {
				t.Fatalf("Apply(%s, %s) = %q, %v; want %q", tc.from, tc.event, got, err, tc.to)
			}
			continue
		}
		if err == nil {
			t.Fatalf("Apply(%s, %s) should fail, got %q", tc.from, tc.event, got)
		}
	}
}
