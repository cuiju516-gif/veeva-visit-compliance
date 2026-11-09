-- 0011_sweep_indexes.sql — 让超时扫描走索引，而不是全表扫
--
-- 收敛是"池化扫描"：每个周期跑两条按状态 + 时间的查询。没有索引时这两条都是
-- Seq Scan on visit——库小看不出问题，几十万行时每 30 秒扫一遍全表就是实打实的成本。
--
-- 两个部分索引只覆盖"还可能被扫到"的行：
--   * CHECKED_IN / PLANNED 是唯二会超时的状态；
--   * 一旦迁移到终态，行就离开索引，索引大小 ≈ 当前未结的拜访数，而不是总行数。
-- 因此扫描成本随"未结拜访"增长，不随历史增长——这正是合规数据该有的形状。

CREATE INDEX idx_visit_open_checkin ON visit (checkin_at) WHERE status = 'CHECKED_IN';
CREATE INDEX idx_visit_open_planned ON visit (planned_at) WHERE status = 'PLANNED';

COMMENT ON INDEX idx_visit_open_checkin IS
    '超时扫描（签到边）：只索引未签退的拜访，成本随未结数增长';
COMMENT ON INDEX idx_visit_open_planned IS
    '超时扫描（计划边）：只索引未签到的计划，成本随未结数增长';
