-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- 主机： localhost
-- 生成日期： 2026-01-21 11:16:38
-- 服务器版本： 5.7.43-log
-- PHP 版本： 8.2.28

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- 数据库： `ette123`
--

-- --------------------------------------------------------

--
-- 表的结构 `account_log`
--

CREATE TABLE `account_log` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户ID',
  `pkgName` varchar(255) DEFAULT NULL COMMENT '会员套餐名称',
  `rebateUserId` int(11) DEFAULT NULL COMMENT '推荐人ID、返佣用户ID',
  `packageId` int(11) DEFAULT NULL COMMENT '充值套餐ID',
  `memberDays` int(11) DEFAULT NULL COMMENT '会员有效天数',
  `rechargeType` int(11) NOT NULL COMMENT '账户充值类型',
  `model3Count` int(11) NOT NULL COMMENT '模型3对话次数',
  `model4Count` int(11) NOT NULL COMMENT '模型4对话次数',
  `drawMjCount` int(11) NOT NULL COMMENT 'MJ绘画次数',
  `days` int(11) NOT NULL COMMENT '套餐有效期',
  `uid` varchar(255) NOT NULL COMMENT '随机订单uid',
  `extent` varchar(255) DEFAULT NULL COMMENT '扩展字段'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `app`
--

CREATE TABLE `app` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `name` varchar(255) NOT NULL COMMENT 'App应用名称',
  `catId` text NOT NULL COMMENT 'App分类Id列表，多个分类Id以逗号分隔',
  `des` varchar(255) NOT NULL COMMENT 'App应用描述信息',
  `preset` text NOT NULL COMMENT 'App应用预设场景信息',
  `coverImg` text COMMENT 'App应用封面图片',
  `order` int(11) NOT NULL DEFAULT '100' COMMENT 'App应用排序、数字越大越靠前',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT 'App应用是否启用中 0：禁用 1：启用',
  `demoData` text COMMENT 'App示例数据',
  `role` varchar(255) NOT NULL DEFAULT 'system' COMMENT 'App应用角色 system  user',
  `isGPTs` int(11) NOT NULL DEFAULT '0' COMMENT 'App应用是否是GPTs',
  `isFixedModel` int(11) NOT NULL DEFAULT '0' COMMENT 'App应用是否是固定使用模型',
  `appModel` text NOT NULL COMMENT 'App应用使用的模型',
  `gizmoID` varchar(255) NOT NULL DEFAULT '' COMMENT 'GPTs 的调用ID',
  `public` tinyint(4) NOT NULL DEFAULT '0' COMMENT 'App是否共享到应用广场',
  `userId` int(11) DEFAULT NULL COMMENT '用户Id',
  `isFlowith` int(11) NOT NULL DEFAULT '0' COMMENT '是否使用flowith模型',
  `flowithId` varchar(255) DEFAULT NULL COMMENT 'flowith模型ID',
  `flowithName` varchar(255) DEFAULT NULL COMMENT 'flowith模型名称',
  `flowithKey` varchar(255) DEFAULT NULL COMMENT 'flowith模型Key',
  `backgroundImg` text COMMENT 'App背景图',
  `prompt` text COMMENT 'App提问模版'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `app_cats`
--

CREATE TABLE `app_cats` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `name` varchar(255) NOT NULL COMMENT 'App分类名称',
  `order` int(11) NOT NULL DEFAULT '100' COMMENT 'App分类排序、数字越大越靠前',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT 'App分类是否启用中 0：禁用 1：启用',
  `isMember` int(11) NOT NULL DEFAULT '0' COMMENT 'App分类是否为会员专属 0：否 1：是',
  `hideFromNonMember` int(11) NOT NULL DEFAULT '0' COMMENT '非会员是否隐藏 0：否 1：是'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `auto_reply`
--

CREATE TABLE `auto_reply` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `prompt` text NOT NULL COMMENT '提问的问题',
  `answer` text NOT NULL COMMENT '定义的答案',
  `isAIReplyEnabled` int(11) NOT NULL DEFAULT '1' COMMENT '是否开启AI回复，0：关闭 1：启用',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT '启用当前自动回复状态， 0：关闭 1：启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `bad_words`
--

CREATE TABLE `bad_words` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `word` varchar(20) NOT NULL COMMENT '敏感词',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT '敏感词开启状态',
  `count` int(11) NOT NULL DEFAULT '0' COMMENT '敏感词触发次数'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `balance`
--

CREATE TABLE `balance` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户ID',
  `balance` int(11) NOT NULL COMMENT '用户账户余额',
  `usesLeft` int(11) NOT NULL COMMENT '用户使用次数余额',
  `paintCount` int(11) NOT NULL COMMENT '绘画使用次数余额',
  `useTokens` int(11) NOT NULL DEFAULT '0' COMMENT '用户总计使用的token数量',
  `useChats` int(11) NOT NULL DEFAULT '0' COMMENT '用户总计使用的对话次数',
  `usePaints` int(11) NOT NULL DEFAULT '0' COMMENT '用户总计使用的绘画次数'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `chatlog`
--

CREATE TABLE `chatlog` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户ID',
  `model` varchar(255) DEFAULT NULL COMMENT '使用的模型',
  `role` varchar(255) DEFAULT NULL COMMENT 'role system user assistant',
  `content` mediumtext COMMENT '模型内容',
  `reasoning_content` text COMMENT '模型推理内容',
  `tool_calls` text COMMENT '模型工具调用',
  `imageUrl` text COMMENT '图片Url',
  `videoUrl` text COMMENT '视频Url',
  `audioUrl` text COMMENT '音频Url',
  `fileUrl` text COMMENT '文件Url',
  `type` int(11) DEFAULT '1' COMMENT '使用类型1: 普通对话 2: 绘图 3: 拓展性对话',
  `modelName` varchar(255) DEFAULT 'AI' COMMENT '自定义的模型名称',
  `modelAvatar` varchar(255) NOT NULL DEFAULT '' COMMENT '自定义的模型头像',
  `curIp` varchar(255) DEFAULT NULL COMMENT 'Ip地址',
  `prompt` text COMMENT '询问的问题',
  `extraParam` varchar(255) DEFAULT NULL COMMENT '附加参数',
  `pluginParam` varchar(255) DEFAULT NULL COMMENT '插件参数',
  `answer` text COMMENT '回答的答案',
  `promptTokens` int(11) DEFAULT NULL COMMENT '提问的token',
  `completionTokens` int(11) DEFAULT NULL COMMENT '回答的token',
  `totalTokens` int(11) DEFAULT NULL COMMENT '总花费的token',
  `progress` varchar(255) DEFAULT NULL COMMENT '任务进度',
  `status` int(11) DEFAULT '3' COMMENT '任务状态',
  `action` varchar(255) DEFAULT NULL COMMENT '任务类型',
  `customId` text COMMENT '对图片操作的按钮ID',
  `drawId` varchar(255) DEFAULT NULL COMMENT '绘画的ID每条不一样',
  `ttsUrl` text COMMENT '对话转语音的链接',
  `rec` int(11) DEFAULT '0' COMMENT '是否推荐0: 默认 1: 推荐',
  `groupId` int(11) DEFAULT NULL COMMENT '分组ID',
  `appId` int(11) DEFAULT NULL COMMENT '使用的应用id',
  `isDelete` tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否删除',
  `taskId` varchar(255) DEFAULT NULL COMMENT '任务ID',
  `taskData` text COMMENT '任务数据',
  `fileInfo` text COMMENT '文件信息',
  `promptReference` varchar(255) DEFAULT NULL COMMENT '提问参考',
  `networkSearchResult` text COMMENT '联网搜索结果',
  `fileVectorResult` mediumtext COMMENT '文件向量搜索结果'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `chat_group`
--

CREATE TABLE `chat_group` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户ID',
  `isSticky` tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否置顶聊天',
  `title` varchar(255) DEFAULT NULL COMMENT '分组名称',
  `appId` int(11) DEFAULT NULL COMMENT '应用ID',
  `isDelete` tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否删除了',
  `config` text COMMENT '配置',
  `params` text COMMENT '附加参数',
  `fileUrl` text COMMENT '文件链接',
  `pdfTextContent` mediumtext COMMENT 'PDF中的文字内容'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `config`
--

CREATE TABLE `config` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `configKey` varchar(255) DEFAULT NULL COMMENT '配置名称',
  `configVal` text COMMENT '配置内容',
  `public` int(11) NOT NULL DEFAULT '0' COMMENT '配置是否公开，公开内容对前端项目展示  0：不公开 1：公开',
  `encrypt` int(11) NOT NULL DEFAULT '0' COMMENT '配置是否加密，加密内容仅仅super权限可看 0：不加 1：加',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT '配置状态 0:关闭 1：启用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `crami`
--

CREATE TABLE `crami` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `code` varchar(50) NOT NULL COMMENT '存储卡密CDK编码',
  `cramiType` int(11) NOT NULL DEFAULT '1' COMMENT '卡密CDK类型：1： 普通 | 2： 单人可使用一次 ',
  `packageId` int(11) DEFAULT NULL COMMENT '卡密CDK类型： 默认套餐类型 | 不填就是自定义类型',
  `status` int(11) NOT NULL DEFAULT '0' COMMENT '卡密CDK状态，如已使用、未使用等',
  `useId` int(11) DEFAULT NULL COMMENT '卡密使用账户用户ID信息',
  `days` int(11) NOT NULL DEFAULT '0' COMMENT '卡密有效期天数、从生成创建的时候开始计算，设为0则不限时间',
  `model3Count` int(11) DEFAULT NULL COMMENT '卡密模型3额度',
  `model4Count` int(11) DEFAULT NULL COMMENT '卡密模型4额度',
  `drawMjCount` int(11) DEFAULT NULL COMMENT '卡密MJ绘画额度',
  `appCats` varchar(255) DEFAULT '' COMMENT '卡密应用分类列表'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `crami_package`
--

CREATE TABLE `crami_package` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `name` varchar(255) NOT NULL COMMENT '套餐名称',
  `des` varchar(255) NOT NULL COMMENT '套餐介绍详细信息',
  `coverImg` varchar(255) DEFAULT NULL COMMENT '套餐封面图片',
  `price` decimal(10,2) NOT NULL COMMENT '套餐价格￥',
  `order` int(11) NOT NULL DEFAULT '100' COMMENT '套餐排序、数字越大越靠前',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT '套餐是否启用中 0：禁用 1：启用',
  `weight` int(11) NOT NULL COMMENT '套餐权重、数字越大表示套餐等级越高越贵',
  `days` int(11) NOT NULL DEFAULT '0' COMMENT '卡密有效期天数、从使用的时候开始计算，设为-1则不限时间',
  `model3Count` int(11) DEFAULT '0' COMMENT '套餐包含的模型3数量',
  `model4Count` int(11) DEFAULT '0' COMMENT '套餐包含的模型4数量',
  `drawMjCount` int(11) DEFAULT '0' COMMENT '套餐包含的MJ绘画数量',
  `appCats` varchar(255) DEFAULT '' COMMENT '套餐包含的应用分类列表'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `fingerprint_log`
--

CREATE TABLE `fingerprint_log` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `fingerprint` varchar(255) NOT NULL COMMENT '指纹ID',
  `model3Count` int(11) NOT NULL COMMENT '模型3对话次数',
  `model4Count` int(11) NOT NULL COMMENT '模型4对话次数',
  `drawMjCount` int(11) NOT NULL COMMENT 'MJ绘画次数'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `models`
--

CREATE TABLE `models` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `keyType` int(11) NOT NULL COMMENT '模型类型 1: 普通对话 2: 绘画  3:高级对话',
  `modelName` varchar(255) NOT NULL COMMENT '模型名称',
  `model` varchar(255) NOT NULL COMMENT '绑定的模型是？',
  `modelAvatar` varchar(1024) DEFAULT NULL COMMENT '模型头像',
  `modelOrder` int(11) NOT NULL DEFAULT '1' COMMENT '模型排序',
  `maxModelTokens` int(11) DEFAULT '64000' COMMENT '模型上下文支持的最大Tokens',
  `max_tokens` int(11) DEFAULT '4096' COMMENT '模型回复最大Tokens',
  `maxRounds` int(11) DEFAULT NULL COMMENT '模型上下文最大条数',
  `timeout` int(11) DEFAULT NULL COMMENT '模型上下文最大条数',
  `deduct` int(11) NOT NULL DEFAULT '1' COMMENT '模型单次调用扣除的次数',
  `deductDeepThink` int(11) NOT NULL DEFAULT '1' COMMENT '模型开启深度思考后积分扣除的系数',
  `deductType` int(11) NOT NULL DEFAULT '1' COMMENT '模型扣除余额类型 1: 普通模型 2: 高级模型',
  `isTokenBased` tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否使用token计费: 0:不是 1: 是',
  `isFileUpload` int(11) NOT NULL DEFAULT '0' COMMENT '文件解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:向量解析(内置文件分析,支持全模型分析带文字的文件)',
  `isImageUpload` int(11) NOT NULL DEFAULT '0' COMMENT '图片解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:GPT Vision 3:全局解析(支持所有格式的图片解析)',
  `tokenFeeRatio` int(11) NOT NULL DEFAULT '0' COMMENT 'token计费比例',
  `remark` varchar(255) DEFAULT NULL COMMENT '模型附加信息',
  `key` varchar(255) DEFAULT NULL COMMENT '模型的key',
  `status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '使用的状态: 0:禁用 1：启用',
  `useCount` int(11) NOT NULL DEFAULT '0' COMMENT 'key的使用次数',
  `useToken` int(11) NOT NULL DEFAULT '0' COMMENT 'key的已经使用的token数量',
  `proxyUrl` varchar(255) DEFAULT NULL COMMENT '当前模型的代理地址',
  `modelLimits` int(11) NOT NULL DEFAULT '999' COMMENT '模型频率限制 次/小时',
  `modelDescription` varchar(255) DEFAULT NULL COMMENT '模型介绍',
  `isNetworkSearch` tinyint(4) DEFAULT '1' COMMENT '开启联网搜索',
  `deepThinkingType` int(11) DEFAULT '0' COMMENT '深度思考类型 0:关闭 1:全局思考 2:模型思考',
  `isMcpTool` tinyint(4) DEFAULT '0' COMMENT '是否支持MCP工具',
  `systemPrompt` varchar(255) DEFAULT NULL COMMENT '模型system预设',
  `systemPromptType` int(11) DEFAULT '0' COMMENT '预设类型 0:关闭预设 1: 附加模式 2: 覆盖模式',
  `drawingType` int(11) DEFAULT '0' COMMENT '绘画类型: 0:不是绘画 1:dalle兼容 2:gpt-image-1兼容 3:midjourney 4:chat正则提取 5:豆包'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `order`
--

CREATE TABLE `order` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `orderId` varchar(64) NOT NULL COMMENT '订单ID',
  `tradeId` varchar(32) DEFAULT NULL COMMENT '交易ID（服务商）',
  `payPlatform` varchar(32) DEFAULT NULL COMMENT '支付平台【epay|hupi|ltzf】）',
  `userId` int(11) DEFAULT NULL COMMENT '用户ID',
  `goodsId` int(11) DEFAULT NULL COMMENT '商品ID',
  `count` int(11) NOT NULL DEFAULT '1' COMMENT '数量',
  `price` decimal(10,2) NOT NULL COMMENT '套餐价格￥',
  `total` decimal(10,2) NOT NULL COMMENT '订单总金额',
  `status` int(11) NOT NULL DEFAULT '0' COMMENT '订单状态（0：未支付、1：已支付、2、支付失败、3：支付超时）',
  `paydAt` datetime DEFAULT NULL COMMENT '支付时间',
  `channel` varchar(32) DEFAULT NULL COMMENT '支付渠道）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `plugin`
--

CREATE TABLE `plugin` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `name` varchar(255) NOT NULL COMMENT '插件名称',
  `pluginImg` text COMMENT '插件封面',
  `description` varchar(255) NOT NULL COMMENT '插件描述',
  `isEnabled` int(11) NOT NULL DEFAULT '1' COMMENT '插件是否启用 0：禁用 1：启用',
  `parameters` text NOT NULL COMMENT '调用参数',
  `sortOrder` int(11) NOT NULL DEFAULT '0' COMMENT '排序值'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `share`
--

CREATE TABLE `share` (
  `id` int(11) NOT NULL,
  `shareCode` varchar(8) NOT NULL,
  `htmlContent` mediumtext NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `signin`
--

CREATE TABLE `signin` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户ID',
  `signInDate` varchar(255) NOT NULL COMMENT '签到日期',
  `signInTime` datetime NOT NULL COMMENT '签到时间',
  `isSigned` tinyint(4) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `username` varchar(12) NOT NULL COMMENT '用户昵称',
  `password` varchar(64) DEFAULT NULL COMMENT '用户密码',
  `status` int(11) NOT NULL DEFAULT '0' COMMENT '用户状态',
  `sex` int(11) NOT NULL DEFAULT '1' COMMENT '用户性别',
  `nickname` varchar(255) DEFAULT NULL COMMENT '用户昵称',
  `email` varchar(64) NOT NULL COMMENT '用户邮箱',
  `phone` varchar(64) DEFAULT NULL COMMENT '用户手机号',
  `avatar` varchar(300) DEFAULT '' COMMENT '用户头像',
  `sign` varchar(300) DEFAULT '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。' COMMENT '用户签名',
  `registerIp` varchar(64) DEFAULT '' COMMENT '注册IP',
  `lastLoginIp` varchar(64) DEFAULT '' COMMENT '最后一次登录IP',
  `inviteCode` varchar(10) NOT NULL DEFAULT '' COMMENT '用户邀请码',
  `invitedBy` varchar(10) NOT NULL DEFAULT '' COMMENT '用户填写的别人的邀请码',
  `role` varchar(10) NOT NULL DEFAULT 'viewer' COMMENT '用户角色',
  `openId` varchar(64) DEFAULT '' COMMENT '微信openId',
  `client` varchar(64) DEFAULT NULL COMMENT '用户注册来源',
  `inviteLinkCount` int(11) NOT NULL DEFAULT '0' COMMENT '用户邀请链接被点击次数',
  `consecutiveDays` int(11) NOT NULL DEFAULT '0' COMMENT '用户连续签到天数',
  `violationCount` int(11) NOT NULL DEFAULT '0' COMMENT '用户违规记录次数',
  `realName` varchar(255) DEFAULT NULL COMMENT '真实姓名',
  `idCard` varchar(255) DEFAULT NULL COMMENT '身份证号'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- 转存表中的数据 `users`
--

INSERT INTO `users` (`id`, `createdAt`, `updatedAt`, `deletedAt`, `username`, `password`, `status`, `sex`, `nickname`, `email`, `phone`, `avatar`, `sign`, `registerIp`, `lastLoginIp`, `inviteCode`, `invitedBy`, `role`, `openId`, `client`, `inviteLinkCount`, `consecutiveDays`, `violationCount`, `realName`, `idCard`) VALUES
(1, '2025-12-20 22:45:20.013686', '2026-01-09 00:17:57.000000', NULL, 'super', '$2a$10$9uCunvaGbukxPxMajMSSNe2KGRA1FyXH24kHFrzQ3gzNXePgSJ81O', 1, 1, NULL, 'super', NULL, '', '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。', '', '39.144.104.211', '', '', 'super', '', NULL, 0, 0, 0, NULL, NULL),
(2, '2025-12-21 22:21:04.325813', '2026-01-08 01:20:24.000000', NULL, '9612cea48', '$2a$10$hzXi7wzi8/lCVM1Isoik4OmU7MhIcFqJd61y/3TpF/YLR7g25/iX2', 1, 1, NULL, '762741565@qq.com', NULL, '', '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。', '', '180.165.0.60', '', '', 'viewer', '', NULL, 0, 0, 0, NULL, NULL),
(3, '2026-01-08 01:31:30.402803', '2026-01-08 01:42:49.000000', NULL, '用户909e11f26', NULL, 1, 0, '昱通智联团队', '399274110@default.com', NULL, 'https://thirdwx.qlogo.cn/mmopen/vi_32/GWeBoibVCzHjRO8eYZb6BQvBEI2cMOaVOQibAnNib8a7I7VrzkmalPrPP0kU0jOaSHItiaxfGZfEW6fJLSwaFOUuqTsPZmqUfkHvSBNOibCkukHY/132', '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。', '', '180.165.0.60', '', '', 'viewer', 'o6jQu3PQEt7MOMMrSh2uyUuWcfcs', NULL, 0, 0, 0, NULL, NULL),
(4, '2026-01-08 01:33:48.912833', '2026-01-11 17:16:36.000000', NULL, '用户c5876d10a', NULL, 1, 0, '怡然爱你', 'ccf1f2d9a@default.com', NULL, 'https://thirdwx.qlogo.cn/mmopen/vi_32/lGiajM8Pt8If7LNlnumkNL4yhbeKLg0vSzhvyulu4w4fIsUJhKQeuCAJBPGIkleibMCt19dNicSKOaZe6DBgNY9VhOhfKtylu7T80DXaiacMj0Q/132', '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。', '', '116.52.224.197', '', '', 'viewer', 'o6jQu3Do8OSVIKmXeFuvhquIpIu4', NULL, 0, 0, 0, NULL, NULL);

-- --------------------------------------------------------

--
-- 表的结构 `user_apps`
--

CREATE TABLE `user_apps` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户ID',
  `appId` int(11) NOT NULL COMMENT '应用ID',
  `appType` varchar(255) NOT NULL DEFAULT 'user' COMMENT 'app类型 system/user',
  `public` tinyint(4) NOT NULL DEFAULT '0' COMMENT '是否公开到公告菜单',
  `status` int(11) NOT NULL DEFAULT '1' COMMENT 'app状态 1正常 2审核 3违规',
  `order` int(11) NOT NULL DEFAULT '100' COMMENT 'App应用排序、数字越大越靠前'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `user_balances`
--

CREATE TABLE `user_balances` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户ID',
  `model3Count` int(11) DEFAULT NULL COMMENT '充值的套餐包含的模型3次数',
  `model4Count` int(11) DEFAULT NULL COMMENT '充值的套餐包含的模型4次数',
  `drawMjCount` int(11) DEFAULT NULL COMMENT '充值的套餐包含的MJ绘画次数',
  `packageId` int(11) DEFAULT '0' COMMENT '当前使用的套餐ID',
  `memberModel3Count` int(11) DEFAULT '0' COMMENT '会员模型3额度',
  `memberModel4Count` int(11) DEFAULT '0' COMMENT '会员模型4额度',
  `memberDrawMjCount` int(11) DEFAULT '0' COMMENT '会员MJ绘画额度',
  `useModel3Count` int(11) DEFAULT NULL COMMENT '已经使用的对话3的模型次数',
  `useModel4Count` int(11) DEFAULT NULL COMMENT '已经使用的对话4的模型次数',
  `useModel3Token` int(11) DEFAULT NULL COMMENT '已经使用的对话3的模型Token',
  `useModel4Token` int(11) DEFAULT NULL COMMENT '已经使用的对话4的模型Token',
  `useDrawMjToken` int(11) DEFAULT NULL COMMENT '已经使用的MJ绘画Token',
  `extent` varchar(255) DEFAULT NULL COMMENT '扩展字段',
  `expirationTime` datetime DEFAULT NULL COMMENT '会员到期时间',
  `appCats` varchar(255) DEFAULT '' COMMENT '套餐应用分类列表'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `verification`
--

CREATE TABLE `verification` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户id',
  `type` int(11) NOT NULL COMMENT '验证类型',
  `code` int(11) NOT NULL COMMENT '验证码',
  `expiresAt` datetime NOT NULL COMMENT '过期时间',
  `email` varchar(64) NOT NULL COMMENT '发送的邮箱',
  `used` int(11) NOT NULL DEFAULT '0' COMMENT '是否已经使用了'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `violation_log`
--

CREATE TABLE `violation_log` (
  `id` int(11) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
  `deletedAt` datetime(6) DEFAULT NULL COMMENT '删除时间',
  `userId` int(11) NOT NULL COMMENT '用户id',
  `content` text NOT NULL COMMENT '违规内容',
  `words` text NOT NULL COMMENT '敏感词',
  `typeCn` varchar(255) NOT NULL COMMENT '违规类型',
  `typeOriginCn` varchar(255) NOT NULL COMMENT '违规检测失败于哪个平台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- 转储表的索引
--

--
-- 表的索引 `account_log`
--
ALTER TABLE `account_log`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `app`
--
ALTER TABLE `app`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_f36adbb7b096ceeb6f3e80ad14` (`name`);

--
-- 表的索引 `app_cats`
--
ALTER TABLE `app_cats`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_4c4a22756449e89d1c44d83944` (`name`);

--
-- 表的索引 `auto_reply`
--
ALTER TABLE `auto_reply`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `bad_words`
--
ALTER TABLE `bad_words`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `balance`
--
ALTER TABLE `balance`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `chatlog`
--
ALTER TABLE `chatlog`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `chat_group`
--
ALTER TABLE `chat_group`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `config`
--
ALTER TABLE `config`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `crami`
--
ALTER TABLE `crami`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_c29225917c12b853cb03f2a2bc` (`code`);

--
-- 表的索引 `crami_package`
--
ALTER TABLE `crami_package`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_0c585daa9afe46aaf9aaf70645` (`name`),
  ADD UNIQUE KEY `IDX_fea6cf9fe60adb96dde1bc1982` (`weight`);

--
-- 表的索引 `fingerprint_log`
--
ALTER TABLE `fingerprint_log`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `models`
--
ALTER TABLE `models`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `order`
--
ALTER TABLE `order`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_b075313d4d7e1c12f1a6e6359e` (`orderId`),
  ADD UNIQUE KEY `IDX_cad80a7a8144b571642784a8cc` (`tradeId`);

--
-- 表的索引 `plugin`
--
ALTER TABLE `plugin`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_9fad326649a503cc8122df59d9` (`name`);

--
-- 表的索引 `share`
--
ALTER TABLE `share`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_85a3dcb2066d1599654c1ac19c` (`shareCode`);

--
-- 表的索引 `signin`
--
ALTER TABLE `signin`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `IDX_97672ac88f789774dd47f7c8be` (`email`);

--
-- 表的索引 `user_apps`
--
ALTER TABLE `user_apps`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `user_balances`
--
ALTER TABLE `user_balances`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `verification`
--
ALTER TABLE `verification`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `violation_log`
--
ALTER TABLE `violation_log`
  ADD PRIMARY KEY (`id`);

--
-- 在导出的表使用AUTO_INCREMENT
--

--
-- 使用表AUTO_INCREMENT `account_log`
--
ALTER TABLE `account_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `app`
--
ALTER TABLE `app`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `app_cats`
--
ALTER TABLE `app_cats`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `auto_reply`
--
ALTER TABLE `auto_reply`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `bad_words`
--
ALTER TABLE `bad_words`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `balance`
--
ALTER TABLE `balance`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `chatlog`
--
ALTER TABLE `chatlog`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `chat_group`
--
ALTER TABLE `chat_group`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `config`
--
ALTER TABLE `config`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `crami`
--
ALTER TABLE `crami`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `crami_package`
--
ALTER TABLE `crami_package`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `fingerprint_log`
--
ALTER TABLE `fingerprint_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `models`
--
ALTER TABLE `models`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `order`
--
ALTER TABLE `order`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `plugin`
--
ALTER TABLE `plugin`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `share`
--
ALTER TABLE `share`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `signin`
--
ALTER TABLE `signin`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- 使用表AUTO_INCREMENT `user_apps`
--
ALTER TABLE `user_apps`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `user_balances`
--
ALTER TABLE `user_balances`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `verification`
--
ALTER TABLE `verification`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `violation_log`
--
ALTER TABLE `violation_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
