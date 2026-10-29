-- 0001_init.sql — schema for the five-step field visit flow.
--
-- Design notes live in docs/adr/0002-data-model.md. The short version:
--   * the hospital base coordinate lives on hcp, because the 500 m rule is a
--     property of the doctor's hospital, not of an individual visit;
--   * duration is derived from the two timestamps and guarded by a CHECK, so it
--     can never disagree with them;
--   * compliance findings get their own table, so "both rules fired" is
--     representable and new rules are new rows rather than new columns.

CREATE TABLE mr (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    region     text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hcp (
    id            uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text             NOT NULL,
    hospital_name text             NOT NULL,
    department    text             NOT NULL,
    -- Baseline coordinates used by the location rule. Real deployments would
    -- geocode the hospital once and keep it current; the rule only needs a
    -- stable reference point.
    base_lat      double precision NOT NULL CHECK (base_lat BETWEEN -90 AND 90),
    base_lng      double precision NOT NULL CHECK (base_lng BETWEEN -180 AND 180),
    created_at    timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_hcp_site ON hcp (hospital_name, department);

CREATE TABLE product (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE visit (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    mr_id      uuid        NOT NULL REFERENCES mr (id),
    hcp_id     uuid        NOT NULL REFERENCES hcp (id),
    product_id uuid        NOT NULL REFERENCES product (id),

    planned_at timestamptz NOT NULL,

    status text NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'CHECKED_IN', 'CHECKED_OUT', 'REPORTED')),

    -- Server timestamps only. The API never accepts these from a client.
    checkin_at   timestamptz,
    checkin_lat  double precision,
    checkin_lng  double precision,

    checkout_at  timestamptz,
    checkout_lat double precision,
    checkout_lng double precision,

    -- Derived at check-out: floor(checkout_at - checkin_at) in seconds.
    duration_seconds integer,

    -- Call report (step 5).
    talking_points        text,
    hcp_feedback          text,
    materials_distributed boolean NOT NULL DEFAULT false,

    -- Optimistic locking: every write does WHERE id = $1 AND version = $2.
    version    integer     NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- A timestamp and its coordinates appear together or not at all.
    CONSTRAINT chk_visit_checkin_complete CHECK (
        (checkin_at IS NULL) = (checkin_lat IS NULL)
        AND (checkin_at IS NULL) = (checkin_lng IS NULL)
    ),
    CONSTRAINT chk_visit_checkout_complete CHECK (
        (checkout_at IS NULL) = (checkout_lat IS NULL)
        AND (checkout_at IS NULL) = (checkout_lng IS NULL)
    ),
    CONSTRAINT chk_visit_checkout_after_checkin CHECK (
        checkout_at IS NULL OR checkin_at IS NULL OR checkout_at >= checkin_at
    ),
    CONSTRAINT chk_visit_checkin_coords CHECK (
        checkin_lat IS NULL
        OR (checkin_lat BETWEEN -90 AND 90 AND checkin_lng BETWEEN -180 AND 180)
    ),
    CONSTRAINT chk_visit_checkout_coords CHECK (
        checkout_lat IS NULL
        OR (checkout_lat BETWEEN -90 AND 90 AND checkout_lng BETWEEN -180 AND 180)
    ),
    -- Duration cannot drift from the timestamps that define it.
    --
    -- floor() here matches the truncation the Go side uses for positive
    -- durations. The two only agree because chk_visit_checkout_after_checkin
    -- forbids a negative interval: if that constraint were relaxed, a negative
    -- interval would round the other way and this check would reject valid rows.
    CONSTRAINT chk_visit_duration_matches CHECK (
        CASE
            WHEN checkin_at IS NULL OR checkout_at IS NULL THEN duration_seconds IS NULL
            ELSE duration_seconds = floor(extract(epoch FROM (checkout_at - checkin_at)))::int
        END
    ),
    -- The state and the evidence it implies agree with each other.
    CONSTRAINT chk_visit_state_evidence CHECK (
        (status = 'PLANNED'      AND checkin_at IS NULL     AND checkout_at IS NULL)
        OR (status = 'CHECKED_IN'  AND checkin_at IS NOT NULL AND checkout_at IS NULL)
        OR (status IN ('CHECKED_OUT', 'REPORTED')
            AND checkin_at IS NOT NULL AND checkout_at IS NOT NULL)
    )
);

-- Dashboard: visits per product per month, counted by check-in month.
CREATE INDEX idx_visit_product_checkin
    ON visit (product_id, checkin_at)
    WHERE checkin_at IS NOT NULL;

-- The rep's visiting list.
CREATE INDEX idx_visit_mr_planned ON visit (mr_id, planned_at DESC);

-- The rep can only be checked in at one hospital at a time. This is a
-- data-layer version of the state machine's guarantee, and it catches a
-- double-submitted check-in from a flaky client.
CREATE UNIQUE INDEX uq_visit_mr_active
    ON visit (mr_id)
    WHERE status = 'CHECKED_IN';

CREATE TABLE visit_flag (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id   uuid        NOT NULL REFERENCES visit (id) ON DELETE CASCADE,
    code       text        NOT NULL
        CHECK (code IN ('DURATION_TOO_SHORT', 'LOCATION_DEVIATION')),
    detail     text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()

    -- No UNIQUE (visit_id, code) on purpose: the location rule is evaluated per
    -- point, so one visit can legitimately carry two LOCATION_DEVIATION rows
    -- (check-in and check-out). A unique constraint here made that case fail the
    -- whole check-out transaction with a server error.
);

CREATE INDEX idx_visit_flag_visit ON visit_flag (visit_id);

CREATE TABLE visit_material (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id uuid NOT NULL REFERENCES visit (id) ON DELETE CASCADE,
    name     text NOT NULL,
    kind     text NOT NULL DEFAULT 'document'
        CHECK (kind IN ('slide', 'reprint', 'document', 'other'))
);

CREATE INDEX idx_visit_material_visit ON visit_material (visit_id);
