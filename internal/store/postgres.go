package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/cuiju516-gif/veeva-visit-compliance/internal/domain"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Postgres is the production repository.
type Postgres struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

// NewPostgres connects, waits for the database to accept queries, and applies
// migrations. Waiting matters for docker-compose: the app and Postgres start at
// the same moment, and "just run it" has to survive that race.
func NewPostgres(ctx context.Context, dsn string, log *slog.Logger) (*Postgres, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}

	deadline := time.Now().Add(30 * time.Second)
	for {
		if err = pool.Ping(ctx); err == nil {
			break
		}
		if time.Now().After(deadline) {
			pool.Close()
			return nil, fmt.Errorf("database not reachable after 30s: %w", err)
		}
		log.Info("waiting for database", "retry_in", "1s", "err", err)
		select {
		case <-ctx.Done():
			pool.Close()
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}

	p := &Postgres{pool: pool, log: log}
	if err := p.Migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return p, nil
}

// Close releases the pool.
func (p *Postgres) Close() { p.pool.Close() }

// Pool exposes the connection pool for tests and health checks.
func (p *Postgres) Pool() *pgxpool.Pool { return p.pool }

// Migrate applies the embedded SQL files in filename order, exactly once each.
//
// A session-level advisory lock serialises concurrent starts (two replicas
// booting at once), and each file runs in its own transaction so a failure
// leaves the database at a known version rather than half-way through a file.
func (p *Postgres) Migrate(ctx context.Context) error {
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer conn.Release()

	// 0x76656576 is "veev": any stable constant works, it only has to be the
	// same in every process that might migrate this database.
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", int64(0x76656576)); err != nil {
		return fmt.Errorf("advisory lock: %w", err)
	}
	defer func() {
		_, _ = conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock($1)", int64(0x76656576))
	}()

	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    text        PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var exists bool
		if err := conn.QueryRow(ctx,
			"SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", name).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if exists {
			continue
		}

		body, err := fs.ReadFile(migrationsFS, "migrations/"+name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}

		tx, err := conn.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", name); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit %s: %w", name, err)
		}
		p.log.Info("migration applied", "version", name)
	}
	return nil
}

// visitSelect is the one projection every read uses, so a column added to the
// schema cannot quietly appear in one endpoint and not another.
const visitSelect = `
	SELECT v.id, v.mr_id, m.name,
	       v.hcp_id, h.name, h.hospital_name, h.department, h.base_lat, h.base_lng,
	       v.product_id, p.name,
	       v.planned_at, v.status,
	       v.checkin_at, v.checkin_lat, v.checkin_lng,
	       v.checkout_at, v.checkout_lat, v.checkout_lng,
	       v.duration_seconds,
	       COALESCE(v.talking_points, ''), COALESCE(v.hcp_feedback, ''), v.materials_distributed,
	       v.created_at, v.updated_at, v.version
	FROM visit v
	JOIN mr m      ON m.id = v.mr_id
	JOIN hcp h     ON h.id = v.hcp_id
	JOIN product p ON p.id = v.product_id`

func scanVisit(row pgx.Row) (Record, error) {
	var (
		rec     Record
		v       = &rec.Visit
		checkin struct {
			at  *time.Time
			lat *float64
			lng *float64
		}
		checkout struct {
			at  *time.Time
			lat *float64
			lng *float64
		}
		version int
		dur     *int
	)
	err := row.Scan(
		&v.ID, &v.MRID, &rec.MRName,
		&v.HCPID, &rec.HCPName, &rec.HospitalName, &rec.Department, &rec.HospitalBase.Lat, &rec.HospitalBase.Lng,
		&v.ProductID, &rec.ProductName,
		&v.PlannedAt, &v.Status,
		&checkin.at, &checkin.lat, &checkin.lng,
		&checkout.at, &checkout.lat, &checkout.lng,
		&dur,
		&v.TalkingPoints, &v.HCPFeedback, &v.MaterialsDistributed,
		&v.CreatedAt, &v.UpdatedAt, &version,
	)
	if err != nil {
		return Record{}, err
	}
	v.Version = version

	if checkin.at != nil {
		v.CheckinAt = checkin.at
		v.CheckinPos = &domain.Coordinates{Lat: *checkin.lat, Lng: *checkin.lng}
	}
	if checkout.at != nil {
		v.CheckoutAt = checkout.at
		v.CheckoutPos = &domain.Coordinates{Lat: *checkout.lat, Lng: *checkout.lng}
	}
	if dur != nil {
		v.Duration = time.Duration(*dur) * time.Second
	}
	return rec, nil
}

// loadFlags and loadMaterials fill in the child collections for a batch of
// visits in one query each, so listing 200 visits stays at three round trips.

func (p *Postgres) loadFlags(ctx context.Context, records []Record) error {
	if len(records) == 0 {
		return nil
	}
	ids := make([]string, len(records))
	index := make(map[string]int, len(records))
	for i, r := range records {
		ids[i] = r.Visit.ID
		index[r.Visit.ID] = i
		records[i].Visit.Flags = []domain.Flag{}
	}
	rows, err := p.pool.Query(ctx,
		"SELECT visit_id, code, detail FROM visit_flag WHERE visit_id = ANY($1) ORDER BY code", ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			id, code, detail string
		)
		if err := rows.Scan(&id, &code, &detail); err != nil {
			return err
		}
		i := index[id]
		records[i].Visit.Flags = append(records[i].Visit.Flags, domain.Flag{Code: domain.RuleCode(code), Detail: detail})
	}
	return rows.Err()
}

func (p *Postgres) loadMaterials(ctx context.Context, records []Record) error {
	if len(records) == 0 {
		return nil
	}
	ids := make([]string, len(records))
	index := make(map[string]int, len(records))
	for i, r := range records {
		ids[i] = r.Visit.ID
		index[r.Visit.ID] = i
		records[i].Materials = []Material{}
	}
	rows, err := p.pool.Query(ctx,
		"SELECT visit_id, name, kind FROM visit_material WHERE visit_id = ANY($1) ORDER BY kind, name", ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			id string
			m  Material
		)
		if err := rows.Scan(&id, &m.Name, &m.Kind); err != nil {
			return err
		}
		i := index[id]
		records[i].Materials = append(records[i].Materials, m)
	}
	return rows.Err()
}

// Get returns one visit with its flags and materials.
func (p *Postgres) Get(ctx context.Context, id string) (Record, error) {
	rec, err := scanVisit(p.pool.QueryRow(ctx, visitSelect+" WHERE v.id = $1", id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, ErrNotFound
	}
	if err != nil {
		return Record{}, err
	}
	recs := []Record{rec}
	if err := p.loadFlags(ctx, recs); err != nil {
		return Record{}, err
	}
	if err := p.loadMaterials(ctx, recs); err != nil {
		return Record{}, err
	}
	return recs[0], nil
}

// List returns visits newest planned first.
func (p *Postgres) List(ctx context.Context, lp ListParams) ([]Record, error) {
	if lp.Limit <= 0 || lp.Limit > 200 {
		lp.Limit = 50
	}

	sql := visitSelect
	args := []any{}
	where := " WHERE 1 = 1"
	if lp.Status != "" {
		args = append(args, string(lp.Status))
		where += fmt.Sprintf(" AND v.status = $%d", len(args))
	}
	if lp.ProductID != "" {
		args = append(args, lp.ProductID)
		where += fmt.Sprintf(" AND v.product_id = $%d", len(args))
	}
	args = append(args, lp.Limit)
	sql += where + fmt.Sprintf(" ORDER BY v.planned_at DESC LIMIT $%d", len(args))

	rows, err := p.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []Record{}
	for rows.Next() {
		rec, err := scanVisit(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := p.loadFlags(ctx, records); err != nil {
		return nil, err
	}
	if err := p.loadMaterials(ctx, records); err != nil {
		return nil, err
	}
	return records, nil
}

// Catalog returns the reference data for the forms.
func (p *Postgres) Catalog(ctx context.Context) (Catalog, error) {
	var cat Catalog

	rows, err := p.pool.Query(ctx, "SELECT id, name, region FROM mr ORDER BY name")
	if err != nil {
		return cat, err
	}
	for rows.Next() {
		var m MR
		if err := rows.Scan(&m.ID, &m.Name, &m.Region); err != nil {
			rows.Close()
			return cat, err
		}
		cat.MRs = append(cat.MRs, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return cat, err
	}

	rows, err = p.pool.Query(ctx,
		"SELECT id, name, hospital_name, department, base_lat, base_lng FROM hcp ORDER BY hospital_name, department")
	if err != nil {
		return cat, err
	}
	for rows.Next() {
		var h HCP
		if err := rows.Scan(&h.ID, &h.Name, &h.HospitalName, &h.Department, &h.BaseLat, &h.BaseLng); err != nil {
			rows.Close()
			return cat, err
		}
		cat.HCPs = append(cat.HCPs, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return cat, err
	}

	rows, err = p.pool.Query(ctx, "SELECT id, code, name FROM product ORDER BY name")
	if err != nil {
		return cat, err
	}
	defer rows.Close()
	for rows.Next() {
		var pr Product
		if err := rows.Scan(&pr.ID, &pr.Code, &pr.Name); err != nil {
			return cat, err
		}
		cat.Products = append(cat.Products, pr)
	}
	return cat, rows.Err()
}

// Create inserts a planned visit (step 1).
func (p *Postgres) Create(ctx context.Context, in CreateParams) (Record, error) {
	var id string
	err := p.pool.QueryRow(ctx, `
		INSERT INTO visit (mr_id, hcp_id, product_id, planned_at, status)
		VALUES ($1, $2, $3, $4, 'PLANNED')
		RETURNING id`,
		in.MRID, in.HCPID, in.ProductID, in.PlannedAt).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" { // foreign_key_violation
			return Record{}, fmt.Errorf("%w: unknown mr, hcp or product", ErrNotFound)
		}
		return Record{}, err
	}
	return p.Get(ctx, id)
}

// CheckIn records the arrival (step 2).
//
// The state guard lives in the WHERE clause rather than in Go: that makes the
// transition atomic without a read-then-write race, and a double-submitted
// check-in from a flaky client can only ever succeed once.
func (p *Postgres) CheckIn(ctx context.Context, id string, at time.Time, pos domain.Coordinates) (Record, error) {
	tag, err := p.pool.Exec(ctx, `
		UPDATE visit
		   SET status = 'CHECKED_IN',
		       checkin_at = $2, checkin_lat = $3, checkin_lng = $4,
		       version = version + 1, updated_at = now()
		 WHERE id = $1 AND status = 'PLANNED'`,
		id, at, pos.Lat, pos.Lng)
	if err != nil {
		// A rep who is already checked in elsewhere trips the partial unique
		// index. That is a conflict between two valid requests, not a server
		// fault, so it must not surface as a 500.
		if isUniqueViolation(err, "uq_visit_mr_active") {
			return Record{}, ErrAlreadyCheckedIn
		}
		return Record{}, err
	}
	if tag.RowsAffected() == 0 {
		return Record{}, p.classifyMiss(ctx, id, "check-in")
	}
	return p.Get(ctx, id)
}

// CheckOut records the departure and derives the duration and compliance flags
// (step 4). Duration and flags are computed here, on the server, from the
// stored check-in: a client cannot submit either of them.
func (p *Postgres) CheckOut(ctx context.Context, id string, at time.Time, pos domain.Coordinates, th domain.Thresholds) (Record, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return Record{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Lock the row so a report cannot land between our read and our write.
	rec, err := scanVisit(tx.QueryRow(ctx, visitSelect+" WHERE v.id = $1 FOR UPDATE OF v", id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, ErrNotFound
	}
	if err != nil {
		return Record{}, err
	}
	if rec.Visit.Status != domain.StatusCheckedIn || rec.Visit.CheckinAt == nil {
		return Record{}, &StateError{Status: rec.Visit.Status, Action: "check out"}
	}

	duration, err := domain.StayDuration(*rec.Visit.CheckinAt, at)
	if err != nil {
		return Record{}, err
	}
	flags, err := domain.Evaluate(domain.EvaluationInput{
		CheckinAt:    *rec.Visit.CheckinAt,
		CheckoutAt:   at,
		Checkin:      *rec.Visit.CheckinPos,
		Checkout:     pos,
		HospitalBase: rec.HospitalBase,
		Thresholds:   th,
	})
	if err != nil {
		return Record{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE visit
		   SET status = 'CHECKED_OUT',
		       checkout_at = $2, checkout_lat = $3, checkout_lng = $4,
		       duration_seconds = floor(extract(epoch FROM ($2 - checkin_at)))::int,
		       version = version + 1, updated_at = now()
		 WHERE id = $1`,
		id, at, pos.Lat, pos.Lng); err != nil {
		return Record{}, err
	}

	// Replace, never append: re-evaluating a visit must not accumulate flags.
	if _, err := tx.Exec(ctx, "DELETE FROM visit_flag WHERE visit_id = $1", id); err != nil {
		return Record{}, err
	}
	for _, f := range flags {
		if _, err := tx.Exec(ctx,
			"INSERT INTO visit_flag (visit_id, code, detail) VALUES ($1, $2, $3)",
			id, string(f.Code), f.Detail); err != nil {
			return Record{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Record{}, err
	}
	p.log.Info("visit checked out", "visit", id, "duration_s", int(duration.Seconds()), "flags", len(flags))
	return p.Get(ctx, id)
}

// SubmitReport stores the call report (step 5).
func (p *Postgres) SubmitReport(ctx context.Context, id string, in ReportParams) (Record, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return Record{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE visit
		   SET status = 'REPORTED',
		       talking_points = $2, hcp_feedback = $3, materials_distributed = $4,
		       version = version + 1, updated_at = now()
		 WHERE id = $1 AND status = 'CHECKED_OUT'`,
		id, in.TalkingPoints, in.HCPFeedback, in.MaterialsDistributed)
	if err != nil {
		return Record{}, err
	}
	if tag.RowsAffected() == 0 {
		return Record{}, p.classifyMiss(ctx, id, "report")
	}

	if _, err := tx.Exec(ctx, "DELETE FROM visit_material WHERE visit_id = $1", id); err != nil {
		return Record{}, err
	}
	for _, m := range in.Materials {
		if _, err := tx.Exec(ctx,
			"INSERT INTO visit_material (visit_id, name, kind) VALUES ($1, $2, $3)",
			id, m.Name, m.Kind); err != nil {
			return Record{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Record{}, err
	}
	return p.Get(ctx, id)
}

// isUniqueViolation reports whether err is a unique violation on a specific
// constraint. Matching on the constraint name rather than the SQLSTATE alone
// keeps unrelated unique violations from being mislabelled.
func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}

// classifyMiss turns "the UPDATE matched nothing" into the right error: a
// missing row is 404, an existing row in the wrong state is 409.
func (p *Postgres) classifyMiss(ctx context.Context, id, action string) error {
	var status string
	err := p.pool.QueryRow(ctx, "SELECT status FROM visit WHERE id = $1", id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	return &StateError{Status: domain.Status(status), Action: action}
}

// Dashboard aggregates visits per product per month (the brief's reporting
// requirement), counting by check-in month in the business timezone.
func (p *Postgres) Dashboard(ctx context.Context, months int) (Dashboard, error) {
	if months <= 0 || months > 24 {
		months = 6
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return Dashboard{}, err
	}

	now := time.Now().In(loc)
	firstMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, -(months - 1), 0)

	rows, err := p.pool.Query(ctx, `
		SELECT to_char(date_trunc('month', v.checkin_at AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM') AS month,
		       p.id, p.name,
		       -- DISTINCT is load-bearing: the flag join multiplies a visit by
		       -- its number of flags, so a visit flagged for both a short stay
		       -- and a location deviation would otherwise be counted twice.
		       count(DISTINCT v.id) AS visits,
		       count(DISTINCT v.id) FILTER (WHERE f.visit_id IS NOT NULL) AS abnormal
		  FROM visit v
		  JOIN product p ON p.id = v.product_id
		  LEFT JOIN visit_flag f ON f.visit_id = v.id
		 WHERE v.checkin_at IS NOT NULL
		   AND v.checkin_at >= $1
		 GROUP BY 1, 2, 3
		 ORDER BY 1, 3`, firstMonth)
	if err != nil {
		return Dashboard{}, err
	}
	defer rows.Close()

	out := Dashboard{Months: monthRange(firstMonth, months), Rows: []MonthlyRow{}}
	for rows.Next() {
		var r MonthlyRow
		if err := rows.Scan(&r.Month, &r.ProductID, &r.ProductName, &r.Visits, &r.Abnormal); err != nil {
			return Dashboard{}, err
		}
		if r.Visits > 0 {
			r.AbnormalShare = float64(r.Abnormal) / float64(r.Visits)
		}
		out.TotalVisits += r.Visits
		out.TotalAbnormal += r.Abnormal
		out.Rows = append(out.Rows, r)
	}
	return out, rows.Err()
}

// monthRange builds the ordered "YYYY-MM" labels from firstMonth to now.
func monthRange(first time.Time, months int) []string {
	out := make([]string, 0, months)
	for i := 0; i < months; i++ {
		out = append(out, first.AddDate(0, i, 0).Format("2006-01"))
	}
	return out
}
