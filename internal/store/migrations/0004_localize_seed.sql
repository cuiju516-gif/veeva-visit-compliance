-- 0004_localize_seed.sql — 把种子数据换成中文，与原型（demo/）一致
--
-- 这是数据迁移，不是结构迁移：字段、约束、索引都不动，只改名字。
-- 之所以不直接改 0002，是因为迁移只会跑一次——已经建好的库不会重放 0002，
-- 改它只会让"新库"和"老库"长出不同的数据，而没人能从版本号看出差别。
--
-- ID 一律不动：拜访表按 ID 外键引用，改 ID 会打断历史记录。

UPDATE mr SET name = '张伟', region = '华东一区' WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE mr SET name = '李娜', region = '华东一区' WHERE id = '11111111-1111-1111-1111-111111111112';

UPDATE hcp SET name = '李建国', department = '心内科'
 WHERE id = '22222222-2222-2222-2222-222222222221';
UPDATE hcp SET name = '王淑芬', department = '内分泌科'
 WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE hcp SET name = '陈志强', department = '神经内科'
 WHERE id = '22222222-2222-2222-2222-222222222223';

UPDATE hcp SET hospital_name = '示例三甲医院' WHERE hospital_name = 'Ruijin Hospital';
UPDATE hcp SET hospital_name = '示例医院东院' WHERE hospital_name = 'Huashan Hospital';

UPDATE product SET name = '可瑞达' WHERE id = '33333333-3333-3333-3333-333333333331';
UPDATE product SET name = '欧狄沃' WHERE id = '33333333-3333-3333-3333-333333333332';
UPDATE product SET name = '艾瑞妮' WHERE id = '33333333-3333-3333-3333-333333333333';
