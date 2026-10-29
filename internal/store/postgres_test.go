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
		                   checkin_at, checkin_lat, checkin_lng,
		                   checkout_at, checkout_lat, checkout_lng, duration_seconds)
		VALUES ($1, $2, $3, now(), 'CHECKED_OUT',
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
		                   checkin_at, checkin_lat, checkin_lng)
		VALUES ($1, $2, $3, now(), 'CHECKED_IN', now(), 91.5, 121.4)`,
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
		                   checkin_at, checkin_lat, checkin_lng,
		                   checkout_at, checkout_lat, checkout_lng, duration_seconds)
		VALUES ($1, $2, $3, now(), 'CHECKED_OUT',
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
		                   checkin_at, checkin_lat, checkin_lng)
		VALUES ($1, $2, $3, now(), 'CHECKED_IN', now(), 31.2119, 121.4661)`,
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

	before, err := repo.Dashboard(ctx, 6)
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

	after, err := repo.Dashboard(ctx, 6)
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
