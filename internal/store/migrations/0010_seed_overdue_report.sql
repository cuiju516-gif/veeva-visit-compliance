-- 0010_seed_overdue_report.sql — 一条"已签退但一直没补记录"的拜访
--
-- 「记录缺失」是读时派生出来的（reportOverdue），没有列可以种。这条种子存在的意义
-- 是让那个徽章在本地跑起来就能看到：签退时间在 96 小时前，超过补记录时限（默认 72h）。

INSERT INTO visit (
    id, mr_id, hcp_id, product_id, planned_at, status,
    hcp_name, department, hospital_name, base_lat, base_lng, product_name,
    checkin_at, checkin_lat, checkin_lng,
    checkout_at, checkout_lat, checkout_lng, duration_seconds,
    evaluation, rule_version)
VALUES (
    '66666666-6666-6666-6666-666666666661',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333332',
    date_trunc('month', now()) - interval '4 days',
    'CHECKED_OUT',
    '王淑芬', '内分泌科', '示例三甲医院', 31.2119, 121.4661, '欧狄沃',
    date_trunc('month', now()) - interval '4 days' + interval '10 hours',
    31.2119, 121.4661,
    date_trunc('month', now()) - interval '4 days' + interval '10 hours 12 minutes',
    31.2119, 121.4661, 720,
    jsonb_build_object(
        'durationSec', 720,
        'distanceInM', 0,
        'distanceOutM', 0,
        'flags', '[]'::jsonb,
        'abnormal', false,
        'thresholds', jsonb_build_object('minDurationSec', 300, 'maxDistanceM', 500),
        'ruleVersion', 'v1',
        'evaluatedAt', to_jsonb(date_trunc('month', now()) - interval '4 days' + interval '10 hours 12 minutes'),
        'source', 'checkout'),
    'v1');
