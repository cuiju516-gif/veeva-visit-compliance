-- 0008_seed_voided_visit.sql — 作废的那条，带补判快照（durationSec 为 null，因为没有签退）。

INSERT INTO visit (
    id, mr_id, hcp_id, product_id, planned_at, status,
    hcp_name, department, hospital_name, base_lat, base_lng, product_name,
    checkin_at, checkin_lat, checkin_lng,
    void_reason, void_cause, voided_at,
    evaluation, rule_version)
VALUES (
    '55555555-5555-5555-5555-555555555552',
    '11111111-1111-1111-1111-111111111112',
    '22222222-2222-2222-2222-222222222221',
    '33333333-3333-3333-3333-333333333331',
    date_trunc('month', now()) - interval '11 days',
    'VOIDED',
    '李建国', '心内科', '示例三甲医院', 31.2119, 121.4661, '可瑞达',
    date_trunc('month', now()) - interval '11 days' + interval '9 hours',
    31.2119, 121.4661,
    '签到后发现走错院区，未进行学术沟通', 'MANUAL',
    date_trunc('month', now()) - interval '11 days' + interval '9 hours 20 minutes',
    jsonb_build_object(
        'durationSec', NULL,
        'distanceInM', 0,
        'distanceOutM', NULL,
        'flags', '[]'::jsonb,
        'abnormal', false,
        'thresholds', jsonb_build_object('minDurationSec', 300, 'maxDistanceM', 500),
        'ruleVersion', 'v1',
        'evaluatedAt', to_jsonb(date_trunc('month', now()) - interval '11 days' + interval '9 hours 20 minutes'),
        'source', 'void_backfill'),
    'v1');
