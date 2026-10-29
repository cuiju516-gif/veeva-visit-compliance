# ADR 0002 — Data model for the field-visit schema

> 中文摘要：这份 ADR 记录了 `visit` 相关表的七个建模决定，以及它们各自的代价。
> 前半部分（D1–D4）是 v1 建表时的选择，`0001_init.sql` 的头注释引用本文；
> 后半部分（D5–D7）是 v2 契约（`0003_contract_v2.sql`）追加的，用于支撑 7 状态机与判定快照。
> 全部 SQL 已在一份 0001+0002 的种子库副本上执行验证过。

- **Status**: Accepted（2026-10-29 amended：D1 被 D1′ 取代，D8 追加）
- **Date**: 2026-10-29
- **Supersedes**: —
- **Related**: `docs/契约.md`（§2 数据模型、§3 evaluation 契约、§5.4 读时收敛、§6 裁决记录）, `docs/需求说明.md`, `docs/实现范围与改造清单.md`

---

## Context

The system proves that an academic-detail visit happened *and* happened compliantly. Two facts have
to survive forever: **when the rep was there** (timestamps, server-generated) and **why the visit was
judged abnormal** (rule hits plus the thresholds in force at that moment). Everything below follows
from those two facts, not from a preference for a particular shape.

The v1 schema covered the four forward states of the brief. The frozen baseline
(`docs/需求说明.md`) adds three terminal states, a void/backfill path, and rule versioning.

---

## Decisions

### D1 — The hospital's baseline coordinate lives on `hcp`, not on a `hospital` table

The 500 m rule is a property of *the doctor's hospital*, so v1 denormalised
`hospital_name / base_lat / base_lng` onto `hcp`.

**Cost (as accepted at the time):** two doctors at the same hospital stored the same coordinate
twice, and "take a hospital offline" could not be expressed. Visits snapshot the coordinate, so a
correction never rewrites history.

**Superseded by D1′ (2026-10-29).** The cost turned out to be the more important half of the
decision — see below.

### D1′ — The hospital is its own table (supersedes D1)

Adjudicated as **6-2 = B** (`契约 §6`). `hospital(id, name, base_lat, base_lng, status, deleted_at)`,
`hcp.hospital_id` → `hospital(id)`; `hcp` loses `hospital_name / base_lat / base_lng`.

**Why the reversal:** treating a hospital as a property of a doctor made the *rule input* unmaintainable
— correcting one wrong coordinate meant editing every doctor at that site, and a site could not be
retired at all. R2 is the only place a coordinate matters, and it has exactly one legitimate owner.

**Migration shape** (executed and verified, `契约 §2.3 §8.1`): dedupe `(name, base_lat, base_lng)` into
`hospital`, backfill `hcp.hospital_id`, then drop the three columns. **Order matters** — the visit
snapshot backfill (step 3 of the migration) reads the old `hcp` columns and must run first.

**Cost, accepted:** one more table and a wider migration; `GET /api/catalog` gains a collection. Code
that still reads `hcp.hospital_name` now fails loudly with "column does not exist", which is the
failure mode we want.

### D2 — Compliance findings get their own table, and that table has **no** unique key

`visit_flag` holds `(visit_id, code, detail)`. The alternative — one boolean column per rule on
`visit` — was rejected because "both rules fired" has to be representable, and every new rule would
be a new column rather than a new row.

**The non-obvious part:** there is deliberately **no** `UNIQUE (visit_id, code)`. The location rule
is evaluated **per point** (`需求说明 §4`), so a visit that is deviated at both check-in and check-out
produces two rows with the same `code`. A unique constraint would turn the *most* abnormal visit into
a 500 error, and — worse — it would only fail on that path, which is exactly the path least exercised
by tests.

`chk_visit_flag_point_by_code` keeps the table honest in the other direction: R1 rows must have no
`point`, R2 rows must have one. It does **not** de-duplicate.

### D3 — `status` is `text + CHECK`, not a PostgreSQL enum

`ALTER TYPE ... ADD VALUE` cannot run inside a transaction block and cannot be rolled back, so a
migration that extends the state set has to be split into two deploy steps. v1 → v2 already went from
4 states to 7; that is not a one-time event.

**Cost, accepted:** no type-level validation outside the table's own CHECK, and every client library
sees a string. Enforced in exactly one place — `chk_visit_state_evidence` — so there is still a single
definition of "what each state is allowed to contain".

### D4 — `duration_seconds` is derived and guarded by a CHECK

The rule is "the stay was shorter than five minutes". If duration were client-supplied (or merely
cached), the rule would be trivially bypassable and could silently disagree with the two timestamps
that define it.

`chk_visit_duration_matches` requires `duration_seconds = floor(extract(epoch FROM checkout_at - checkin_at))`
whenever both timestamps exist, and `NULL` otherwise. The `floor` matches the Go side's truncation,
which only agrees because `chk_visit_checkout_after_checkin` forbids a negative interval.

### D5 — Visits snapshot everything they need to be *read* (v2)

`visit` gains `hcp_name, department, hospital_name, base_lat, base_lng, product_name`, written at
insert time.

**Why:** master data must be deletable (it is wrong, not merely unused) without breaking historical
records (`角色模型 R-ROLE-9`). Join-at-read makes deletion either impossible (RESTRICT) or destructive
(CASCADE).

**Cost, accepted and documented:** renaming a doctor does **not** rewrite history. A typo fix therefore
has to go through "correct the master row + a backfill script with an audit trail", not through a join.

### D6 — `evaluation` is a jsonb snapshot, plus a `rule_version` table

`visit.evaluation` stores `{durationSec, distanceInM, distanceOutM, flags[], abnormal, thresholds,
ruleVersion, evaluatedAt, source}`; `visit.rule_version` is an FK to `rule_version.version`.

**Why both the FK and the duplicated thresholds:** the FK makes the audit chain checkable ("which
version produced this?"), and the copy inside the JSON is the actual number used. If an administrator
later edits a `rule_version` row by mistake, the FK still points somewhere plausible while the
snapshot keeps the truth.

**Rejected:** `abnormal boolean` on `visit` alone. Once thresholds are configurable, a boolean is a
verdict with no evidence — changing 300 s to 600 s would silently rewrite every historical judgement.

### D7 — Master data is soft-deleted, never removed (v2)

`hcp` and `product` gain `status ('ACTIVE'|'INACTIVE')` and `deleted_at`.

Two distinct ideas are kept distinct: **inactive** means "not selectable any more, still listed";
**deleted** means "entered by mistake, hidden by default, recoverable". Neither is a physical delete,
because a row that a visit once pointed at is evidence.

---

## Consequences and traps

- **`visit_status_check` (the trap).** In `0001_init.sql` the state list is an *inline* column CHECK,
  so PostgreSQL names it `visit_status_check`. A v2 migration that drops only
  `chk_visit_state_evidence` leaves that constraint in place, and every transition to
  `CANCELLED` / `VOIDED` / `DELETED` fails with a confusing "violates check constraint
  visit_status_check". Found by executing the migration against a seeded copy, not by reading it.
  The migration now drops both by name, with `IF EXISTS`.
- **Legacy rows have no `point`.** v1 wrote the point into the `detail` text
  (`"check-out was 900 m from the hospital, ..."`). The migration backfills `point` from that prefix
  and then adds the CHECK; a prefix it cannot recognise aborts the migration on purpose, rather than
  leaving an R2 row with no point.
- **Backfilled evaluations are incomplete on purpose.** Distances require haversine, which the
  migration cannot compute in SQL, so `distanceInM/distanceOutM` are `null` and `source` is
  `backfill_migration`. A `re_evaluate` job fills them in later; `durationSec` and the flag list are
  exact because they come from stored data.
- **`uq_visit_mr_active` survives.** One rep cannot be checked in twice; the partial unique index on
  `(mr_id) WHERE status = 'CHECKED_IN'` is still exactly right with seven states.
- **Terminal states are written from two places, not one.** Adjudication **6-3 = B** puts the timeout
  convergence on the *read* path (`契约 §5.4`), so a row can reach `CANCELLED` / `VOIDED` without any
  user action — and without a background job. The data model is unchanged by this, but any test that
  asserts on counts must run the convergence first, or it will read two different answers from the same
  database.

## Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| PostgreSQL enum for `status` | Cannot extend inside a transaction; four-value enum already changed once. |
| `UNIQUE (visit_id, code)` on flags | Two deviated points produce two same-code rows; the constraint would 500 on the worst case. |
| Split `LOCATION_DEVIATION` into `_IN` / `_OUT` codes | Same information, worse invariant ("one code = one rule"), and every aggregation has to merge them back. |
| One boolean column per rule on `visit` | New rule = new column + migration; "all reasons" cannot be returned. |
| Join master data at read time | Breaks soft delete; breaks historical rendering after a rename or a hospital coordinate fix. |
| Physical delete with `ON DELETE RESTRICT` | Makes a wrongly-entered doctor permanently undeletable; the list only grows. |

## Open questions

None. All five items raised with this ADR were adjudicated on 2026-10-29 and are recorded in
`docs/契约.md` §6 with the cost of each choice: 403, hospital table (D1′), read-time convergence,
no reversal edge — and **6-4 (`mr.team_id`) was withdrawn** the same day, because the regional-manager
role was removed from the requirements altogether (`角色模型.md` §2.3).
