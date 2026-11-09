package sweeper

import (
	"context"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

type fakeConverger struct {
	calls     atomic.Int32
	cancelled int32
	voided    int32
	err       error
}

func (f *fakeConverger) Converge(ctx context.Context, now time.Time) (store.ConvergeResult, error) {
	f.calls.Add(1)
	return store.ConvergeResult{Cancelled: int(f.cancelled), Voided: int(f.voided)}, f.err
}

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// TestRunSweepsAtStartup pins the catch-up behaviour: after a restart the process
// may have been down for longer than the timeout, so the first sweep must happen
// immediately rather than one interval later.
func TestRunSweepsAtStartup(t *testing.T) {
	f := &fakeConverger{voided: 1}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go Run(ctx, f, quietLogger(), time.Hour)

	deadline := time.Now().Add(2 * time.Second)
	for f.calls.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if got := f.calls.Load(); got != 1 {
		t.Fatalf("converge calls at startup = %d, want 1", got)
	}
}

// TestRunTicks: the sweep keeps running without any request.
func TestRunTicks(t *testing.T) {
	f := &fakeConverger{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go Run(ctx, f, quietLogger(), 20*time.Millisecond)

	deadline := time.Now().Add(2 * time.Second)
	for f.calls.Load() < 3 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if got := f.calls.Load(); got < 3 {
		t.Fatalf("converge calls = %d, want at least 3", got)
	}
}

// TestZeroIntervalDisables: 0 means "reads only", and must not spin.
func TestZeroIntervalDisables(t *testing.T) {
	f := &fakeConverger{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	Run(ctx, f, quietLogger(), 0)
	if got := f.calls.Load(); got != 0 {
		t.Fatalf("converge calls = %d, want 0 when disabled", got)
	}
}

// TestErrorsDoNotStopTheLoop: one failed round must not end the sweep, or every
// later visit would again depend on someone reading.
func TestErrorsDoNotStopTheLoop(t *testing.T) {
	f := &fakeConverger{err: context.DeadlineExceeded}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go Run(ctx, f, quietLogger(), 20*time.Millisecond)

	deadline := time.Now().Add(2 * time.Second)
	for f.calls.Load() < 3 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if got := f.calls.Load(); got < 3 {
		t.Fatalf("converge calls after errors = %d, want the loop to continue", got)
	}
}
