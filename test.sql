SET NAMES utf8mb4;
START TRANSACTION;

UPDATE `config`
SET `configVal` = '基础模型额度', `public` = 1, `encrypt` = 0, `status` = 1
WHERE `configKey` = 'model3Name';

UPDATE `config`
SET `configVal` = '高级模型额度', `public` = 1, `encrypt` = 0, `status` = 1
WHERE `configKey` = 'model4Name';

UPDATE `config`
SET `configVal` = '特殊模型额度', `public` = 1, `encrypt` = 0, `status` = 1
WHERE `configKey` = 'drawMjName';

DELETE FROM `crami_package`
WHERE `name` LIKE 'E2E会员包-%'
   OR `name` IN ('轻用版', '专业版', '旗舰版', '高级模型加油包', '特殊模型加油包')
   OR `weight` IN (10, 20, 30, 101, 102);

INSERT INTO `crami_package` (
  `createdAt`,
  `updatedAt`,
  `deletedAt`,
  `name`,
  `des`,
  `coverImg`,
  `price`,
  `order`,
  `status`,
  `weight`,
  `days`,
  `model3Count`,
  `model4Count`,
  `drawMjCount`,
  `appCats`
) VALUES
(
  NOW(6), NOW(6), NULL,
  '轻用版',
  '适合日常问答、轻写作与基础资料整理，低门槛上手，先用起来。',
  NULL,
  59.00,
  100,
  1,
  10,
  30,
  600,
  30,
  0,
  ''
),
(
  NOW(6), NOW(6), NULL,
  '专业版',
  '最受欢迎，适合高频写作、深度总结与正式交付，基础模型更充足，并附带可用的高级模型额度。',
  NULL,
  149.00,
  300,
  1,
  20,
  30,
  2500,
  220,
  12,
  ''
),
(
  NOW(6), NOW(6), NULL,
  '旗舰版',
  '面向重度研究与关键成果交付，高级模型与特殊模型额度更宽裕，适合复杂任务和高强度工作流。',
  NULL,
  399.00,
  200,
  1,
  30,
  30,
  8000,
  900,
  60,
  ''
),
(
  NOW(6), NOW(6), NULL,
  '高级模型加油包',
  '复杂任务按需补充，不影响当前套餐周期，适合临时跑长文档、推理和重要输出。',
  NULL,
  69.00,
  90,
  1,
  101,
  -1,
  0,
  80,
  0,
  ''
),
(
  NOW(6), NOW(6), NULL,
  '特殊模型加油包',
  '稀缺高价值模型专用，只在真正需要时购买，适合关键任务按需补充。',
  NULL,
  129.00,
  80,
  1,
  102,
  -1,
  0,
  0,
  15,
  ''
);

COMMIT;
