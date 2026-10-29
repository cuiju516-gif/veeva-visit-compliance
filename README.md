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
```

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
| `GET` | `/api/catalog` | MRs, HCPs (with base coordinates), products |
| `POST` | `/api/visits` | Create a planned visit |
| `POST` | `/api/visits/{id}/checkin` | `{lat,lng}` → state `CHECKED_IN` |
| `POST` | `/api/visits/{id}/checkout` | `{lat,lng}` → duration + flags |
| `PUT` | `/api/visits/{id}/report` | Call report, optional material list |
| `GET` | `/api/visits/{id}` | Full visit incl. flags |
| `GET` | `/api/visits` | List with filters |
| `GET` | `/api/dashboard/monthly` | Visits per product per month + abnormal share |
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
- **Dashboard counts by check-in month** in `Asia/Shanghai`, and reports abnormal share rather
  than hiding non-compliant visits.

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
