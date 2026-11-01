-- 0005_hospital_and_snapshots.sql — 医院独立成表 + 拜访快照
--
-- 两个决定合在一个迁移里，因为它们互为前提：
--   * 医院独立成表，才能"下线一家医院"——v1 把坐标挂在医生身上，改错一次要把整院的医生改一遍；
--   * 拜访落库时快照，历史记录才能不依赖主数据现状——否则删一个医生就把历史打成悬空外键。
-- 顺序也是硬约束：先回填 visit 的快照（读的是 hcp 上的旧列），再拆 hcp 的三列。
--
-- 设计理由见 docs/adr/0002-data-model.md（D1′）。

CREATE TABLE hospital (
    id         uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text             NOT NULL,
    base_lat   double precision NOT NULL CHECK (base_lat BETWEEN -90 AND 90),
    base_lng   double precision NOT NULL CHECK (base_lng BETWEEN -180 AND 180),
    status     text             NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    deleted_at timestamptz,
    created_at timestamptz      NOT NULL DEFAULT now()
);

COMMENT ON COLUMN hospital.base_lat IS
    'R2 的唯一参照点。改坐标不回算历史拜访——判定快照落在 visit 上。';

-- 同一医院可能有多位医生，按 (名称, 坐标) 去重后各生成一行。
INSERT INTO hospital (name, base_lat, base_lng)
SELECT DISTINCT ON (h.hospital_name, h.base_lat, h.base_lng)
       h.hospital_name, h.base_lat, h.base_lng
  FROM hcp h
 ORDER BY h.hospital_name, h.base_lat, h.base_lng;

CREATE UNIQUE INDEX uq_hospital_identity
    ON hospital (name, base_lat, base_lng) WHERE deleted_at IS NULL;

ALTER TABLE hcp ADD COLUMN hospital_id uuid REFERENCES hospital (id);

UPDATE hcp h
   SET hospital_id = s.id
  FROM hospital s
 WHERE s.name     = h.hospital_name
   AND s.base_lat = h.base_lat
   AND s.base_lng = h.base_lng;

ALTER TABLE hcp ALTER COLUMN hospital_id SET NOT NULL;

CREATE INDEX idx_hcp_hospital ON hcp (hospital_id, department);
CREATE INDEX idx_hospital_available ON hospital (status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 拜访快照：落库时把展示与判定所需的字段抄一份，此后不再 join 主数据
-- ---------------------------------------------------------------------------
ALTER TABLE visit
    ADD COLUMN hcp_name      text,
    ADD COLUMN department    text,
    ADD COLUMN hospital_name text,
    ADD COLUMN base_lat      double precision,
    ADD COLUMN base_lng      double precision,
    ADD COLUMN product_name  text;

-- 必须在删 hcp 的列之前：这几行读的就是旧列。
UPDATE visit v
   SET hcp_name      = h.name,
       department    = h.department,
       hospital_name = h.hospital_name,
       base_lat      = h.base_lat,
       base_lng      = h.base_lng,
       product_name  = p.name
  FROM hcp h, product p
 WHERE h.id = v.hcp_id
   AND p.id = v.product_id;

ALTER TABLE visit
    ALTER COLUMN hcp_name      SET NOT NULL,
    ALTER COLUMN department    SET NOT NULL,
    ALTER COLUMN hospital_name SET NOT NULL,
    ALTER COLUMN base_lat      SET NOT NULL,
    ALTER COLUMN base_lng      SET NOT NULL,
    ALTER COLUMN product_name  SET NOT NULL;

COMMENT ON COLUMN visit.hcp_name IS
    '落库时的快照。医生改名不会回溯——修正姓名要走主数据修正 + 带审计的回填，不是靠 join。';

-- 坐标与院名从此只有一处定义。任何仍按旧列写的 SQL 会直接报 column does not exist，
-- 这正是想要的失败方式：比静默读到旧坐标好。
DROP INDEX idx_hcp_site;
ALTER TABLE hcp
    DROP COLUMN hospital_name,
    DROP COLUMN base_lat,
    DROP COLUMN base_lng;

-- 主数据逻辑删除（契约 §2.2 第六处）
ALTER TABLE hcp
    ADD COLUMN status     text        NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    ADD COLUMN deleted_at timestamptz;

ALTER TABLE product
    ADD COLUMN status     text        NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    ADD COLUMN deleted_at timestamptz;

CREATE INDEX idx_hcp_available     ON hcp (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_available ON product (status) WHERE deleted_at IS NULL;

COMMENT ON COLUMN hcp.deleted_at IS
    '逻辑删除：永不做物理删除。历史拜访读 visit 上的快照，不读本表。';
