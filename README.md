# Field Visit Compliance — Academic Detailing for HCP Visits

A small, end-to-end system for the pharma-rep (MR) workflow of academic detailing visits to
healthcare professionals (HCPs). It records the *five-step* visit flow and, more importantly,
proves the visit actually happened and happened compliantly:

- **Time evidence** — server-side timestamps and derived visit duration.
- **Location evidence** — check-in / check-out GPS coordinates compared against the HCP's
  registered hospital coordinates.
- **Rule engine** — automatic abnormality flags with machine-readable reasons.

> Built as an AI-assisted engineering exercise. The requirements this implementation is checked
> against are in [`docs/requirements.md`](docs/requirements.md); the static prototype used to
> settle the requirements is in [`demo/`](demo/).

---

## Quick start

```bash
docker compose up --build
```

Then open <http://localhost:8080>. The database is created, migrated and seeded on first start;
the UI walks you through the five steps below.

Local development. On this machine Go, Node and Postgres are not installed system-wide; they
live under `.tools/`:

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
export POSTGRES_DSN='postgres://veeva@localhost:55432/visits_demo?sslmode=disable'

# start the local database (port 55432, unix socket in /tmp)
.tools/Postgres.app/Contents/Versions/16/bin/pg_ctl -D .tools/pgdata \
  -l .tools/pg.log -o "-p 55432 -k /tmp" start

make test        # domain + API tests: no database needed
make web         # typecheck + bundle the TypeScript frontend
make build       # binary with the frontend embedded
make run         # run against $POSTGRES_DSN
```

Database-backed tests (constraints, partial unique index, dashboard counting) run against a real
Postgres; the compose file publishes it on host port 55432 for exactly this purpose:

```bash
make test-db   # needs POSTGRES_TEST_DSN; skipped when unset
```



## The five business steps

| # | Step | What the system records |
|---|------|-------------------------|
| 1 | **Plan** | MR, HCP, department, planned date, target product → visit in `PLANNED` |
| 2 | **Check-in** | GPS (lat/lng) + server timestamp → `CHECKED_IN` |
| 3 | **Detailing** | The academic material actually shown (product / document items) |
| 4 | **Check-out** | GPS + timestamp + **derived duration** → `CHECKED_OUT` |
| 5 | **Call report** | Talking points, HCP feedback, whether compliant material was handed over → `REPORTED` |

State machine — transitions that are not listed return `409 invalid_state`:

```
PLANNED ──checkin──▶ CHECKED_IN ──checkout──▶ CHECKED_OUT ──report──▶ REPORTED
   │                   │
   ├─cancel(reason)─▶ CANCELLED      ├─void(reason)─▶ VOIDED
   └─delete────────▶ DELETED         └─timeout──────▶ VOIDED
```

Seven states, three of them terminal. `delete` is a logical delete (the row stays, the visit leaves
every count) and only works briefly after planning; outside that window the rep must cancel, which
keeps a reason and a counter.

A `VOIDED` visit keeps its check-in and never has a check-out, so it has no duration and rule R1
cannot be evaluated — but rule R2 is **re-run** at void time, so a voided visit stays abnormal.

Abnormality flags are orthogonal to the state: a `REPORTED` visit may still carry flags.

## Compliance rules

Both thresholds are configurable (`COMPLIANCE_*` env vars) and evaluated **on the server** at
check-out; the client never supplies duration or flags.

| Rule code | Condition | Boundary policy |
|---|---|---|
| `DURATION_TOO_SHORT` | `duration < 300 s` | exactly `300 s` is compliant — "less than" is strict |
| `LOCATION_DEVIATION` | `distance(check-in or check-out, HCP base) > 500 m` | exactly `500.0 m` is compliant; comparisons use a `1e-6 m` epsilon |

All matching rules are returned, never just the first one. An un-finished visit (checked in but
never out) is reported as *incomplete* rather than *compliant*.

## API

| Method | Path | Purpose |
|---|---|---|
> Every request carries `X-Actor`: an MR uuid (that rep's rows only) or the literal `admin`
> (everything). No header means *no rows* — the scoping fails closed rather than open.

| `GET` | `/api/catalog` | MRs, HCPs (with base coordinates), products |
| `POST` | `/api/visits` | Create a planned visit |
| `POST` | `/api/visits/{id}/checkin` | `{lat,lng}` → state `CHECKED_IN` |
| `POST` | `/api/visits/{id}/checkout` | `{lat,lng}` → duration + flags |
| `PUT` | `/api/visits/{id}/report` | Call report, optional material list |
| `POST` | `/api/visits/{id}/cancel` | `{reason}` → `CANCELLED` (reason required) |
| `POST` | `/api/visits/{id}/void` | `{reason}` → `VOIDED`; re-runs the location rule |
| `DELETE` | `/api/visits/{id}` | Logical delete → `204`; only inside the planning window |
| `GET` | `/api/visits/{id}` | Full visit incl. flags |
| `GET` | `/api/visits` | List with filters |
| `GET` | `/api/dashboard/monthly` | Per product per month: done / effective / abnormal / cancelled / voided |
| `GET` | `/api/admin/rules` | Current threshold version (admin only) |
| `PUT` | `/api/admin/rules` | New version when the thresholds change (admin only) |
| `GET` | `/healthz` | Liveness/readiness |

## Design decisions

- **Go + stdlib HTTP, one dependency (`pgx`).** No framework means the request path is readable
  in one screen and `go test ./...` needs no database.
- **Domain package is pure.** Duration, haversine and the rule engine take plain values and
  return plain values, so every boundary case is a table-driven unit test.
- **Flags in their own table** (`visit_flag`), not a boolean column: new rules are new rows, and
  the audit trail keeps every rule that fired.
- **Server owns the clock.** `checkin_at`/`checkout_at` are `now()` from the DB, and duration is
  derived — never accepted from the client.
- **Dashboard counts by check-in month** in `Asia/Shanghai`. It reports the five numbers the
  baseline defines — done / effective / abnormal / cancelled / voided — with the abnormal share
  over *done*, so cancelling more cannot improve the rate. Deleted visits are in none of them.
- **Thresholds are versioned in the database**, not in the process config. A check-out records the
  rule version and the thresholds it applied, so changing 300 s to 600 s cannot rewrite a past
  verdict; `PUT /api/admin/rules` creates a new version only when the numbers actually change.
- **Visits carry their own snapshot** of the doctor, department, hospital, base coordinates and
  product. Reads never join master data, so renaming a doctor or taking a hospital off the list
  cannot rewrite history; master rows are logically deleted, never removed.
- **A hospital is its own table.** It owns the coordinate the 500 m rule depends on, so fixing a
  wrong coordinate is one edit rather than one per doctor at that site.
- **The report-missing flag is derived, not stored.** `reportOverdue` is computed on read from
  `report_timeout_hours`, so there is no column to drift out of sync with the clock.
- **Thresholds are edited in the UI** by the administrator (a card that only renders for that
  actor); saving identical numbers returns the existing version instead of inventing one.
- **Timeouts are applied when someone reads.** Every list/detail/dashboard request first runs an
  idempotent sweep (`Converge`): a plan past its timeout becomes CANCELLED, an abandoned check-in
  becomes VOIDED with the same evidence a manual void leaves. There is no background job, so no
  visit can sit in a stale state because a scheduler was down; the cost is that reads can write.

## Repository layout

```
cmd/server/          entrypoint, wiring, graceful shutdown
internal/domain/     pure business logic: state machine, duration, haversine, rules
internal/store/      pgx repository + embedded SQL migrations and seed
internal/api/        HTTP handlers, DTOs, problem+json errors
web/                 TypeScript frontend (no framework), bundled by esbuild
demo/                static prototype used to validate the requirements
tools/build-web/     Go-driven frontend build; tools/commit-report/ generates the analysis
docs/                requirements, ADRs, AI collaboration report, commit analysis
```

## Licence

MIT — see [LICENSE](LICENSE).
