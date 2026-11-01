-- 0006_rule_version_and_evaluation.sql — 规则版本 + 判定快照
--
-- 阈值一旦可配，判定结果就不再是纯函数的结果：管理员今天把 300 秒改成 600 秒，
-- 昨天的合规结论不能跟着变。所以判定必须自己带证据落库——
-- 命中的规则、当时的阈值、规则版本、判定时间，一个都不能少。

CREATE TABLE rule_version (
    version          text             PRIMARY KEY,
    min_duration_sec integer          NOT NULL CHECK (min_duration_sec > 0),
    max_distance_m   double precision NOT NULL CHECK (max_distance_m > 0),
    created_at       timestamptz      NOT NULL DEFAULT now(),
    created_by       text             NOT NULL DEFAULT 'system',
    note             text             NOT NULL DEFAULT ''
);

COMMENT ON TABLE rule_version IS
    '阈值版本。新建版本只影响之后的判定；已固化的 visit.evaluation 永不改写。';

INSERT INTO rule_version (version, min_duration_sec, max_distance_m, created_by, note)
VALUES ('v1', 300, 500, 'system', '题面默认阈值：不足 5 分钟 / 超过 500 米');

ALTER TABLE visit ADD COLUMN evaluation jsonb;
ALTER TABLE visit ADD COLUMN rule_version text REFERENCES rule_version (version);

ALTER TABLE visit_flag ADD COLUMN rule_version text REFERENCES rule_version (version);

-- 回填：已有判定只有 flags，没有阈值。按 v1 重建一个快照，并标明来源，
-- 免得后来者以为这些行是签退时原样写下的。
UPDATE visit v
   SET rule_version = 'v1',
       evaluation = jsonb_build_object(
           'durationSec', v.duration_seconds,
           'distanceInM', NULL,
           'distanceOutM', NULL,
           'flags', COALESCE((
               SELECT jsonb_agg(jsonb_build_object('code', f.code, 'detail', f.detail)
                                ORDER BY f.code)
                 FROM visit_flag f
                WHERE f.visit_id = v.id), '[]'::jsonb),
           'abnormal', EXISTS (SELECT 1 FROM visit_flag f WHERE f.visit_id = v.id),
           'thresholds', jsonb_build_object('minDurationSec', 300, 'maxDistanceM', 500),
           'ruleVersion', 'v1',
           'evaluatedAt', to_jsonb(COALESCE(v.checkout_at, v.updated_at)),
           'source', 'backfill_migration')
 WHERE v.checkin_at IS NOT NULL
   AND v.checkout_at IS NOT NULL;

-- 作废的拜访当时补判过位置规则，把它们也补上（没有时长，只有签到点距离）。
UPDATE visit v
   SET rule_version = 'v1',
       evaluation = jsonb_build_object(
           'durationSec', NULL,
           'distanceInM', NULL,
           'distanceOutM', NULL,
           'flags', COALESCE((
               SELECT jsonb_agg(jsonb_build_object('code', f.code, 'detail', f.detail)
                                ORDER BY f.code)
                 FROM visit_flag f
                WHERE f.visit_id = v.id), '[]'::jsonb),
           'abnormal', EXISTS (SELECT 1 FROM visit_flag f WHERE f.visit_id = v.id),
           'thresholds', jsonb_build_object('minDurationSec', 300, 'maxDistanceM', 500),
           'ruleVersion', 'v1',
           'evaluatedAt', to_jsonb(v.voided_at),
           'source', 'backfill_migration')
 WHERE v.status = 'VOIDED'
   AND v.evaluation IS NULL;

UPDATE visit_flag SET rule_version = 'v1' WHERE rule_version IS NULL;

-- 按版本分组看板时用得上
CREATE INDEX idx_visit_rule_version ON visit (rule_version);
