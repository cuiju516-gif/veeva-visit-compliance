-- 0002_seed.sql — demo data.
--
-- Timestamps are relative to now(), so the dashboard always shows two months of
-- history no matter when the stack is started. Every completed visit carries the
-- flags the rule engine would have produced, so the seeded data cannot show a
-- 2-minute stay that looks compliant.

INSERT INTO mr (id, name, region) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Chen Wei', 'East China'),
    ('11111111-1111-1111-1111-111111111112', 'Liu Yang', 'East China');

INSERT INTO hcp (id, name, hospital_name, department, base_lat, base_lng) VALUES
    ('22222222-2222-2222-2222-222222222221', 'Dr. Li Ming',   'Ruijin Hospital',  'Cardiology',    31.2119, 121.4661),
    ('22222222-2222-2222-2222-222222222222', 'Dr. Wang Fang', 'Ruijin Hospital',  'Endocrinology', 31.2119, 121.4661),
    ('22222222-2222-2222-2222-222222222223', 'Dr. Zhang Hao', 'Huashan Hospital', 'Neurology',     31.2243, 121.4490);

INSERT INTO product (id, code, name) VALUES
    ('33333333-3333-3333-3333-333333333331', 'CARD-01', 'Cardizen'),
    ('33333333-3333-3333-3333-333333333332', 'ENDO-02', 'Glucostat'),
    ('33333333-3333-3333-3333-333333333333', 'NEUR-03', 'Neurovance');

-- Helper view of the two months the demo covers.
--   current month : date_trunc('month', now())
--   previous month: date_trunc('month', now()) - interval '1 month'

-- 1. Compliant visit, this month, at the hospital, 12 minutes.
INSERT INTO visit (id, mr_id, hcp_id, product_id, planned_at, status,
                   checkin_at, checkin_lat, checkin_lng,
                   checkout_at, checkout_lat, checkout_lng, duration_seconds,
                   talking_points, hcp_feedback, materials_distributed)
VALUES ('44444444-4444-4444-4444-444444444441',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222221',
        '33333333-3333-3333-3333-333333333331',
        date_trunc('month', now()) + interval '2 days 9 hours',
        'REPORTED',
        date_trunc('month', now()) + interval '3 days 9 hours',
        31.2119, 121.4661,
        date_trunc('month', now()) + interval '3 days 9 hours 12 minutes',
        31.2119, 121.4661, 720,
        'Reviewed the 12-month cardiovascular outcomes data; discussed titration for elderly patients.',
        'Interested, asked for the subgroup analysis in patients over 75.',
        true);

INSERT INTO visit_material (visit_id, name, kind) VALUES
    ('44444444-4444-4444-4444-444444444441', 'Cardizen CV Outcomes, 12-month (reprint)', 'reprint'),
    ('44444444-4444-4444-4444-444444444441', 'Dosing and titration deck', 'slide');

-- 2. Too short: 2 minutes, last month. Duration rule only.
INSERT INTO visit (id, mr_id, hcp_id, product_id, planned_at, status,
                   checkin_at, checkin_lat, checkin_lng,
                   checkout_at, checkout_lat, checkout_lng, duration_seconds,
                   talking_points, hcp_feedback, materials_distributed)
VALUES ('44444444-4444-4444-4444-444444444442',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222221',
        '33333333-3333-3333-3333-333333333331',
        date_trunc('month', now()) - interval '1 month' + interval '4 days 10 hours',
        'REPORTED',
        date_trunc('month', now()) - interval '1 month' + interval '5 days 10 hours',
        31.2119, 121.4661,
        date_trunc('month', now()) - interval '1 month' + interval '5 days 10 hours 2 minutes',
        31.2119, 121.4661, 120,
        'Brief hello, doctor was called away.',
        'No time to discuss.',
        false);

-- 3. Location deviation: 20 minutes but checked out ~900 m from the hospital.
INSERT INTO visit (id, mr_id, hcp_id, product_id, planned_at, status,
                   checkin_at, checkin_lat, checkin_lng,
                   checkout_at, checkout_lat, checkout_lng, duration_seconds,
                   talking_points, hcp_feedback, materials_distributed)
VALUES ('44444444-4444-4444-4444-444444444443',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222223',
        '33333333-3333-3333-3333-333333333333',
        date_trunc('month', now()) - interval '1 month' + interval '11 days 14 hours',
        'REPORTED',
        date_trunc('month', now()) - interval '1 month' + interval '12 days 14 hours',
        31.2243, 121.4490,
        date_trunc('month', now()) - interval '1 month' + interval '12 days 14 hours 20 minutes',
        31.232394, 121.4490, 1200,
        'Discussed seizure-free interval data with the neurology team.',
        'Requested the long-term extension data.',
        true);

-- 4. Both rules: 3 minutes and checked out ~2 km away.
INSERT INTO visit (id, mr_id, hcp_id, product_id, planned_at, status,
                   checkin_at, checkin_lat, checkin_lng,
                   checkout_at, checkout_lat, checkout_lng, duration_seconds,
                   talking_points, hcp_feedback, materials_distributed)
VALUES ('44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333332',
        date_trunc('month', now()) + interval '5 days 8 hours',
        'REPORTED',
        date_trunc('month', now()) + interval '6 days 8 hours 30 minutes',
        31.2119, 121.4661,
        date_trunc('month', now()) + interval '6 days 8 hours 33 minutes',
        31.229887, 121.4661, 180,
        'Left the new HbA1c data with the clinic.',
        'Will review with the nursing team.',
        false);

-- 5. Checked in right now, not yet checked out (shows the "incomplete" state).
INSERT INTO visit (id, mr_id, hcp_id, product_id, planned_at, status,
                   checkin_at, checkin_lat, checkin_lng)
VALUES ('44444444-4444-4444-4444-444444444445',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333332',
        date_trunc('month', now()) + interval '7 days 10 hours',
        'CHECKED_IN',
        now() - interval '6 minutes',
        31.2119, 121.4661);

-- 6. Planned for later this week.
INSERT INTO visit (id, mr_id, hcp_id, product_id, planned_at, status)
VALUES ('44444444-4444-4444-4444-444444444446',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222223',
        '33333333-3333-3333-3333-333333333333',
        now() + interval '3 days',
        'PLANNED');

-- 7. A second rep, so the dashboard is not single-threaded. Compliant, last month.
INSERT INTO visit (id, mr_id, hcp_id, product_id, planned_at, status,
                   checkin_at, checkin_lat, checkin_lng,
                   checkout_at, checkout_lat, checkout_lng, duration_seconds,
                   talking_points, hcp_feedback, materials_distributed)
VALUES ('44444444-4444-4444-4444-444444444447',
        '11111111-1111-1111-1111-111111111112',
        '22222222-2222-2222-2222-222222222221',
        '33333333-3333-3333-3333-333333333332',
        date_trunc('month', now()) - interval '1 month' + interval '19 days 15 hours',
        'REPORTED',
        date_trunc('month', now()) - interval '1 month' + interval '20 days 15 hours',
        31.2119, 121.4661,
        date_trunc('month', now()) - interval '1 month' + interval '20 days 15 hours 25 minutes',
        31.2119, 121.4661, 1500,
        'Reviewed GLP-1 combination therapy sequencing.',
        'Wants a summary for the department meeting.',
        true);

-- Flags matching the visits above. The detail text mirrors what the rule engine
-- produces at check-out, so seeded and live data are indistinguishable.
INSERT INTO visit_flag (visit_id, code, detail) VALUES
    ('44444444-4444-4444-4444-444444444442', 'DURATION_TOO_SHORT', 'stay was 2m00s, minimum is 5m00s'),
    ('44444444-4444-4444-4444-444444444443', 'LOCATION_DEVIATION', 'check-out was 900 m from the hospital, limit is 500 m'),
    ('44444444-4444-4444-4444-444444444444', 'DURATION_TOO_SHORT', 'stay was 3m00s, minimum is 5m00s'),
    ('44444444-4444-4444-4444-444444444444', 'LOCATION_DEVIATION', 'check-out was 1997 m from the hospital, limit is 500 m');
