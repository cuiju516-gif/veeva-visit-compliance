-- 0009_rule_timeouts.sql — 悬挂超时与补记录时限进规则版本
--
-- 需求说明 §6 把三个时间都列为"可配 + 版本化"：悬挂超时（默认 24h）和补记录时限
-- （默认 72h）与两个合规阈值一样会变。把它们放进 rule_version，超时判定才能说清
-- "当时用的是哪个版本的规则"——否则一条 24 小时前签到的拜访被作废，没人知道依据是什么。

ALTER TABLE rule_version
    ADD COLUMN timeout_hours        integer NOT NULL DEFAULT 24 CHECK (timeout_hours > 0),
    ADD COLUMN report_timeout_hours integer NOT NULL DEFAULT 72 CHECK (report_timeout_hours > 0);

COMMENT ON COLUMN rule_version.timeout_hours IS
    '悬挂超时：计划到点后仍未签到 → 取消；签到后仍未签退 → 作废。';
COMMENT ON COLUMN rule_version.report_timeout_hours IS
    '补记录时限：签退后超过该时长仍没有记录，标「记录缺失」。';
