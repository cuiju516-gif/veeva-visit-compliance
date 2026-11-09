package store

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"
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
//
// hcp and product are deliberately *not* joined: the row carries its own
// snapshot, so renaming or deleting master data cannot rewrite history.
//
// The string ends with a newline on purpose. Callers append " WHERE …" to it,
// and a trailing "--" comment would swallow the condition: the query would then
// have no placeholders and fail with a bewildering "expected 0 arguments".
const visitSelect = `
	SELECT v.id, v.mr_id, m.name,
	       v.hcp_id, v.hcp_name, v.hospital_name, v.department, v.base_lat, v.base_lng,
	       v.product_id, v.product_name,
	       v.planned_at, v.status,
	       v.checkin_at, v.checkin_lat, v.checkin_lng,
	       v.checkout_at, v.checkout_lat, v.checkout_lng,
	       v.duration_seconds,
	       COALESCE(v.talking_points, ''), COALESCE(v.hcp_feedback, ''), v.materials_distributed,
	       COALESCE(v.cancel_reason, ''), v.cancelled_at, COALESCE(v.void_reason, ''),
	       COALESCE(v.void_cause, ''), v.voided_at, v.deleted_at, v.reported_at,
	       v.evaluation, COALESCE(v.rule_version, ''),
	       v.created_at, v.updated_at, v.version
	FROM visit v
	JOIN mr m ON m.id = v.mr_id
	`

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
		version    int
		dur        *int
		evaluation []byte
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
		&v.CancelReason, &v.CancelledAt, &v.VoidReason,
		&v.VoidCause, &v.VoidedAt, &v.DeletedAt, &v.ReportedAt,
		&evaluation, &v.RuleVersion,
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
	if len(evaluation) > 0 {
		var snap domain.Evaluation
		if err := json.Unmarshal(evaluation, &snap); err != nil {
			return Record{}, fmt.Errorf("decode evaluation: %w", err)
		}
		v.Evaluation = &snap
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
	if err := p.markReportOverdue(ctx, recs); err != nil {
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
	if lp.MRID != "" {
		args = append(args, lp.MRID)
		where += fmt.Sprintf(" AND v.mr_id = $%d", len(args))
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
	if err := p.markReportOverdue(ctx, records); err != nil {
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

	rows, err = p.pool.Query(ctx, `
		SELECT h.id, h.name, ho.name, h.department, ho.base_lat, ho.base_lng, ho.id
		  FROM hcp h
		  JOIN hospital ho ON ho.id = h.hospital_id
		 WHERE h.deleted_at IS NULL AND h.status = 'ACTIVE'
		   AND ho.deleted_at IS NULL AND ho.status = 'ACTIVE'
		 ORDER BY ho.name, h.department`)
	if err != nil {
		return cat, err
	}
	for rows.Next() {
		var h HCP
		if err := rows.Scan(&h.ID, &h.Name, &h.HospitalName, &h.Department, &h.BaseLat, &h.BaseLng, &h.HospitalID); err != nil {
			rows.Close()
			return cat, err
		}
		cat.HCPs = append(cat.HCPs, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return cat, err
	}

	rows, err = p.pool.Query(ctx, `
		SELECT id, code, name FROM product
		 WHERE deleted_at IS NULL AND status = 'ACTIVE'
		 ORDER BY name`)
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
	// The snapshot is written here, once, from the master data as it stands now.
	// Every later read uses it, so a rename or a logical delete cannot rewrite
	// what this visit looked like when it was planned.
	err := p.pool.QueryRow(ctx, `
		INSERT INTO visit (
			mr_id, hcp_id, product_id, planned_at, status,
			hcp_name, department, hospital_name, base_lat, base_lng, product_name)
		SELECT $1, h.id, pr.id, $4, 'PLANNED',
		       h.name, h.department, ho.name, ho.base_lat, ho.base_lng, pr.name
		  FROM hcp h
		  JOIN hospital ho ON ho.id = h.hospital_id
		  JOIN product pr ON pr.id = $3
		 WHERE h.id = $2
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
func (p *Postgres) CheckOut(ctx context.Context, id string, at time.Time, pos domain.Coordinates) (Record, error) {
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

	// The thresholds come from the rules table, not from the process config: the
	// point of versioning them is that the row decides, and the snapshot records
	// which row was in force.
	rules, err := p.CurrentRules(ctx)
	if err != nil {
		return Record{}, err
	}
	evaluation, err := domain.Snapshot(domain.EvaluationInput{
		CheckinAt:    *rec.Visit.CheckinAt,
		CheckoutAt:   at,
		Checkin:      *rec.Visit.CheckinPos,
		Checkout:     pos,
		HospitalBase: rec.HospitalBase,
		Thresholds:   rules.Thresholds(),
		RuleVersion:  rules.Version,
		EvaluatedAt:  at,
		Source:       "checkout",
	})
	if err != nil {
		return Record{}, err
	}
	flags := evaluation.Flags
	payload, err := json.Marshal(evaluation)
	if err != nil {
		return Record{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE visit
		   SET status = 'CHECKED_OUT',
		       checkout_at = $2, checkout_lat = $3, checkout_lng = $4,
		       duration_seconds = floor(extract(epoch FROM ($2 - checkin_at)))::int,
		       evaluation = $5, rule_version = $6,
		       version = version + 1, updated_at = now()
		 WHERE id = $1`,
		id, at, pos.Lat, pos.Lng, payload, rules.Version); err != nil {
		return Record{}, err
	}

	// Replace, never append: re-evaluating a visit must not accumulate flags.
	if _, err := tx.Exec(ctx, "DELETE FROM visit_flag WHERE visit_id = $1", id); err != nil {
		return Record{}, err
	}
	for _, f := range flags {
		if _, err := tx.Exec(ctx,
			"INSERT INTO visit_flag (visit_id, code, detail, rule_version) VALUES ($1, $2, $3, $4)",
			id, string(f.Code), f.Detail, rules.Version); err != nil {
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
		       reported_at = now(),
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
// Dashboard aggregates per product per month. A non-empty mrid restricts every
// number to that rep; that is what "my dashboard" means, and it is applied in
// SQL rather than by filtering rows afterwards.
func (p *Postgres) Dashboard(ctx context.Context, months int, mrid string) (Dashboard, error) {
	if months <= 0 || months > 24 {
		months = 6
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return Dashboard{}, err
	}

	now := time.Now().In(loc)
	firstMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, -(months - 1), 0)

	// One row per (month, product). The five counters are computed from the
	// state, never from the flag join: joining flags would multiply a visit by
	// its number of findings and inflate "visits" — the bug this query exists to
	// avoid. "Abnormal" is read from the evaluation snapshot instead.
	rows, err := p.pool.Query(ctx, `
		SELECT to_char(date_trunc('month', COALESCE(v.checkin_at, v.planned_at) AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM') AS month,
		       v.product_id, v.product_name,
		       -- visits = the three terminals only: a plan that has not happened
		       -- is not a visit, which keeps visits = done + cancelled + voided
		       -- exact (deleted is excluded by the WHERE, open states here).
		       count(*) FILTER (WHERE v.status NOT IN ('PLANNED', 'CHECKED_IN')) AS visits,
		       count(*) FILTER (WHERE v.status IN ('CHECKED_OUT', 'REPORTED')) AS done,
		       count(*) FILTER (WHERE v.status IN ('CHECKED_OUT', 'REPORTED')
		                          AND COALESCE((v.evaluation->>'abnormal')::boolean, false) = false) AS effective,
		       count(*) FILTER (WHERE v.status IN ('CHECKED_OUT', 'REPORTED')
		                          AND COALESCE((v.evaluation->>'abnormal')::boolean, false)) AS abnormal,
		       count(*) FILTER (WHERE v.status = 'CANCELLED') AS cancelled,
		       count(*) FILTER (WHERE v.status = 'VOIDED') AS voided
		  FROM visit v
		 WHERE v.status <> 'DELETED'
		   AND COALESCE(v.checkin_at, v.planned_at) >= $1
		   AND ($2 = '' OR v.mr_id = $2::uuid)
		 GROUP BY 1, 2, 3
		 ORDER BY 1, 3`, firstMonth, mrid)
	if err != nil {
		return Dashboard{}, err
	}
	defer rows.Close()

	out := Dashboard{Months: monthRange(firstMonth, months), Rows: []MonthlyRow{}}
	for rows.Next() {
		var r MonthlyRow
		if err := rows.Scan(&r.Month, &r.ProductID, &r.ProductName,
			&r.Visits, &r.Done, &r.Effective, &r.Abnormal, &r.Cancelled, &r.Voided); err != nil {
			return Dashboard{}, err
		}
		// The share's denominator is "done", not "visits": a cancelled plan is
		// not a visit that went wrong, and mixing them would let a rep improve
		// the abnormality rate by cancelling more.
		if r.Done > 0 {
			r.AbnormalShare = float64(r.Abnormal) / float64(r.Done)
		}
		out.TotalVisits += r.Visits
		out.TotalDone += r.Done
		out.TotalEffective += r.Effective
		out.TotalAbnormal += r.Abnormal
		out.TotalCancelled += r.Cancelled
		out.TotalVoided += r.Voided
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

// Cancel ends a plan that never happened.
//
// The reason is required at the API layer; it is re-checked here because the
// store is the last place that can refuse to write a CANCELLED row with no
// explanation, and chk_visit_state_evidence would reject it anyway — with a
// message about constraints rather than about the missing reason.
func (p *Postgres) Cancel(ctx context.Context, id, reason string, at time.Time) (Record, error) {
	if strings.TrimSpace(reason) == "" {
		return Record{}, ErrReasonRequired
	}
	tag, err := p.pool.Exec(ctx, `
		UPDATE visit
		   SET status = 'CANCELLED', cancel_reason = $2, cancelled_at = $3,
		       version = version + 1, updated_at = now()
		 WHERE id = $1 AND status = 'PLANNED'`,
		id, reason, at)
	if err != nil {
		return Record{}, err
	}
	if tag.RowsAffected() == 0 {
		return Record{}, p.classifyMiss(ctx, id, "cancel")
	}
	return p.Get(ctx, id)
}

// Void marks an attended visit as not counting.
//
// It is only legal before check-out: once the verdict exists, letting the rep
// withdraw the visit would make the verdict advisory (docs/契约.md §3.4).
//
// The location rule is re-run against the check-in point inside the same
// transaction. A voided visit can leave the "completed" count, but it must not
// take its abnormality with it — that is the whole anti-cheat design.
func (p *Postgres) Void(ctx context.Context, id, reason string, at time.Time) (Record, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return Record{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := p.voidInTx(ctx, tx, id, reason, domain.VoidCauseManual, at); err != nil {
		return Record{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Record{}, err
	}
	return p.Get(ctx, id)
}

// voidInTx is the shared body of a manual and a timed-out void.
//
// The cause is a parameter rather than a follow-up UPDATE: the earlier version
// wrote the row and then patched void_cause in a second statement, which meant a
// crash in between produced a void with the wrong cause — an audit trail that
// lies is worse than no audit trail.
func (p *Postgres) voidInTx(
	ctx context.Context, tx pgx.Tx, id, reason, cause string, at time.Time,
) (domain.Evaluation, error) {
	if strings.TrimSpace(reason) == "" {
		return domain.Evaluation{}, ErrReasonRequired
	}

	rec, err := scanVisit(tx.QueryRow(ctx, visitSelect+" WHERE v.id = $1 FOR UPDATE OF v", id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Evaluation{}, ErrNotFound
	}
	if err != nil {
		return domain.Evaluation{}, err
	}
	if rec.Visit.Status != domain.StatusCheckedIn || rec.Visit.CheckinPos == nil {
		return domain.Evaluation{}, &StateError{Status: rec.Visit.Status, Action: "void"}
	}

	rules, err := p.CurrentRules(ctx)
	if err != nil {
		return domain.Evaluation{}, err
	}
	evaluation, err := domain.SnapshotCheckinPoint(domain.EvaluationInput{
		Checkin:      *rec.Visit.CheckinPos,
		HospitalBase: rec.HospitalBase,
		Thresholds:   rules.Thresholds(),
		RuleVersion:  rules.Version,
		EvaluatedAt:  at,
		Source:       "void_backfill",
	})
	if err != nil {
		return domain.Evaluation{}, err
	}
	flags := evaluation.Flags
	payload, err := json.Marshal(evaluation)
	if err != nil {
		return domain.Evaluation{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE visit
		   SET status = 'VOIDED', void_reason = $2, void_cause = $3, voided_at = $4,
		       evaluation = $5, rule_version = $6,
		       version = version + 1, updated_at = now()
		 WHERE id = $1`,
		id, reason, cause, at, payload, rules.Version); err != nil {
		return domain.Evaluation{}, err
	}

	// Replace, never append: re-running a void must not accumulate evidence.
	if _, err := tx.Exec(ctx, "DELETE FROM visit_flag WHERE visit_id = $1", id); err != nil {
		return domain.Evaluation{}, err
	}
	for _, f := range flags {
		if _, err := tx.Exec(ctx,
			"INSERT INTO visit_flag (visit_id, code, detail, rule_version) VALUES ($1, $2, $3, $4)",
			id, string(f.Code), f.Detail, rules.Version); err != nil {
			return domain.Evaluation{}, err
		}
	}
	p.log.Info("visit voided", "visit", id, "cause", cause, "backfilled_flags", len(flags))
	return evaluation, nil
}

// Delete is a logical delete: the row stays, the visit leaves every denominator.
//
// The window is checked in Go rather than in the UPDATE's WHERE clause so that a
// refused delete can explain *which* of the two conditions failed — "created too
// long ago" and "starts too soon" call for different next actions.
func (p *Postgres) Delete(ctx context.Context, id string, now time.Time) (Record, error) {
	rec, err := p.Get(ctx, id)
	if err != nil {
		return Record{}, err
	}
	if rec.Visit.Status != domain.StatusPlanned {
		return Record{}, &StateError{Status: rec.Visit.Status, Action: "delete"}
	}
	if !domain.DeleteWindowOpen(rec.Visit.CreatedAt, rec.Visit.PlannedAt, now) {
		return Record{}, &DeleteWindowError{Reason: domain.DeleteWindowReport(rec.Visit.CreatedAt, rec.Visit.PlannedAt, now)}
	}

	tag, err := p.pool.Exec(ctx, `
		UPDATE visit
		   SET status = 'DELETED', deleted_at = $2,
		       version = version + 1, updated_at = now()
		 WHERE id = $1 AND status = 'PLANNED'`,
		id, now)
	if err != nil {
		return Record{}, err
	}
	if tag.RowsAffected() == 0 {
		return Record{}, p.classifyMiss(ctx, id, "delete")
	}
	return p.Get(ctx, id)
}

// CurrentRules returns the threshold version in force.
//
// "Latest" is by created_at, not by version string: v10 sorts before v9 as text,
// and an ordering bug here would silently evaluate new visits against old
// thresholds — the exact failure this table exists to prevent.
func (p *Postgres) CurrentRules(ctx context.Context) (RuleVersion, error) {
	var r RuleVersion
	err := p.pool.QueryRow(ctx, `
		SELECT version, min_duration_sec, max_distance_m, timeout_hours, report_timeout_hours,
		       created_at, created_by, note
		  FROM rule_version
		 ORDER BY created_at DESC, version DESC
		 LIMIT 1`).
		Scan(&r.Version, &r.MinDurationSeconds, &r.MaxDistanceMeters,
			&r.TimeoutHours, &r.ReportTimeoutHours, &r.CreatedAt, &r.CreatedBy, &r.Note)
	if errors.Is(err, pgx.ErrNoRows) {
		return RuleVersion{}, ErrNotFound
	}
	if err != nil {
		return RuleVersion{}, err
	}
	return r, nil
}

// SetRules creates a new threshold version when the numbers actually change.
//
// Returning the existing version on a no-op keeps the history honest: a client
// that saves twice does not manufacture a version that never differed. The
// insert is serialised behind an advisory lock so two administrators saving at
// once cannot both claim v3.
func (p *Postgres) SetRules(ctx context.Context, th domain.Thresholds, by, note string) (RuleVersion, error) {
	if err := th.Validate(); err != nil {
		return RuleVersion{}, err
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return RuleVersion{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", int64(0x72756c65)); err != nil { // "rule"
		return RuleVersion{}, err
	}

	current, err := p.currentRulesTx(ctx, tx)
	if err != nil {
		return RuleVersion{}, err
	}
	if current.MinDurationSeconds == th.MinDurationSeconds &&
		current.MaxDistanceMeters == th.MaxDistanceMeters {
		if err := tx.Commit(ctx); err != nil {
			return RuleVersion{}, err
		}
		return current, nil
	}

	var next string
	if err := tx.QueryRow(ctx, `
		SELECT 'v' || (COALESCE(MAX(NULLIF(regexp_replace(version, '\D', '', 'g'), '')::int), 0) + 1)
		  FROM rule_version`).Scan(&next); err != nil {
		return RuleVersion{}, err
	}

	var out RuleVersion
	if err := tx.QueryRow(ctx, `
		INSERT INTO rule_version (version, min_duration_sec, max_distance_m, created_by, note)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING version, min_duration_sec, max_distance_m, created_at, created_by, note`,
		next, th.MinDurationSeconds, th.MaxDistanceMeters, by, note).
		Scan(&out.Version, &out.MinDurationSeconds, &out.MaxDistanceMeters,
			&out.CreatedAt, &out.CreatedBy, &out.Note); err != nil {
		return RuleVersion{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RuleVersion{}, err
	}
	return out, nil
}

func (p *Postgres) currentRulesTx(ctx context.Context, tx pgx.Tx) (RuleVersion, error) {
	var r RuleVersion
	err := tx.QueryRow(ctx, `
		SELECT version, min_duration_sec, max_distance_m, timeout_hours, report_timeout_hours,
		       created_at, created_by, note
		  FROM rule_version
		 ORDER BY created_at DESC, version DESC
		 LIMIT 1`).
		Scan(&r.Version, &r.MinDurationSeconds, &r.MaxDistanceMeters,
			&r.TimeoutHours, &r.ReportTimeoutHours, &r.CreatedAt, &r.CreatedBy, &r.Note)
	if errors.Is(err, pgx.ErrNoRows) {
		return RuleVersion{}, ErrNotFound
	}
	return r, err
}

// Converge applies the timeout transitions that are due.
//
// There is no background job: the sweep runs at the start of every read, which
// means "the database is correct" and "someone looked at it" are the same
// statement. That is a deliberate trade (docs/契约.md §5.4): reads become
// writes, but no visit can sit in a stale state because a cron job was down.
//
// Both edges are written so that a concurrent reader cannot double-apply them:
// the plan edge is a single conditional UPDATE, and the visit edge takes its
// candidates with FOR UPDATE SKIP LOCKED.
func (p *Postgres) Converge(ctx context.Context, now time.Time) (ConvergeResult, error) {
	rules, err := p.CurrentRules(ctx)
	if err != nil {
		return ConvergeResult{}, err
	}
	var out ConvergeResult

	// ① A plan whose time has passed by more than the timeout never happened.
	// One statement, no locking needed: the WHERE clause is the guard.
	tag, err := p.pool.Exec(ctx, `
		UPDATE visit
		   SET status = 'CANCELLED',
		       cancel_reason = '超时未签到（系统代取消）',
		       cancelled_at = $1,
		       version = version + 1, updated_at = now()
		 WHERE status = 'PLANNED'
		   AND planned_at < $1::timestamptz - ($2::int * interval '1 hour')`,
		now, rules.TimeoutHours)
	if err != nil {
		return out, err
	}
	out.Cancelled = int(tag.RowsAffected())

	// ② A visit checked in and never checked out is voided, with the same
	// location backfill a manual void would have produced.
	//
	// This edge needs Go (the rule engine runs before the write), so it is a
	// batch loop rather than one statement. Batching is what keeps a large
	// backlog from turning one sweep into a long transaction: after a weekend of
	// downtime there can be thousands of expired visits, and holding every row
	// lock until the end would block reps checking in.
	for batch := 0; batch < convergeMaxBatches; batch++ {
		n, err := p.convergeVisitBatch(ctx, now, rules)
		if err != nil {
			return out, err
		}
		out.Voided += n
		if n < convergeBatchSize {
			break
		}
	}
	return out, nil
}

const (
	// convergeBatchSize bounds how many rows one transaction touches. Small enough
	// that the locks are held briefly; large enough that the common case is one
	// round trip.
	convergeBatchSize = 100
	// convergeMaxBatches stops a sweep from running unbounded when the backlog is
	// enormous: 10 batches per tick still drains 200 visits a minute, and the rest
	// waits for the next tick instead of blocking readers.
	convergeMaxBatches = 10
)

// convergeVisitBatch voids up to convergeBatchSize expired check-ins and returns
// how many it applied.
func (p *Postgres) convergeVisitBatch(ctx context.Context, now time.Time, rules RuleVersion) (int, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The locks must live in the same transaction as the writes: taking them with
	// a bare Query releases them when the statement ends, so two sweeps could
	// select the same row and the loser would fail on the state guard. Harmless,
	// but a background job retries every tick, and a warning per tick per instance
	// is how a real problem gets buried.
	rows, err := tx.Query(ctx, `
		SELECT id FROM visit
		 WHERE status = 'CHECKED_IN'
		   AND checkin_at < $1::timestamptz - ($2::int * interval '1 hour')
		 ORDER BY checkin_at
		 LIMIT $3
		 FOR UPDATE SKIP LOCKED`,
		now, rules.TimeoutHours, convergeBatchSize)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	applied := 0
	for _, id := range ids {
		// Reuse the manual path so a system void and a rep void produce the same
		// evidence; only the cause differs.
		if _, err := p.voidInTx(ctx, tx, id, "超时未签退（系统作废）", domain.VoidCauseTimeout, now); err != nil {
			var stateErr *StateError
			if errors.As(err, &stateErr) {
				// Someone (another sweep, or the rep) got there first.
				continue
			}
			return applied, err
		}
		applied++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return applied, nil
}

// markReportOverdue fills the derived "the report is late" flag.
//
// It is computed on read rather than stored, so it can never disagree with the
// clock, and it costs one small query per page rather than one per row.
func (p *Postgres) markReportOverdue(ctx context.Context, recs []Record) error {
	if len(recs) == 0 {
		return nil
	}
	rules, err := p.CurrentRules(ctx)
	if err != nil {
		return err
	}
	cutoff := time.Now().Add(-time.Duration(rules.ReportTimeoutHours) * time.Hour)
	for i := range recs {
		v := &recs[i].Visit
		if v.Status != domain.StatusCheckedOut || v.CheckoutAt == nil {
			continue
		}
		recs[i].ReportOverdue = v.CheckoutAt.Before(cutoff)
	}
	return nil
}

// RuleHistory returns the most recent versions, newest first. It exists so the
// administrator can see what changed and when, not just what is in force.
func (p *Postgres) RuleHistory(ctx context.Context, limit int) ([]RuleVersion, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := p.pool.Query(ctx, `
		SELECT version, min_duration_sec, max_distance_m, timeout_hours, report_timeout_hours,
		       created_at, created_by, note
		  FROM rule_version
		 ORDER BY created_at DESC, version DESC
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RuleVersion{}
	for rows.Next() {
		var r RuleVersion
		if err := rows.Scan(&r.Version, &r.MinDurationSeconds, &r.MaxDistanceMeters,
			&r.TimeoutHours, &r.ReportTimeoutHours, &r.CreatedAt, &r.CreatedBy, &r.Note); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetRulesWithTimeouts is SetRules plus the two timeouts, which share the same
// version. Keeping them in one call means a save can never bump the compliance
// thresholds while silently leaving a stale timeout in force.
func (p *Postgres) SetRulesWithTimeouts(
	ctx context.Context, th domain.Thresholds, timeoutHours, reportTimeoutHours int, by, note string,
) (RuleVersion, error) {
	if err := th.Validate(); err != nil {
		return RuleVersion{}, err
	}
	if timeoutHours <= 0 || reportTimeoutHours <= 0 {
		return RuleVersion{}, fmt.Errorf("%w: timeouts must be positive", ErrReasonRequired)
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return RuleVersion{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", int64(0x72756c65)); err != nil {
		return RuleVersion{}, err
	}

	current, err := p.currentRulesTx(ctx, tx)
	if err != nil {
		return RuleVersion{}, err
	}
	if current.MinDurationSeconds == th.MinDurationSeconds &&
		current.MaxDistanceMeters == th.MaxDistanceMeters &&
		current.TimeoutHours == timeoutHours &&
		current.ReportTimeoutHours == reportTimeoutHours {
		if err := tx.Commit(ctx); err != nil {
			return RuleVersion{}, err
		}
		return current, nil
	}

	var next string
	if err := tx.QueryRow(ctx, `
		SELECT 'v' || (COALESCE(MAX(NULLIF(regexp_replace(version, '\D', '', 'g'), '')::int), 0) + 1)
		  FROM rule_version`).Scan(&next); err != nil {
		return RuleVersion{}, err
	}

	var out RuleVersion
	if err := tx.QueryRow(ctx, `
		INSERT INTO rule_version (version, min_duration_sec, max_distance_m, timeout_hours, report_timeout_hours, created_by, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING version, min_duration_sec, max_distance_m, timeout_hours, report_timeout_hours,
		          created_at, created_by, note`,
		next, th.MinDurationSeconds, th.MaxDistanceMeters, timeoutHours, reportTimeoutHours, by, note).
		Scan(&out.Version, &out.MinDurationSeconds, &out.MaxDistanceMeters,
			&out.TimeoutHours, &out.ReportTimeoutHours, &out.CreatedAt, &out.CreatedBy, &out.Note); err != nil {
		return RuleVersion{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RuleVersion{}, err
	}
	return out, nil
}
