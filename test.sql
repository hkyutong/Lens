SET NAMES utf8mb4;
START TRANSACTION;

UPDATE `config`
SET `configVal` = '基础积分', `public` = 1, `encrypt` = 0, `status` = 1
WHERE `configKey` = 'model3Name';

UPDATE `config`
SET `configVal` = '高级积分', `public` = 1, `encrypt` = 0, `status` = 1
WHERE `configKey` = 'model4Name';

UPDATE `config`
SET `configVal` = '顶级模型额度', `public` = 1, `encrypt` = 0, `status` = 1
WHERE `configKey` = 'drawMjName';

DELETE FROM `crami_package`
WHERE `name` LIKE 'E2E会员包-%'
   OR `name` IN ('轻用版', '专业版', '旗舰版', 'Plus', 'Pro', 'Max', 'Team', '高级模型加油包', '顶级模型加油包', '高级积分加油包', '顶级积分加油包')
   OR `weight` IN (10, 20, 30, 40, 101, 102);

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
  'Plus',
  '适合日常问答、轻写作与基础资料整理，低门槛上手，先用起来。',
  NULL,
  80.00,
  100,
  1,
  10,
  30,
  1200,
  80,
  5,
  ''
),
(
  NOW(6), NOW(6), NULL,
  'Pro',
  '最受欢迎，适合高频写作、深度总结与正式交付，基础模型更充足，并附带可用的高级模型额度。',
  NULL,
  145.00,
  200,
  1,
  20,
  30,
  3600,
  360,
  24,
  ''
),
(
  NOW(6), NOW(6), NULL,
  'Max',
  '面向重度研究与关键成果交付，高级模型与顶级模型额度更宽裕，适合复杂任务和高强度工作流。',
  NULL,
  220.00,
  300,
  1,
  30,
  30,
  12000,
  1200,
  100,
  ''
),
(
  NOW(6), NOW(6), NULL,
  'Team',
  '为 3 人起步的科研小团队准备，适合课题组、实验室和协作写作场景，把论文阅读、综述整理、学术写作与阶段性交付放到同一套稳定工作流里推进。',
  NULL,
  258.00,
  400,
  1,
  40,
  30,
  12000,
  2000,
  500,
  ''
);

COMMIT;
