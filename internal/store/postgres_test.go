package store

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
)

// These tests need a real Postgres, because what they check *is* the database:
// CHECK constraints, the partial unique index, and the dashboard aggregation's
// behaviour under the flag join. A fake repository cannot prove any of it.
//
// They are skipped unless POSTGRES_TEST_DSN is set, so `go test ./...` stays
// dependency-free for the common case:
//
//	POSTGRES_TEST_DSN='postgres://veeva:veeva@localhost:5432/visits?sslmode=disable' go test ./internal/store/
func testRepo(t *testing.T) *Postgres {
	t.Helper()
	dsn := os.Getenv("POSTGRES_TEST_DSN")
	if dsn == "" {
		t.Skip("POSTGRES_TEST_DSN not set; skipping database-backed tests")
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repo, err := NewPostgres(context.Background(), dsn, log)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(repo.Close)
	return repo
}

// pickMR returns a rep who is not currently checked in, so the partial unique
// index does not reject the test before it starts.
func pickMR(t *testing.T, repo *Postgres, cat Catalog) MR {
	t.Helper()
	for _, mr := range cat.MRs {
		var active int
		err := repo.pool.QueryRow(context.Background(),
			"SELECT count(*) FROM visit WHERE mr_id = $1 AND status = 'CHECKED_IN'", mr.ID).Scan(&active)
		if err != nil {
			t.Fatalf("count active visits: %v", err)
		}
		if active == 0 {
			return mr
		}
	}
	t.Skip("every seeded rep already has an active visit")
	return MR{}
}

func pgCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

func TestSchemaRejectsInvertedTimestamps(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	in := cat.HCPs[0]
	_, err = repo.pool.Exec(ctx, `
		INSERT INTO visit (mr_id, hcp_id, product_id, planned_at, status,
		                   hcp_name, department, hospital_name, base_lat, base_lng, product_name,
		                   checkin_at, checkin_lat, checkin_lng,
		                   checkout_at, checkout_lat, checkout_lng, duration_seconds)
		VALUES ($1, $2, $3, now(), 'CHECKED_OUT',
		        '医生', '科室', '医院', $4, $5, '药品',
		        now(), $4, $5,
		        now() - interval '10 minutes', $4, $5, -600)`,
		cat.MRs[0].ID, in.ID, cat.Products[0].ID, in.BaseLat, in.BaseLng)
	if code := pgCode(err); code != "23514" {
		t.Fatalf("expected a check violation (23514) for checkout before check-in, got %v (%q)", err, code)
	}
}

func TestSchemaRejectsOutOfRangeCoordinates(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	_, err = repo.pool.Exec(ctx, `
		INSERT INTO visit (mr_id, hcp_id, product_id, planned_at, status,
		                   hcp_name, department, hospital_name, base_lat, base_lng, product_name,
		                   checkin_at, checkin_lat, checkin_lng)
		VALUES ($1, $2, $3, now(), 'CHECKED_IN',
		        '医生', '科室', '医院', 31.2, 121.4, '药品', now(), 91.5, 121.4)`,
		cat.MRs[0].ID, cat.HCPs[0].ID, cat.Products[0].ID)
	if code := pgCode(err); code != "23514" {
		t.Fatalf("expected a check violation for latitude 91.5, got %v (%q)", err, code)
	}
}

// TestSchemaRejectsDurationDrift is the constraint that keeps the compliance
// rule honest: the rule reads duration_seconds, so a duration that disagrees
// with the timestamps would let a non-compliant stay be scored as compliant.
func TestSchemaRejectsDurationDrift(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	in := cat.HCPs[0]
	_, err = repo.pool.Exec(ctx, `
		INSERT INTO visit (mr_id, hcp_id, product_id, planned_at, status,
		                   hcp_name, department, hospital_name, base_lat, base_lng, product_name,
		                   checkin_at, checkin_lat, checkin_lng,
		                   checkout_at, checkout_lat, checkout_lng, duration_seconds)
		VALUES ($1, $2, $3, now(), 'CHECKED_OUT',
		        '医生', '科室', '医院', $4, $5, '药品',
		        now() - interval '1 minute', $4, $5,
		        now(), $4, $5, 3600)`,
		cat.MRs[0].ID, in.ID, cat.Products[0].ID, in.BaseLat, in.BaseLng)
	if code := pgCode(err); code != "23514" {
		t.Fatalf("expected a check violation for a forged duration, got %v (%q)", err, code)
	}
}

// TestOneActiveVisitPerRep covers the partial unique index: a rep cannot be
// checked in at two hospitals at once, even if the API guard is bypassed.
func TestOneActiveVisitPerRep(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	mr := pickMR(t, repo, cat)

	created, err := repo.Create(ctx, CreateParams{
		MRID: mr.ID, HCPID: cat.HCPs[0].ID, ProductID: cat.Products[0].ID,
		PlannedAt: time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() {
		_, _ = repo.pool.Exec(context.Background(), "DELETE FROM visit WHERE id = $1", created.Visit.ID)
	})

	if _, err := repo.CheckIn(ctx, created.Visit.ID, time.Now().UTC(), domain.Coordinates{Lat: 31.2119, Lng: 121.4661}); err != nil {
		t.Fatalf("check-in: %v", err)
	}

	// A second active visit for the same rep, inserted directly.
	_, err = repo.pool.Exec(ctx, `
		INSERT INTO visit (mr_id, hcp_id, product_id, planned_at, status,
		                   hcp_name, department, hospital_name, base_lat, base_lng, product_name,
		                   checkin_at, checkin_lat, checkin_lng)
		VALUES ($1, $2, $3, now(), 'CHECKED_IN',
		        '医生', '科室', '医院', 31.2119, 121.4661, '药品', now(), 31.2119, 121.4661)`,
		mr.ID, cat.HCPs[1].ID, cat.Products[1].ID)
	if code := pgCode(err); code != "23505" {
		t.Fatalf("expected a unique violation (23505), got %v (%q)", err, code)
	}
}

// TestRepositoryLifecycle walks the five steps through the real SQL, and pins
// the dashboard counting rule: one visit with two flags must add one to the
// total, not two. That is the defect a row-counting aggregation produces when
// it joins visit_flag.
func TestRepositoryLifecycle(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	before, err := repo.Dashboard(ctx, 6, "")
	if err != nil {
		t.Fatalf("dashboard before: %v", err)
	}

	mr := pickMR(t, repo, cat)
	hcp := cat.HCPs[0]
	created, err := repo.Create(ctx, CreateParams{
		MRID: mr.ID, HCPID: hcp.ID, ProductID: cat.Products[0].ID,
		PlannedAt: time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() {
		_, _ = repo.pool.Exec(context.Background(), "DELETE FROM visit WHERE id = $1", created.Visit.ID)
	})

	if created.Visit.Version != 1 {
		t.Fatalf("version after create = %d, want 1", created.Visit.Version)
	}

	// A rep already checked in somewhere would trip the partial unique index.
	checkedIn, err := repo.CheckIn(ctx, created.Visit.ID, time.Now().UTC(), domain.Coordinates{Lat: hcp.BaseLat, Lng: hcp.BaseLng})
	if err != nil {
		t.Fatalf("check-in: %v", err)
	}
	// The version is the optimistic lock's and the client's only way to tell a
	// stale read from a fresh one; it has to survive the row -> domain mapping.
	if checkedIn.Visit.Version != 2 {
		t.Fatalf("version after check-in = %d, want 2", checkedIn.Visit.Version)
	}

	out, err := repo.CheckOut(ctx, created.Visit.ID,
		time.Now().UTC().Add(90*time.Second), domain.Coordinates{Lat: hcp.BaseLat + 0.008, Lng: hcp.BaseLng},
		domain.DefaultThresholds())
	if err != nil {
		t.Fatalf("check-out: %v", err)
	}
	if !domain.IsAbnormal(out.Visit.Flags) || len(out.Visit.Flags) != 2 {
		t.Fatalf("expected both rules to fire, got %+v", out.Visit.Flags)
	}
	if out.Visit.Version != 3 {
		t.Fatalf("version after check-out = %d, want 3", out.Visit.Version)
	}

	after, err := repo.Dashboard(ctx, 6, "")
	if err != nil {
		t.Fatalf("dashboard after: %v", err)
	}
	if after.TotalVisits != before.TotalVisits+1 {
		t.Fatalf("total visits went %d -> %d: a two-flag visit is being counted per flag",
			before.TotalVisits, after.TotalVisits)
	}
	if after.TotalAbnormal != before.TotalAbnormal+1 {
		t.Fatalf("total abnormal went %d -> %d, want +1", before.TotalAbnormal, after.TotalAbnormal)
	}

	// The report step, and the 409 on re-report.
	reported, err := repo.SubmitReport(ctx, created.Visit.ID, ReportParams{
		TalkingPoints: "Reviewed outcomes data.", MaterialsDistributed: false,
	})
	if err != nil {
		t.Fatalf("report: %v", err)
	}
	if reported.Visit.Version != 4 {
		t.Fatalf("version after report = %d, want 4", reported.Visit.Version)
	}
	if _, err := repo.SubmitReport(ctx, created.Visit.ID, ReportParams{TalkingPoints: "again"}); !errors.Is(err, ErrInvalidState) {
		t.Fatalf("second report: err = %v, want ErrInvalidState", err)
	}
}

// TestSecondCheckInIsAConflict covers the case the seeded data walks straight
// into: a rep opens a second visit while the first is still open. The partial
// unique index rejects it, and the repository has to translate that into
// ErrAlreadyCheckedIn rather than letting a 23505 become a 500.
func TestSecondCheckInIsAConflict(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	mr := pickMR(t, repo, cat)
	at := time.Now().UTC()
	pos := domain.Coordinates{Lat: 31.2119, Lng: 121.4661}

	first, err := repo.Create(ctx, CreateParams{MRID: mr.ID, HCPID: cat.HCPs[0].ID, ProductID: cat.Products[0].ID, PlannedAt: at.Add(time.Hour)})
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	second, err := repo.Create(ctx, CreateParams{MRID: mr.ID, HCPID: cat.HCPs[1].ID, ProductID: cat.Products[1].ID, PlannedAt: at.Add(2 * time.Hour)})
	if err != nil {
		t.Fatalf("create second: %v", err)
	}
	t.Cleanup(func() {
		_, _ = repo.pool.Exec(context.Background(), "DELETE FROM visit WHERE mr_id = $1", mr.ID)
	})

	if _, err := repo.CheckIn(ctx, first.Visit.ID, at, pos); err != nil {
		t.Fatalf("first check-in: %v", err)
	}
	if _, err := repo.CheckIn(ctx, second.Visit.ID, at, pos); !errors.Is(err, ErrAlreadyCheckedIn) {
		t.Fatalf("second check-in: err = %v, want ErrAlreadyCheckedIn", err)
	}
}

// TestBothPointsDeviatingProducesThreeFlags is the regression test for a defect
// that a UNIQUE (visit_id, code) constraint used to cause: the location rule is
// evaluated at both points, so a rep who is far from the hospital at check-in
// and again at check-out produces two LOCATION_DEVIATION rows, and the second
// insert used to abort the whole check-out with a 500.
func TestBothPointsDeviatingProducesThreeFlags(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	mr := pickMR(t, repo, cat)
	hcp := cat.HCPs[0]
	far := domain.Coordinates{Lat: hcp.BaseLat + 0.008, Lng: hcp.BaseLng} // ~890 m

	at := time.Now().UTC()
	created, err := repo.Create(ctx, CreateParams{
		MRID: mr.ID, HCPID: hcp.ID, ProductID: cat.Products[0].ID, PlannedAt: at.Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() {
		_, _ = repo.pool.Exec(context.Background(), "DELETE FROM visit WHERE id = $1", created.Visit.ID)
	})

	if _, err := repo.CheckIn(ctx, created.Visit.ID, at, far); err != nil {
		t.Fatalf("check-in: %v", err)
	}
	out, err := repo.CheckOut(ctx, created.Visit.ID, at.Add(40*time.Second), far, domain.DefaultThresholds())
	if err != nil {
		t.Fatalf("check-out must not fail when both points deviate: %v", err)
	}
	if len(out.Visit.Flags) != 3 {
		t.Fatalf("expected 3 flags (short stay + two location), got %d: %+v", len(out.Visit.Flags), out.Visit.Flags)
	}
	location := 0
	for _, f := range out.Visit.Flags {
		if f.Code == domain.RuleLocationDeviation {
			location++
		}
	}
	if location != 2 {
		t.Fatalf("expected 2 location flags (one per point), got %d", location)
	}
}

// TestTerminalLifecycle exercises the three terminal transitions against the
// real schema. The CHECK constraint in 0003 is the thing being proven: the Go
// tests use a fake repository, which cannot show that a CANCELLED row without a
// reason is actually rejected by the database.
func TestTerminalLifecycle(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}
	hcp := cat.HCPs[0]

	newPlanned := func(t *testing.T, plannedAt time.Time) Record {
		t.Helper()
		mr := pickMR(t, repo, cat)
		rec, err := repo.Create(ctx, CreateParams{
			MRID: mr.ID, HCPID: hcp.ID, ProductID: cat.Products[0].ID,
			PlannedAt: plannedAt,
		})
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		t.Cleanup(func() {
			_, _ = repo.pool.Exec(context.Background(), "DELETE FROM visit WHERE id = $1", rec.Visit.ID)
		})
		return rec
	}

	t.Run("cancel requires a reason", func(t *testing.T) {
		rec := newPlanned(t, time.Now().Add(48*time.Hour))
		if _, err := repo.Cancel(ctx, rec.Visit.ID, "  ", time.Now()); !errors.Is(err, ErrReasonRequired) {
			t.Fatalf("cancel with blank reason: err = %v, want ErrReasonRequired", err)
		}
		got, err := repo.Cancel(ctx, rec.Visit.ID, "doctor rescheduled", time.Now())
		if err != nil {
			t.Fatalf("cancel: %v", err)
		}
		if got.Visit.Status != domain.StatusCancelled || got.Visit.CancelReason != "doctor rescheduled" {
			t.Fatalf("after cancel: status=%s reason=%q", got.Visit.Status, got.Visit.CancelReason)
		}
		if got.Visit.CancelledAt == nil {
			t.Fatalf("cancelled_at was not written")
		}
		// Cancelling twice is a state conflict, not a silent no-op.
		if _, err := repo.Cancel(ctx, rec.Visit.ID, "again", time.Now()); !errors.Is(err, ErrInvalidState) {
			t.Fatalf("second cancel: err = %v, want ErrInvalidState", err)
		}
	})

	t.Run("void keeps the check-in and backfills the location rule", func(t *testing.T) {
		rec := newPlanned(t, time.Now().Add(48*time.Hour))
		// ~2.2 km east of the hospital.
		pos := domain.Coordinates{Lat: hcp.BaseLat, Lng: hcp.BaseLng + 0.02}
		if _, err := repo.CheckIn(ctx, rec.Visit.ID, time.Now().UTC(), pos); err != nil {
			t.Fatalf("check-in: %v", err)
		}
		got, err := repo.Void(ctx, rec.Visit.ID, "wrong building", time.Now(), domain.DefaultThresholds())
		if err != nil {
			t.Fatalf("void: %v", err)
		}
		if got.Visit.Status != domain.StatusVoided {
			t.Fatalf("status = %s, want VOIDED", got.Visit.Status)
		}
		if got.Visit.VoidCause != domain.VoidCauseManual {
			t.Fatalf("cause = %q, want MANUAL", got.Visit.VoidCause)
		}
		if got.Visit.CheckinAt == nil || got.Visit.CheckoutAt != nil {
			t.Fatalf("voided visit must keep check-in and have no check-out")
		}
		if len(got.Visit.Flags) == 0 {
			t.Fatalf("voiding hid the location deviation; flags were not backfilled")
		}
	})

	t.Run("delete window", func(t *testing.T) {
		rec := newPlanned(t, time.Now().Add(48*time.Hour))
		// Moving created_at back is the only way to age a row inside a test.
		if _, err := repo.pool.Exec(ctx,
			"UPDATE visit SET created_at = now() - interval '3 hours' WHERE id = $1", rec.Visit.ID); err != nil {
			t.Fatalf("age the row: %v", err)
		}
		var closed *DeleteWindowError
		if _, err := repo.Delete(ctx, rec.Visit.ID, time.Now()); !errors.As(err, &closed) {
			t.Fatalf("delete outside the window: err = %v, want DeleteWindowError", err)
		} else if closed.Reason == "" {
			t.Fatalf("DeleteWindowError must say which condition failed")
		}
	})

	t.Run("delete inside the window", func(t *testing.T) {
		rec := newPlanned(t, time.Now().Add(48*time.Hour))
		got, err := repo.Delete(ctx, rec.Visit.ID, time.Now())
		if err != nil {
			t.Fatalf("delete: %v", err)
		}
		if got.Visit.Status != domain.StatusDeleted || got.Visit.DeletedAt == nil {
			t.Fatalf("after delete: status=%s deletedAt=%v", got.Visit.Status, got.Visit.DeletedAt)
		}
		// The row must still exist: a logical delete that removes the row would
		// let the "planned" denominator shrink silently.
		var n int
		if err := repo.pool.QueryRow(ctx, "SELECT count(*) FROM visit WHERE id = $1", rec.Visit.ID).Scan(&n); err != nil {
			t.Fatalf("count: %v", err)
		}
		if n != 1 {
			t.Fatalf("row was physically removed")
		}
	})
}

// TestSnapshotSurvivesMasterDataChanges is acceptance point 9: master data is
// logical-deleted (never removed) and history must still read correctly. The
// only way to prove that is to change the master row and look at the visit
// again — a fake repository cannot show it.
func TestSnapshotSurvivesMasterDataChanges(t *testing.T) {
	repo := testRepo(t)
	ctx := context.Background()
	cat, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}
	hcp := cat.HCPs[0]
	product := cat.Products[0]
	mr := pickMR(t, repo, cat)

	rec, err := repo.Create(ctx, CreateParams{
		MRID: mr.ID, HCPID: hcp.ID, ProductID: product.ID,
		PlannedAt: time.Now().Add(48 * time.Hour),
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() {
		_, _ = repo.pool.Exec(context.Background(), "DELETE FROM visit WHERE id = $1", rec.Visit.ID)
		_, _ = repo.pool.Exec(context.Background(),
			"UPDATE hcp SET name = $2, deleted_at = NULL WHERE id = $1", hcp.ID, hcp.Name)
		_, _ = repo.pool.Exec(context.Background(),
			"UPDATE product SET name = $2, deleted_at = NULL WHERE id = $1", product.ID, product.Name)
	})

	// Rename the doctor and the product, then delete both.
	if _, err := repo.pool.Exec(ctx, "UPDATE hcp SET name = '被改过的名字' WHERE id = $1", hcp.ID); err != nil {
		t.Fatalf("rename hcp: %v", err)
	}
	if _, err := repo.pool.Exec(ctx, "UPDATE product SET name = '被改过的药品' WHERE id = $1", product.ID); err != nil {
		t.Fatalf("rename product: %v", err)
	}
	if _, err := repo.pool.Exec(ctx, "UPDATE hcp SET deleted_at = now() WHERE id = $1", hcp.ID); err != nil {
		t.Fatalf("soft delete hcp: %v", err)
	}
	if _, err := repo.pool.Exec(ctx, "UPDATE product SET deleted_at = now() WHERE id = $1", product.ID); err != nil {
		t.Fatalf("soft delete product: %v", err)
	}

	got, err := repo.Get(ctx, rec.Visit.ID)
	if err != nil {
		t.Fatalf("get after master changes: %v", err)
	}
	if got.HCPName != hcp.Name {
		t.Fatalf("hcp name = %q, want the snapshot %q", got.HCPName, hcp.Name)
	}
	if got.ProductName != product.Name {
		t.Fatalf("product name = %q, want the snapshot %q", got.ProductName, product.Name)
	}
	if got.HospitalName == "" || got.HospitalBase.Lat == 0 {
		t.Fatalf("hospital snapshot missing: %+v", got)
	}

	// A deleted doctor must disappear from the catalog (no new visits against
	// them), without taking the history with it.
	after, err := repo.Catalog(ctx)
	if err != nil {
		t.Fatalf("catalog after delete: %v", err)
	}
	for _, h := range after.HCPs {
		if h.ID == hcp.ID {
			t.Fatalf("deleted hcp is still offered in the catalog")
		}
	}
	for _, p := range after.Products {
		if p.ID == product.ID {
			t.Fatalf("deleted product is still offered in the catalog")
		}
	}
}
