-- 0007_seed_terminal_visits.sql — 让看板五个数字都有东西可看
--
-- 种子原来只有正向的三条路径（计划 / 已签到 / 已完成），取消和作废永远是 0，
-- 看板上的两列形同虚设。这里补两条已经走完终态的拜访，并带上判定快照——
-- 作废那条的 durationSec 是 null，因为它本来就没有签退。

INSERT INTO visit (
    id, mr_id, hcp_id, product_id, planned_at, status,
    hcp_name, department, hospital_name, base_lat, base_lng, product_name,
    cancel_reason, cancelled_at)
VALUES (
    '55555555-5555-5555-5555-555555555551',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222223',
    '33333333-3333-3333-3333-333333333332',
    date_trunc('month', now()) - interval '6 days',
    'CANCELLED',
    '陈志强', '神经内科', '示例医院东院', 31.2243, 121.4490, '欧狄沃',
    '医生临时停诊', date_trunc('month', now()) - interval '7 days');
