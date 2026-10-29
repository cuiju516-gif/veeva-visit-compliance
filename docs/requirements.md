# Requirements and acceptance criteria

> **范围以 [`需求说明.md`](./需求说明.md) 为准。** 本文只覆盖题面字面要求与 v1 验收口径；
> 冻结基线里更严的部分（7 状态机、规则版本化、主数据快照与逻辑删除）以那份文档为准。
> *Scope follows `需求说明.md`; this file is limited to the brief as written and the v1 acceptance set.*

Derived from the exercise brief. Every requirement below has an ID, and the *Evidence* column
names the test or artefact that proves it — this file is the contract the rest of the repository
is checked against. Requirements the brief does not state are marked **[derived]** and justified
in an ADR.

## 1. Data model

| ID | Requirement | Evidence |
|---|---|---|
| B-1 | Database schema covering the five-step flow: MR, HCP (with hospital base coordinates), product, visit, flags, materials | `internal/store/migrations/0001_init.sql`, `TestMigrationsApply` |
| B-1a | **[derived]** Check-in/check-out timestamps are server-generated, never client-supplied | `api_test.go: TestCheckInRecordsServerTimestamp` (client `now` is injected by the handler, and unknown JSON fields are rejected) |
| B-1b | **[derived]** `checkout_at >= checkin_at` enforced in the database | `chk_visit_checkout_after_checkin`; `TestSchemaRejectsInvertedTimestamps` |
| B-1c | **[derived]** Latitude/longitude range constraints (`-90..90`, `-180..180`) | `chk_*_lat`, `chk_*_lng`; `TestSchemaRejectsOutOfRangeCoordinates` |
| B-1d | **[derived]** Indexes supporting the dashboard aggregation | `idx_visit_product_checkin`, `idx_visit_mr_planned` |
| B-1e | **[derived]** Seed data: ≥2 hospitals with distinct coordinates, 3 HCPs, 3 products, visits spanning two months | `0002_seed.sql`; dashboard test asserts both months appear |

## 2. Backend behaviour

| ID | Requirement | Evidence |
|---|---|---|
| B-2 | Create visit (plan) | `POST /api/visits`; `TestCreateVisit` |
| B-3 | Check-in with GPS coordinates | `POST /api/visits/{id}/checkin`; `TestCheckin` |
| B-4 | Check-out, recording leave time and **deriving** stay duration | `POST /api/visits/{id}/checkout`; `TestCheckoutDerivesDuration` |
| B-5 | Call report submission and retrieval | `PUT /api/visits/{id}/report`, `GET /api/visits/{id}`; `TestSubmitReport` |
| B-6 | Compliance algorithm: `duration < 5 min` and `distance > 500 m` flag the visit abnormal | `internal/domain/compliance.go`; `TestRules*` |

### 2.1 Compliance rules (the only part of the brief with concrete numbers)

| Rule | Threshold | Boundary decision |
|---|---|---|
| `DURATION_TOO_SHORT` | `< 300 s` abnormal | `300 s` is **compliant** — "不足 5 分钟" is strictly less |
| `LOCATION_DEVIATION` | `> 500 m` abnormal | `500.0 m` is **compliant** — "500 米以上" read as strictly greater |

- **[derived]** Distance is the haversine great-circle distance in metres (mean Earth radius
  `6 371 008.8 m`), applied to **both** the check-in and check-out points.
- **[derived]** Multiple rule hits are all returned, sorted by rule code — no short-circuiting.
- **[derived]** Rules are evaluated server-side at check-out and persisted; the client cannot
  influence the result.
- **[derived]** An incomplete visit is *incomplete*, never *compliant*.

### 2.2 State machine

| ID | Requirement | Evidence |
|---|---|---|
| B-7 | Illegal transitions rejected: check-out before check-in, duplicate check-in, duplicate check-out, report before check-out | `409 invalid_state`; `TestIllegalTransitions` |
| B-8 | **[derived]** Validation errors are `400`, missing resources `404`, conflicts `409` | `internal/api/errors.go`; `TestErrorMapping` |

## 3. Frontend

| ID | Requirement | Evidence |
|---|---|---|
| F-1 | Web application for desktop browsers | `web/` |
| F-2 | No mobile adaptation required | single fixed-width desktop layout |
| F-3 | Simple form pages for data submission | five-step visit form |
| F-4 | GPS coordinates typed manually by the user (no device API) | lat/lng inputs, no `geolocation` call |
| F-5 | Dashboard: monthly visit count grouped by product | `GET /api/dashboard/monthly` + dashboard view |
| F-6 | No authentication/authorisation | single seeded MR in the header |
| F-7 | **[derived]** The UI drives all five steps and shows the resulting state | `web/src/views/*` |
| F-8 | **[derived]** Abnormality flags and reasons are visible, not just stored | flag badges in visit detail |
| F-9 | **[derived]** Dashboard also reports abnormal count and share | dashboard cards |

## 4. Engineering

| ID | Requirement | Evidence |
|---|---|---|
| E-1 | Unit tests for core business logic | `internal/domain/*_test.go` |
| E-2 | `docker-compose.yaml` one-command deployment | `docker-compose.yaml`; `make smoke` |
| E-3 | Free choice of language | Go 1.25 + TypeScript |
| E-4 | Undescribed details designed by the candidate and documented | `docs/design-notes.md` (kept in `.tools/quarantine/`) |
| E-5 | **[derived]** Tests cover boundaries: 299/300/301 s, 499/500/501 m, rule combinations, illegal transitions | `TestDurationBoundaries`, `TestDistanceBoundaries`, `TestRuleCombination` |
| E-6 | **[derived]** Compose brings up app + Postgres with migration and seed, reachable immediately | `docker compose up` → <http://localhost:8080> |

## 5. AI collaboration deliverables

| ID | Deliverable | Location |
|---|---|---|
| D-2.1 | Key prompts for schema design and the complex validation algorithm | tracked outside this repository (prompt log kept with the submission notes) |
| D-2.2 | One real correction case: how the bug was found and fixed | documented with the submission notes |
| D-2.3 | Full session export + git history | session export kept with the submission notes; git history rebuilt for submission |
| D-2.4 | Demo recording of the five steps and the dashboard | recorded with the submission notes |

## 6. Explicitly out of scope

Mobile layout, authentication/authorisation, real device GPS, multi-tenancy, offline mode.
