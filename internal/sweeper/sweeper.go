// Package sweeper runs the timeout transitions on a timer.
//
// Why this exists: the first version converged only when someone read
// (docs/契约.md §5.4, decision 6-3 = B). That is correct for whoever is looking,
// and wrong for everyone else — a visit that timed out at 09:00 still reads as
// CHECKED_IN in the database until the next GET, so any report, export, BI tool
// or second service that does not come through this API sees a state that is
// simply false. "The data is correct because someone happened to look" is not a
// property a compliance system can rely on.
//
// The sweep is the same idempotent converge function, called on a timer instead
// of on a read. It is safe to run on every instance at once: the plan edge is a
// conditional UPDATE and the visit edge takes its rows with FOR UPDATE SKIP
// LOCKED inside the writing transaction.
package sweeper

import (
	"context"
	"log/slog"
	"time"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/store"
)

// Converger is the one method this package needs; the repository satisfies it.
type Converger interface {
	Converge(ctx context.Context, now time.Time) (store.ConvergeResult, error)
}

// Run sweeps once at startup, then on every tick until ctx is cancelled.
//
// The startup sweep is not a nicety: after a restart the process may have been
// down for longer than the timeout, and the first thing the sweeper must do is
// catch up on everything that expired while it was not running.
func Run(ctx context.Context, c Converger, log *slog.Logger, interval time.Duration) {
	if interval <= 0 {
		log.Info("timeout sweep disabled; state converges on read only")
		return
	}

	log.Info("timeout sweep started", "interval", interval.String())
	sweep(ctx, c, log)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Info("timeout sweep stopped")
			return
		case <-ticker.C:
			sweep(ctx, c, log)
		}
	}
}

// sweep applies one round and reports what it changed.
//
// Errors are logged and swallowed: the next tick retries, and stopping the
// sweeper because one round failed would leave every later visit converged only
// if someone reads — exactly the failure mode this package exists to remove.
func sweep(ctx context.Context, c Converger, log *slog.Logger) {
	result, err := c.Converge(ctx, time.Now().UTC())
	if err != nil {
		log.Warn("timeout sweep failed", "err", err)
		return
	}
	if result.Cancelled > 0 || result.Voided > 0 {
		log.Info("timeout sweep", "cancelled", result.Cancelled, "voided", result.Voided)
	}
}
