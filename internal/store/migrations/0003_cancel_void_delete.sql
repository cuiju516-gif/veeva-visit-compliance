-- 0003_cancel_void_delete.sql — 4 states → 7.
--
-- Adds the three terminal states the frozen baseline requires (CANCELLED,
-- VOIDED, DELETED) and the evidence each of them implies. Design notes live in
-- docs/adr/0002-data-model.md; the state × evidence matrix is docs/契约.md §2.4.
--
-- Two constraints have to go, not one: 0001 declared the state list inline on
-- the column, so PostgreSQL named it visit_status_check. Dropping only
-- chk_visit_state_evidence leaves that one behind, and every transition to a new
-- state then fails with a constraint nobody wrote by name. Found by running the
-- migration against a seeded copy, not by reading it.
--
-- No BEGIN/COMMIT here: the migration runner already executes each file inside
-- its own transaction (store.Migrate).

ALTER TABLE visit
    DROP CONSTRAINT IF EXISTS chk_visit_state_evidence,
    DROP CONSTRAINT IF EXISTS visit_status_check;

ALTER TABLE visit
    ADD COLUMN cancel_reason text,
    ADD COLUMN cancelled_at  timestamptz,
    ADD COLUMN void_reason   text,
    ADD COLUMN void_cause    text,
    ADD COLUMN voided_at     timestamptz,
    ADD COLUMN deleted_at    timestamptz,
    ADD COLUMN reported_at   timestamptz;

-- MANUAL is a rep voiding a visit they attended; TIMEOUT is the system closing
-- one that was never checked out. Keeping the cause separate from the reason
-- lets the dashboard tell "the rep decided" from "nobody came back".
ALTER TABLE visit
    ADD CONSTRAINT chk_visit_void_cause CHECK (
        void_cause IS NULL OR void_cause IN ('MANUAL', 'TIMEOUT')
    );

-- Existing reported visits predate the column. updated_at is the closest thing
-- to "when the report landed" that the old schema kept.
UPDATE visit SET reported_at = updated_at
 WHERE status = 'REPORTED' AND reported_at IS NULL;

-- State and the evidence it implies agree with each other. Written as a table
-- rather than a set of ORs so that adding a state without deciding its evidence
-- fails loudly instead of falling through to "anything goes".
ALTER TABLE visit ADD CONSTRAINT chk_visit_state_evidence CHECK (
    CASE status
        WHEN 'PLANNED' THEN
            checkin_at IS NULL AND checkout_at IS NULL AND duration_seconds IS NULL
            AND cancel_reason IS NULL AND void_reason IS NULL AND deleted_at IS NULL
        WHEN 'CHECKED_IN' THEN
            checkin_at IS NOT NULL AND checkout_at IS NULL AND duration_seconds IS NULL
            AND cancel_reason IS NULL AND void_reason IS NULL AND deleted_at IS NULL
        WHEN 'CHECKED_OUT' THEN
            checkin_at IS NOT NULL AND checkout_at IS NOT NULL AND duration_seconds IS NOT NULL
            AND cancel_reason IS NULL AND void_reason IS NULL AND deleted_at IS NULL
        WHEN 'REPORTED' THEN
            checkin_at IS NOT NULL AND checkout_at IS NOT NULL AND duration_seconds IS NOT NULL
            AND cancel_reason IS NULL AND void_reason IS NULL AND deleted_at IS NULL
            AND reported_at IS NOT NULL
            AND talking_points IS NOT NULL AND btrim(talking_points) <> ''
        WHEN 'CANCELLED' THEN
            checkin_at IS NULL AND checkout_at IS NULL AND duration_seconds IS NULL
            AND cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL
            AND void_reason IS NULL AND deleted_at IS NULL
        WHEN 'VOIDED' THEN
            -- Attended but not counted: there is a check-in, never a check-out,
            -- so a duration cannot exist and R1 is simply not evaluable.
            checkin_at IS NOT NULL AND checkout_at IS NULL AND duration_seconds IS NULL
            AND void_reason IS NOT NULL AND void_cause IS NOT NULL AND voided_at IS NOT NULL
            AND cancel_reason IS NULL AND deleted_at IS NULL
        WHEN 'DELETED' THEN
            -- Deleting is correcting a plan that never happened, so it carries
            -- no reason, only who/when.
            checkin_at IS NULL AND checkout_at IS NULL AND duration_seconds IS NULL
            AND deleted_at IS NOT NULL
            AND cancel_reason IS NULL AND void_reason IS NULL
        ELSE false
    END
);

COMMENT ON COLUMN visit.status IS
    'text + CHECK, not a PG enum: enum values cannot be added inside a transaction '
    'block, and this set already grew once (4 → 7).';
COMMENT ON COLUMN visit.cancel_reason IS
    'Why the plan did not happen. Required for CANCELLED, forbidden everywhere else.';
COMMENT ON COLUMN visit.void_reason IS
    'Why an attended visit does not count. Required for VOIDED, forbidden everywhere else.';
COMMENT ON COLUMN visit.deleted_at IS
    'Logical delete: the row stays, the visit is excluded from every denominator.';
