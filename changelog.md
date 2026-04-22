# 更新日志

## 0.0.83 (2026-04-22)
- 支付确认页价格展示继续统一为美元：`chat/src/components/Settings/MemberPayment.vue` 不再在商品支付页展示人民币 `￥`，顶部“需要支付”、右侧“折合每月”、年付“按月购买”和“节省”均改为读取后端 `displayPrice / displayMonthlyEquivalentPrice / displayOriginalTotal / displaySaveAmount` 并显示 `$ ... USD`。影响范围：仅支付确认页的价格展示文案；订单创建仍只传 `goodsId / payType / billingCycle`，真实订单金额、支付通道结算和会员到账仍由后端人民币 `price` 计费快照决定。回滚方式：恢复 `MemberPayment.vue` 到上一版并重新构建同步 `chat/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仅有既有 Vite 动静态导入 warning。

## 0.0.82 (2026-04-22)
- 套餐价格模型纠偏：会员套餐不再用同一个 `price` 同时承担前台美元展示和付款金额；后端 `crami_package` 新增 `usdPrice` 字段作为前台会员页美元展示价，原 `price` 保持人民币付款价。影响范围：套餐查询、会员页展示、支付确认页、后台套餐管理和订单计费快照；不改变会员到账、卡密兑换、学术权限和支付回调链路。回滚方式：回退本次代码并从服务器 `backups/crami_package-before-usd-price-20260422160331.sql` 恢复 `crami_package` 表，再重新构建同步。
- 前台显示与付款分离：`chat/src/components/Settings/MemberCenter.vue` 的 Plus / Pro / Max 官方卡片展示美元 `displayPrice`，因此 Plus/Pro/Max 月付显示分别为 `$6 / $20 / $30`；`chat/src/components/Settings/MemberPayment.vue` 支付确认页始终显示人民币 `price`，因此付款仍为 `￥45 / ￥140 / ￥210`。年付同样分别用美元展示字段和人民币结算字段计算折扣，不再出现 `$45` 这种把人民币错当美元展示的问题。
- 后台套餐管理补齐双价格：`admin/src/views/package/package.vue` 的套餐列表和编辑弹窗新增“美元展示价”和“人民币付款价”两个独立字段，后台可分别配置前台展示美元价与实际支付人民币价。`service/src/modules/crami/dto/createPackage.dto.ts`、`crami.service.ts`、`cramiPackage.entity.ts` 和 `package-pricing.util.ts` 已同步支持 `usdPrice` 与 `displayPrice` 计费快照。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`./admin/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production`、`./admin/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Vite chunk/import warning 和 Browserslist 提示。
- 已完成 GitHub 与服务器同步：提交 `69e6640 fix: split usd display and cny payment prices` 已推送到 `origin/main`；`chat/dist`、`admin/dist`、`service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。同步前已备份 `public/chat`、`public/admin`、`dist` 与 `crami_package`，备份路径为 `backups/public-chat-before-split-price-20260422160331.tar.gz`、`backups/public-admin-before-split-price-20260422160331.tar.gz`、`backups/service-dist-before-split-price-20260422160331.tar.gz`、`backups/crami_package-before-usd-price-20260422160331.sql`；数据库迁移后已初始化 `Plus=6 / Pro=20 / Max=30` 的 `usdPrice`。`9520` 主服务已从 PID `3220959` 切换到 PID `503151`，`38000` 学术服务未重启；线上 `https://lens.yutoai.net/?v=20260422160331` 与 `https://lens.yutoai.net/alice3306/?v=20260422160331` 均返回 `HTTP 200`，接口已确认返回 `price=45/140/210` 与 `usdPrice=6/20/30`，AppleDouble `._*` 元数据文件为 0。

## 0.0.81 (2026-04-22)
- 会员套餐美元展示价改为后台可调：`chat/src/components/Settings/MemberCenter.vue` 已移除官方 Plus / Pro / Max 的 `$6 / $20 / $30` 前端硬编码，会员卡片展示价现在统一读取后台套餐 `price` 与后端返回的 `billingOptions`，官方套餐继续显示 `USD`，自定义套餐继续显示 `CNY`。影响范围：仅会员套餐展示价与支付确认页展示币种；不改变套餐表结构、支付接口、订单创建参数或会员到账逻辑。回滚方式：恢复本次 `MemberCenter.vue`、`MemberPayment.vue` 与全局订单信息字段变更后重新构建同步 `chat/dist`。
- 支付确认页币种一致：`chat/src/components/Settings/MemberPayment.vue` 会读取订单上下文中的 `displayCurrencySymbol`，官方套餐从会员卡片进入支付时继续显示 `$`，避免会员页美元价和支付页人民币符号不一致；默认空订单仍回退 `¥`。
- 后台套餐价格提示收口：`admin/src/views/package/package.vue` 的套餐价格输入提示已说明“官方套餐前台按 USD 展示；自定义套餐按 CNY 展示”，避免后台误以为该字段只服务人民币展示。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`./admin/node_modules/.bin/vue-tsc --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `./admin/node_modules/.bin/vite build --mode=production`；构建仅有既有 Vite chunk warning 与 Browserslist 提示。
- 已完成 GitHub 与服务器同步：提交 `8eb2395 fix: use admin price for plan display` 已推送到 `origin/main`；最新 `chat/dist` 与 `admin/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat` 与 `/www/wwwroot/Lens/AIWebQuickDeploy/public/admin`。同步前已备份 `public/chat` 到 `backups/public-chat-before-admin-price-20260422153900.tar.gz`，备份 `public/admin` 到 `backups/public-admin-before-admin-price-20260422153900.tar.gz`；本轮未重启服务，`9520` 保持 PID `3220959`，`38000` 保持 `4048524/2995907`。线上 `https://lens.yutoai.net/?v=202604221540` 与 `https://lens.yutoai.net/alice3306/?v=202604221540` 均返回 `HTTP 200`，服务器已确认 `public/chat` 包含 `displayCurrencySymbol`，`public/admin` 包含新的 USD 提示，AppleDouble `._*` 元数据文件为 0。

## 0.0.80 (2026-04-22)
- 用户必读多语言修复：`chat/src/components/Settings/NoticeDialog.vue` 的套餐规则结构化展示已改为通过 `vue-i18n` 读取语言包，不再在组件内硬编码中文套餐说明；`zh-CN / en-US / zh-TW / ja-JP / ko-KR` 已补齐 `lens.usageNotice` 文案。影响范围：仅设置页“用户必读”结构化套餐规则展示；不改变线上公告数据库内容、套餐限制、后端校验、计费逻辑或 Markdown 兜底公告渲染。回滚方式：恢复 `NoticeDialog.vue` 和对应语言包变更后重新构建同步 `chat/dist`。
- 本地验证通过：已执行 5 个语言包 JSON 解析校验、`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `61a4de4 fix: localize usage notice` 已推送到 `origin/main`；最新 `chat/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。同步前已备份 `public/chat` 到 `backups/public-chat-before-usage-notice-i18n-20260422150915.tar.gz`，压缩包方式部署前再次备份到 `backups/public-chat-before-usage-notice-i18n-tar-20260422151517.tar.gz`；本轮未重启服务，`9520` 保持 PID `3220959`，`38000` 保持 `4048524/2995907`。线上 `https://lens.yutoai.net/?v=202604221515` 返回 `HTTP 200`，服务器前端产物已确认包含英文用户必读文案，部署过程中产生的 AppleDouble `._*` 元数据文件已清理为 0。

## 0.0.79 (2026-04-22)
- 用户必读排版优化：`chat/src/components/Settings/NoticeDialog.vue` 针对 Lens 套餐规则公告新增结构化展示，不再把套餐规则作为原始 Markdown 大标题和长列表直接渲染；当前展示改为顶部说明、Plus/Pro/Max 三列能力对比、计费与有效期、任务执行说明四个清晰区域。影响范围：仅设置页“用户必读”公告的前端展示排版；不改变公告数据库内容、套餐权限、后端校验或计费逻辑。回滚方式：恢复 `NoticeDialog.vue` 到上一版并重新构建同步 `chat/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `e287009 refactor: improve usage notice layout` 已推送到 `origin/main`；最新 `chat/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，同步前已备份 `public/chat` 到 `backups/public-chat-before-usage-notice-layout-20260422025347.tar.gz`。本轮未重启服务，`9520` 保持 PID `3220959`，`38000` 保持 `4048524/2995907`；线上 `https://lens.yutoai.net/?v=202604220254` 返回 `HTTP 200`，服务器前端产物已确认包含 `usage-notice__plans` 结构化版式。

## 0.0.78 (2026-04-22)
- 用户必读内容替换：`chat/src/components/Settings/NoticeDialog.vue` 不再使用初始化时解构出的旧 `noticeInfo`，改为响应式读取全局公告内容，并在公告为空时回退到新的套餐规则说明；新增 `chat/src/constants/usageNotice.ts` 作为前端默认“用户必读”内容。影响范围：设置弹窗“使用必读/用户必读”展示内容；不改变用户协议、隐私政策或登录协议弹窗。回滚方式：恢复 `NoticeDialog.vue` 和默认内容常量后重新构建同步 `chat/dist`。
- 后端默认公告替换：新增 `service/src/common/constants/usageNotice.constant.ts`，`DatabaseService.createBaseSiteConfig` 的新环境默认公告改为套餐使用规则，并补齐默认 `noticeTitle=用户必读`；原初始化公告中的老登录说明不再作为默认内容。影响范围：新部署或初始化场景的公告默认值；不改变现有用户、套餐、支付或会员数据结构。回滚方式：恢复 `DatabaseService` 默认 `noticeInfo` 后重新构建同步 `service/dist`。
- 线上公告配置已更新：同步前已备份 `public/chat` 与 `service/dist` 到服务器 `backups/public-chat-before-usage-notice-20260422022427.tar.gz`、`backups/service-dist-before-usage-notice-20260422022427.tar.gz`；更新数据库前已备份旧公告配置到 `backups/config-notice-before-usage-notice-20260421182721.json`，并在发现 `configKey` 非唯一导致重复行后，再备份到 `backups/config-notice-duplicates-before-normalize-20260421182820.json`，随后将所有 `noticeInfo / noticeTitle` 行统一更新为新套餐规则。影响范围：仅 `config` 表中的公告标题与公告正文。回滚方式：从上述 JSON 备份恢复对应 `config` 行。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `d3e3e03 feat: publish plan usage notice` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已从 PID `3208282` 切换到 PID `3220959`，`38000` 学术服务保持 `4048524/2995907` 未重启；线上 `https://lens.yutoai.net/?v=202604220230` 返回 `HTTP 200`，`/api/config/queryFront` 已确认返回“Lens 用户必读 / 套餐使用规则”，且不再返回旧“Lens 昱镜”内容。

## 0.0.77 (2026-04-22)
- 学术会员分层限制落地：新增 `chat/src/utils/academicPlanAccess.ts` 统一前端套餐能力判断；前端学术面板和首页入口会根据用户套餐过滤可用单能力，Plus/非会员只保留轻量单能力，Pro 可使用 PDF/Word/LaTeX 等进阶能力并支持最多 2 步能力编排，Max 支持全部能力和最多 3 步编排。影响范围：学术能力入口展示、快捷入口、编排模板和编排步骤上限；不改变套餐购买、卡密兑换、积分扣费或文件上传逻辑。回滚方式：回退本次前端权限过滤文件与面板改动并重新构建同步 `chat/dist`。
- 后端硬校验补齐：`service/src/modules/userBalance/userBalance.service.ts` 的余额接口新增 `isMember / packageName / packageWeight`，用于稳定区分 Plus/Pro/Max；`service/src/modules/academic/academic.service.ts` 在普通学术任务和多能力编排执行前做服务端套餐校验，避免绕过前端直接调用 Pro/Max 能力。影响范围：`/api/academic/chat-process` 与 `/api/academic/workflow-process` 的越权请求会返回升级提示；不改变学术服务端口、模型配置、扣费顺序或数据库结构。回滚方式：恢复本次服务端校验与余额返回字段后重新构建同步 `service/dist` 并重启 `9520`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `4f86f59 feat: enforce academic plan access` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。同步前已在服务器创建 `public-chat-before-plan-access-20260422021406.tar.gz` 与 `service-dist-before-plan-access-20260422021406.tar.gz` 备份；`9520` 主服务已从 PID `3061585` 精确切换到 PID `3208282`，`38000` 学术服务保持 `4048524/2995907` 未重启。线上 `https://lens.yutoai.net/?v=202604220215` 返回 `HTTP 200`，远端 `dist/main.js` 已确认包含“当前套餐最多支持”后端拦截，前端产物已确认包含 `packageWeight` 等套餐等级字段。

## 0.0.76 (2026-04-22)
- 年会员卡密链路补齐：`service/src/modules/crami/createCrami.dto.ts` 与 `crami.service.ts` 已支持套餐卡密传入 `billingCycle=monthly|annual`；生成套餐卡密时复用现有套餐计费快照逻辑，年卡会按 12 个月额度和 365 天有效期生成，兑换后沿用现有 `addBalanceToUser` 会员到账链路。影响范围：仅套餐类卡密生成；不改变用户直接购买年付套餐的订单逻辑、支付回调或卡密兑换入口。回滚方式：移除 `billingCycle` 入参与 `getPackageBillingOffer` 生成逻辑后重新构建同步 `service/dist`。
- 后台发行年卡入口：`admin/src/views/package/crami.vue` 的生成卡密弹窗新增“月卡 / 年卡”计费周期选择，并显示即将生成的有效期和三类额度；`admin/src/views/package/package.vue` 在套餐列表操作区新增“发行年卡密”快捷入口，会跳转到卡密管理并预选当前套餐与年卡周期。影响范围：仅后台套餐卡密发行体验，不改变套餐配置字段或已有卡密数据。回滚方式：恢复两个后台页面并重新构建同步 `admin/dist`。
- 本地验证通过：已执行 `./admin/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./admin/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Browserslist/chunk warning。
- 已完成 GitHub 与服务器同步：提交 `5592bb0 feat: support annual member card secrets` 已推送到 `origin/main`；`service/dist` 与 `admin/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已从 PID `3008741` 精确切换到 PID `3061585`，`38000` 学术服务保持 `4048524/2995907` 未重启；线上 `https://lens.yutoai.net/?v=202604220100` 返回 `HTTP 200`，服务器后台资源已确认包含“发行年卡密 / 年卡”，服务端 `dist/main.js` 已确认套餐卡密生成走 `getPackageBillingOffer(pkg, billingCycle)`。

## 0.0.75 (2026-04-22)
- 研究结果头部对齐修复：`chat/src/views/chat/components/Message/Text/index.vue` 已修正第一个 `workspace-record__meta-chip` 的伪元素布局，避免隐藏圆点仍占用 flex gap，导致“附件 1”比“生成 1 份可下载结果。”右缩。影响范围：仅消息头部元信息排版，不改变下载结果、文件展示、生成正文或接口逻辑。回滚方式：恢复该伪元素样式后重新构建同步 `chat/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `cc54b8d fix: align research result metadata` 已推送到 `origin/main`；最新 `chat/dist` 已零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，`index.html` 更新时间为 `2026-04-22 00:40:19 +0800`。线上 `https://lens.yutoai.net/?v=202604220045` 返回 `HTTP 200`，服务器 CSS 已确认包含 `.workspace-record__meta-chip:first-child:before{content:"";display:none}`；`9520` 保持 PID `3008741`，`38000` 保持 `4048524/2995907`，本轮未重启服务。

## 0.0.74 (2026-04-22)
- 学术长任务进度接入：`service/src/modules/academic/academic.service.ts` 新增安全 `thinkingPreview` 提炼链路，会从普通学术任务和多能力编排调用学术后端时收到的流式片段中提取、脱敏、降噪、截断后推给前端。多能力编排仍保留 `progressText/taskData`，并把真实流片段同步写入当前步骤进度。影响范围：仅用户等待期间的进度展示，不改变最终正文生成、文件结果、扣费、模型调用顺序或数据库结构。回滚方式：移除 `thinkingPreview` 推送和前端消费逻辑后重新构建同步 `chat/dist` 与 `service/dist`。
- 前端深度思考条真实化：`chat/src/views/chat/chatBase.vue`、`Message/index.vue`、`Message/Text/index.vue` 和 `chat.d.ts` 已补齐 `thinkingPreview` 透传；“深度思考中”长条优先显示编排进度，其次显示学术后端实时预览，再兜底显示模型 reasoning 或轮播文案。加载期间标签固定为“深度思考中”，避免长任务正文未完成时误显示“已深度思考”。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `de90b1f feat: stream academic thinking previews` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已精确切换为 PID `3008741`，`38000` 学术服务保持原监听进程 `4048524/2995907` 未重启；线上 `https://lens.yutoai.net/?v=202604220030` 返回 `HTTP 200`，服务器 `dist/main.js` 已确认包含 `thinkingPreview` 推送逻辑。

## 0.0.73 (2026-04-22)
- 积分命名收口：`chat` 中文可见文案把“顶级模型额度”改为“顶级积分”，并在会员中心兼容线上旧 `drawMjName` 配置值；后端数据库初始化默认值同步改为“顶级积分”。影响范围：用户端积分名称展示与新环境默认配置，不改变积分扣减、套餐额度或会员逻辑。回滚方式：恢复本次中文语言包、会员中心兼容逻辑和默认配置改动后重新构建同步。
- 后台额度命名收口：`admin` 中“特殊额度”相关表格、表单、校验与 placeholder 改为“顶级额度”，用于套餐、卡密和注册/签到配置页。影响范围：仅后台文案，不改变字段名、接口参数或数据库结构。回滚方式：恢复本次后台文案改动后重新构建同步 `admin/dist`。
- 生产错误清洗：`service/src/common/utils/sanitizeClientErrorMessage.ts` 与 `chat/src/utils/request/sanitizeErrorMessage.ts` 新增异常前缀剥离，`OrderService.buy` 不再把捕获到的原始 `error.message` 直接抛给前端；“Error: 订单存在!” 会显示为“订单已存在，请勿重复提交”。影响范围：订单购买失败提示和通用请求错误清洗，不改变支付创建、查询或扣费逻辑。回滚方式：恢复清洗器和订单接口 catch 分支后重新构建同步 `chat/dist` 与 `service/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`./admin/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production`、`./admin/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Vite chunk/import 警告和 Browserslist 数据提示。
- 已完成 GitHub 与服务器同步：提交 `bdf97e7 fix: clean quota labels and order errors` 已推送到 `origin/main`；`chat/dist`、`admin/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已重启为 PID `2995614`，学术服务父进程仍为 `4048524`，当前监听子进程为 `2995907`，本轮未主动重启学术服务。线上 `https://lens.yutoai.net/?v=20260422002130` 返回 `HTTP 200`，远端构建产物已确认包含“顶级积分”“顶级额度”和“订单已存在，请勿重复提交”，且不再包含 `Error: 订单存在` 原始前缀。

## 0.0.72 (2026-04-21)
- 编排准备态兜底：针对用户截图中“能力编排进度 0% 但深度思考长条仍显示通用轮播文案”的问题，`service/src/modules/academic/academic.service.ts` 现在会在文件转交/编排准备阶段立即写入并推送第一条 workflow 事件，把首个步骤标记为 `running`，并显示“正在接收上传资料 / 正在准备编排任务”等安全阶段说明。
- 前端长条兜底：`chat/src/views/chat/components/Message/Text/index.vue` 的 `workflowLiveProgressText` 不再依赖必须已有完整步骤列表；只要当前消息是能力编排且仍在 loading，就优先显示“正在接收上传资料，准备能力编排”或“正在准备能力编排”，避免用户只看到泛化“正在理解用户的想法”。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`。影响范围：仅多能力编排流式状态和前端等待文案，不改变最终模型调用、学术服务处理、扣费或文件生成逻辑。回滚方式：恢复本次对早期 workflow 事件和前端兜底文案的改动，并重新构建同步 `chat/dist` 与 `service/dist`。
- 已完成 GitHub 与服务器同步：提交 `cff0d5e fix: show workflow preparation progress` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器。重启期间普通 SSH 会话多次被服务器关闭，曾短暂出现 `9520` 未监听导致 Cloudflare `502`，已改用 `setsid node dist/main.js` 恢复服务，当前 `9520` 监听 PID 为 `2954971`，线上 `https://lens.yutoai.net/?v=20260422000030` 返回 `HTTP 200`；本轮未重启 `38000` 学术服务。

## 0.0.71 (2026-04-21)
- 控制面板减噪：`chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 已删除高级设置中补充输入框上方的独立“补充要求”标题，保留输入框 placeholder 与“只有在需要约束术语、输出格式或翻译策略时再填写。”提示说明，避免表单层级过重。
- 影响范围：仅能力设置面板的显示文案结构，不影响补充要求输入、清洗、提交或编排逻辑。回滚方式：恢复该 textarea 上方的 label 后重新构建并同步 `chat/dist`。
- 已完成 GitHub 与服务器同步：提交 `bd57e84 fix: remove extra instruction label` 已推送到 `origin/main`；最新 `chat/dist` 已零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，未重启 `9520` 或 `38000`。线上回查 `https://lens.yutoai.net/?v=20260421232200` 返回 `HTTP 200`，`Last-Modified` 已更新为 `2026-04-21 15:16:18 GMT`；服务器端口保持 `9520` PID `2860669`、`38000` PID `4048524`。

## 0.0.70 (2026-04-21)
- 编排耗时排查：线上最近一次三步多能力编排总耗时约 `264s`，第一步插件阶段约 `196s`，第二步基础能力约 `58s`，第三步约 `10s`；主要原因是编排链路按步骤串行执行，且第一步插件内部包含资料处理与上游模型等待，耗时不只取决于最终输出模型速度。
- 编排进度可视化：`service/src/modules/academic/academic.service.ts` 的 workflow heartbeat 现在会附带安全的 `progressText`，按步骤显示“正在接收论文资料 / 正在切分论文正文 / 正在分析问题、方法和实验结果 / 正在汇总结果”等阶段说明；`chat/src/views/chat/components/Message/Text/index.vue` 让“深度思考中”长条优先展示当前编排步骤说明，并在编排详情中展示运行中步骤的阶段文本。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`。影响范围：多能力编排流式状态展示与服务端 workflow 事件，不改变模型调用顺序、扣费逻辑、学术服务处理逻辑或最终结果。回滚方式：移除 `progressText` 字段与 heartbeat 文案生成逻辑，并恢复前端 `reasoningPreview` 为原通用轮播文案后重新构建、同步 `chat/dist` 与 `service/dist`。
- 已完成 GitHub 与服务器同步：提交 `b2e6177 feat: show workflow stage progress` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到 `/www/wwwroot/Lens/AIWebQuickDeploy`，重启 `9520` Node 服务后新 PID 为 `2860669`，`38000` 学术服务保持 PID `4048524` 未重启。线上回查 `https://lens.yutoai.net/` 与 `/api/sitemap.xml` 均返回 `HTTP 200`，服务器构建产物已包含 `progressText` 与“正在切分论文正文”等阶段文本。

## 0.0.69 (2026-04-21)
- 研究结果加载态去噪：`chat/src/views/chat/components/Message/Text/index.vue` 已移除助手消息加载时头部的“进行中”状态 chip 和“正在整理分析、引用和可交付结果。”说明句；保留“研究结果”标题和下方深度思考/生成进度展示。
- 影响范围：仅聊天消息加载态展示文案，不影响生成、推理、联网搜索、文件结果或工作流逻辑。回滚方式：恢复 `recordStatus` 与加载态 `recordSummary` 文案并重新构建、同步 `chat/dist`。

## 0.0.68 (2026-04-21)
- 会员中心额度信息继续收敛：`chat/src/components/Settings/MemberCenter.vue` 中普通积分、高级积分、顶级模型额度和会员状态不再使用独立灰线圆角框，改为白色卡面上的横向信息行；名称在左、数值和单位在右，并使用 `whitespace-nowrap` 防止“积分”或“到期”被拆成两行。
- 影响范围：仅会员中心额度信息展示样式，不涉及积分、签到或会员状态业务逻辑。回滚方式：恢复本次对 `MemberCenter.vue` 的信息行 class 调整并重新构建、同步 `chat/dist`。

## 0.0.67 (2026-04-21)
- 会员中心视觉细节调整：`chat/src/components/Settings/MemberCenter.vue` 中“签到赠送”、普通积分、高级积分、顶级模型额度和会员状态信息行不再使用灰色 `surface-panel` 背景，改回跟随原有白色 `surface-card` 背景，仅保留边框、圆角和排版层级。
- 影响范围：仅会员中心签到和额度信息展示样式，不涉及签到、积分、会员到期时间等业务数据或接口逻辑。回滚方式：将上述信息行背景从 `surface-card` 恢复为 `surface-panel` 后重新构建并同步 `chat/dist`。

## 0.0.66 (2026-04-21)
- 补齐旧法律页删除语义：由于 SPA fallback 会把不存在的 `/legal/terms.html` 与 `/legal/privacy.html` 回退到 `index.html`，`service/src/modules/spa/spa.controller.ts` 已对这两个旧 Lens 本地路径显式返回 `410 Gone`，避免它们在浏览器或爬虫侧继续表现为可访问页面。
- 影响范围：仅旧本地法律页路径的 HTTP 行为；登录弹窗仍使用 `https://yutoai.net/terms/` 与 `https://yutoai.net/privacy-policy/`。回滚方式：移除 `removedLocalLegalPaths` 分支并重新构建、同步 `service/dist`。

## 0.0.65 (2026-04-21)
- 协议入口纠正：Lens 登录弹窗中的《服务协议》《隐私政策》不再指向本地 `/legal/terms.html` 与 `/legal/privacy.html`，改为统一加载 YutoAI 主站协议 `https://yutoai.net/terms/` 与 `https://yutoai.net/privacy-policy/`；新增 `chat/src/constants/legalLinks.ts` 统一维护链接，避免邮箱登录和微信登录分叉。
- 删除 Lens 本地法律页：已移除 `chat/public/legal/terms.html` 与 `chat/public/legal/privacy.html`，同步清理 `chat/index.html`、`chat/public/llms.txt`、`chat/public/llms-full.txt`、`chat/public/seo/research-workspace.html`、`chat/public/robots.txt` 与 `service/src/modules/spa/spa.controller.ts` 中的本地 `/legal/*.html` 入口和 sitemap 条目。
- 本地验证通过：`https://yutoai.net/terms/` 与 `https://yutoai.net/privacy-policy/` 均返回 `HTTP 200`，响应头未发现禁止 iframe 嵌入的 `X-Frame-Options` 或 `frame-ancestors`；已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`。影响范围：登录弹窗协议 iframe、公开 SEO 文档、robots/sitemap 和前端/服务端构建产物。回滚方式：恢复本次提交并重新同步 `chat/dist` 与 `service/dist`，如确需恢复本地法律页需重新添加两份静态 HTML。

## 0.0.64 (2026-04-21)
- 同步链路排查：确认 GitHub `origin/main` 与本地 HEAD 同为 `e084744 docs: record legal policy deployment`，但本地存在 19 个未提交前端/SEO/品牌文案改动；服务器 `/www/wwwroot/Lens`、`/www/wwwroot/Lens/AIWebQuickDeploy`、`/www/wwwroot/Lens/academic-4.0` 均不是 Git 仓库，线上运行版本只能通过构建产物、文件时间与内容校验反推。
- 法律页品牌开头修正：`chat/public/legal/terms.html` 首段改为“本服务协议适用于 YutoAI 提供的 Lens 等相关服务”，`chat/public/legal/privacy.html` 首段改为“本隐私政策说明 YutoAI 在提供 Lens 等相关服务时如何处理个人信息”；保留 Lens 作为 YutoAI 旗下服务自然出现，不把 Lens 单独拆成独立品牌协议。
- 本地验证通过：已在 `chat` 子目录执行 `./node_modules/.bin/vue-tsc --noEmit` 与 `./node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：公开法律页开头、现有前端/SEO/品牌文案工作树改动及其构建产物。回滚方式：回退本次提交并重新构建、同步 `chat/dist`；服务器前端静态资源可回退到上一版 `public/chat` 构建产物。

## 0.0.63 (2026-04-21)
- 公开法律页更新：`chat/public/legal/terms.html` 已替换为用户提供的 2026-04-21 版 `YutoAI 服务协议 / Terms of Service`，`chat/public/legal/privacy.html` 已替换为 2026-04-21 版 `YutoAI 隐私政策 / Privacy Policy`，补齐服务主体、服务范围、账号安全、API、退款、第三方服务、企业服务、投诉、责任限制、香港法律与隐私数据处理等完整条款。
- 法律页排版同步调整为网站静态文档格式：新增 `YutoAI Legal` 页眉、双语标题、更新时间、章节锚点目录、主体信息块、清晰分节和移动端适配；保持纯静态 HTML，不引入脚本和新运行时依赖，兼容登录弹窗 iframe 与公开访问。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`，并确认 `chat/dist/legal/terms.html`、`chat/dist/legal/privacy.html` 包含 2026-04-21 版内容；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅公开法律页静态内容与排版。回滚方式：恢复两份 `chat/public/legal/*.html` 到上一版本并重新同步 `chat/dist` 即可。
- 已完成本轮安全同步：代码已提交为 `15a204b docs: update public legal policies` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。线上回查 `terms.html` 与 `privacy.html` 均返回 `HTTP 200`，`Last-Modified` 均为 `2026-04-21 04:38:15 GMT`，服务器内容 grep 已确认包含新版标题，`9520/38000` 监听未变。

## 0.0.62 (2026-04-20)
- 首页继续按反馈做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已删除“提问”主动作与空 Hero 占位；案例行左侧 padding 清零，使下面案例和 `读材料 / 写内容 / 研究链路` 三个分区标题左对齐。
- 研究链路继续降噪：已从“研究链路”分区移除 `代码解释` 入口，仅保留编排相关入口。已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`，构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端展示。回滚方式：恢复 `Workspace/Home.vue` 到本次改动前版本即可。
- 已完成本轮安全同步：代码已提交为 `489fb38 refactor: remove workspace home action chrome` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420223100` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 14:31:06 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端展示。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.61 (2026-04-20)
- 首页字号关系调整：`chat/src/views/chat/components/Workspace/Home.vue` 已将 `读材料 / 写内容 / 研究链路` 三个分区标题从 `13px` 调整为 `14px`，并将下面案例标题从 `14px` 调整为 `13px`，保留案例灰色与 `500` 字重，避免重新变成黑色粗标题墙。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。
- 已完成本轮安全同步：代码已提交为 `4d0297e refactor: adjust workspace home type scale` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420213200` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 13:31:55 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端展示。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.60 (2026-04-20)
- 首页继续按截图做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已移除顶部动作中的“导入”，首页空状态现在只保留“提问”主动作；同时将能力案例标题从黑色粗字降为 `text-sub` 灰色与 `500` 字重，降低案例行视觉权重。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。
- 已完成本轮安全同步：代码已提交为 `d90bbeb refactor: soften workspace home entries` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420212200` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 13:21:08 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端展示。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.59 (2026-04-20)
- 首页字体与灰线治理：`chat/src/views/chat/components/Workspace/Home.vue` 已移除首页分组标题上的衬线字体，改为继承产品统一无衬线体系；同时去掉 Hero、分组和入口行上的密集灰色横线，改用留白、轻量胶囊动作和 hover 背景表达层级。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。浏览器截图尝试受本地预览代理配置阻塞，已立即关闭 Chromium、停止预览并清理临时 profile，无后台进程残留。
- 已完成本轮安全同步：代码已提交为 `9668ea2 refactor: align workspace home typography` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420203500` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 12:32:36 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端样式。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.58 (2026-04-15)
- 已同步新的浏览器清理约束：按根目录 `AGENTS.md`，以后每次使用 Playwright / Chromium 完成调试、截图、自动化或验收后，必须立即关闭浏览器窗口、会话和残留后台进程，不允许继续占用系统资源。
- 本地记录已补齐：`memory.md` 已把这条要求写入当前长期约束，后续所有浏览器相关操作都按这条规则收尾。影响范围：仅本地规则与记忆文件。回滚方式：恢复本地记录到本次补充前版本即可。

## 0.0.57 (2026-04-15)
- 已纠正 Chromium 路径真相源：按根目录 `AGENTS.md` 重新核对后，当前固定 Playwright Chromium 本体应以 `/Users/hkyutong/Library/Application Support/PlaywrightChromium/chromium-1217/...` 为准，`~/Library/Caches/ms-playwright` 不再作为是否可用的判断依据。
- 本地记录已同步校正：`Agents.md`、`memory.md` 已补上“先看固定本体路径、不要再把缓存目录当真相源”的说明，避免后续 Playwright/Chromium 验收时再沿用旧路径判断。影响范围：仅本地规则与记忆文件。回滚方式：恢复三份本地记录到本次修正前版本即可。

## 0.0.56 (2026-04-15)
- 首页继续做减法并完成发布：`chat/src/views/chat/components/Workspace/Home.vue` 已移除大标题 Hero，只保留一行动作入口；读材料区撤下 `Arxiv 摘要`，第三列标题收成“研究链路”，并把 `代码解释 / 自己编排 / 1 条精选案例` 合并进同一列，首页整体从“分段展示”进一步收敛成更短的研究目录。
- 多语言文案同步压缩：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把首页动作按钮缩成更短的操作词，并统一第三列标题语义，避免首页继续靠长句撑版面。
- 已完成本轮安全同步：代码已提交为 `01d514a refactor: tighten the research entry` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260415080300` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-15 00:01:14 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端结构与五套 locale。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.55 (2026-04-15)
- 首页继续做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 `01/02/03` 编号、入口右侧“进入”文字、流程模板的重复步骤展开，并把流程案例缩到 1 条；当前首页收成三栏主入口加一块极简编排区，减少层级和重复阅读。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端结构。回滚方式：恢复 `Workspace/Home.vue` 到本次改动前版本即可。

## 0.0.54 (2026-04-14)
- 已完成本轮安全同步：主界面去噪改动已提交为 `f43ab15 refactor: reduce workspace noise` 并推送到 `origin/main`；本次仍未把本地 `Agents.md / memory.md / changelog.md` 推上 GitHub，只同步了前端显示层代码与构建产物。
- 已完成前端零停机发布：本地 `chat/dist` 已再次同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`”的方式，不重启 `9520` 与 `38000`，也不触碰学术服务目录。
- 线上回查通过：`https://lens.yutoai.net/?v=20260414082441` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-14 00:24:41 GMT`；服务器 `public/chat/index.html` 修改时间为 `2026-04-14 08:24:41 +0800`，`9520` 仍由进程 `4048630` 监听，`38000` 仍由进程 `4048524` 监听。影响范围：仅前端显示层与语义层。回滚方式：回退 GitHub 到前一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.53 (2026-04-14)
- 继续给主界面做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 Hero 辅助说明、入口用途说明、能力标签和编排说明句，首页从“解释入口”继续收敛成“直接操作入口”；`chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 已移除顶部综述卡和底部“当前任务”重复摘要，只保留真正需要操作的控制项。
- 修正 SEO 语义层串入产品界面：`chat/index.html` 中的 `seo-snapshot` 现在改为真正的视觉隐藏语义层，仍保留给抓取器读取，但不再直接堆在应用页底部干扰学术用户操作。
- 同步压缩交互文案：`chat/src/views/chat/components/Footer/index.vue` 把“提交任务”收成“发送”；`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 同步缩短首页区块标题、登录占位文案和右侧面板标题/空态提示。已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`，构建仍只有既有 warning。影响范围：仅前端显示层与语义层。回滚方式：恢复 `Workspace/Home.vue`、`AcademicPanel.vue`、`Footer/index.vue`、`chat/index.html` 与上述 locale 到本次改动前版本即可。

## 0.0.52 (2026-04-14)
- 已完成本轮安全同步：首页重设计已提交为 `4c2e360 refactor: redesign the research workspace` 并推送到 `origin/main`；本次仍未把本地 `Agents.md / memory.md / changelog.md` 推上 GitHub，只同步了首页前端代码与构建产物。
- 已完成前端零停机发布：本地 `chat/dist` 已再次同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`”的方式，不重启 `9520` 与 `38000`，也不触碰学术服务目录。
- 线上回查通过：`https://lens.yutoai.net/?v=20260414081200` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-14 00:12:35 GMT`；服务器 `public/chat/index.html` 修改时间为 `2026-04-14 08:12:35 +0800`，`9520` 仍由进程 `4048630` 监听，`38000` 仍由进程 `4048524` 监听。影响范围：仅首页前端静态资源。回滚方式：回退 GitHub 到前一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.51 (2026-04-14)
- 首页继续做成更像专业科研平台的研究界面：`chat/src/views/chat/components/Workspace/Home.vue` 这轮把首页从“目录式入口”进一步重构为“Lens 标识 + 研究入口 Hero + 三段研究工作流”，加入更强的编辑式排版层级、弱化功能陈列感，并把代码解释与多步流程统一收到“拆方法与编排”区域。
- 首页入口全部改成任务语义：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已为论文总结、PDF 深读、Arxiv 摘要、英文润色、LaTeX 翻译、代码解释补上用途说明，并把按钮文案收敛成“进入 / Open / 開く / 進入 / 열기”，让入口更像研究动作而不是功能标签。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端结构与五套 locale。回滚方式：恢复 `Workspace/Home.vue` 与对应 locale 到本次改动前版本即可。

## 0.0.50 (2026-04-14)
- 已完成本轮安全同步：首页“工作方式入口”改造已提交为 `0b25356 refactor: focus the research entry` 并推送到 `origin/main`；本次没有把本地 `Agents.md / memory.md / changelog.md` 推上 GitHub，只同步了首页前端代码与构建产物。
- 已完成前端零停机发布：本地 `chat/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`”的方式，未重启 `9520` 与 `38000`，也未触碰学术服务目录。
- 线上回查通过：`https://lens.yutoai.net/?v=20260414074458` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-13 23:44:58 GMT`；服务器 `public/chat/index.html` 修改时间为 `2026-04-14 07:44:58 +0800`，`9520` 仍由进程 `4048630` 监听，`38000` 仍由进程 `4048524` 监听。影响范围：仅首页前端静态资源。回滚方式：回退 GitHub 到前一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.49 (2026-04-14)
- 首页继续从“功能目录”收敛成“工作方式入口”：`chat/src/views/chat/components/Workspace/Home.vue` 已取消左右双区工作台，把首页改成单列三段式结构，按“读材料 / 写内容 / 多步流程”组织入口；用户先判断自己在做哪类研究工作，再进入具体能力，减少功能货架感并强化首屏主次。
- 首页文案进一步改成任务导向：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把主标题与分区标题改成更直接的研究语义，如“开始研究 / 先选工作方式 / 读材料 / 写内容”，避免“研究工作台 / 单步任务”这类偏后台或产品目录的措辞。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端结构与五套 locale。回滚方式：恢复 `Workspace/Home.vue` 与对应 locale 到本次改动前版本即可。

## 0.0.48 (2026-04-14)
- 首页结构继续专业化：`chat/src/views/chat/components/Workspace/Home.vue` 已从“高频能力 + 能力编排”的同层清单，重构为“单步任务 / 多步流程”的双区工作台；左侧按“阅读与理解 / 写作与改写”组织入口，右侧独立承载流程编排，减少功能市场感并强化研究任务导向。
- 首页文案改成操作语言：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把首页改成更偏研究操作的措辞，如 “研究工作台 / 单步任务 / 直接提问 / 阅读与理解 / 写作与改写”，避免学术用户先读营销式或泛功能式标题。
- 长期规则入口迁移到本地 `Agents.md`：后续以 `Agents.md / memory.md / changelog.md` 持续维护流程与记忆，`.gitignore` 已补充 `Agents.md`。本地验证：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 通过；Playwright 浏览器验收本轮受现有共享 Chromium 缺失提示阻塞，未下载或替换任何运行时。影响范围：仅首页前端结构、五套 locale、本地规则文件与忽略规则。回滚方式：恢复 `Workspace/Home.vue`、对应 locale、`.gitignore` 与本地记录文件到本次改动前版本即可。
## 0.0.47 (2026-04-14)
- 继续收掉空主页文案噪音：`chat/src/views/chat/chatBase.vue` 已移除空主页内容区的大字“你的项目”，`chat/src/views/chat/components/Workspace/Home.vue` 已移除说明句“直接提问，或先导入资料。”，首页进一步只保留真正可操作的标题与入口。
- 补充同步纪律：后续默认按“完成改动后立即同步”的方式执行，至少包含本地校验、更新 `Agents.md / memory.md / changelog.md`、推送 GitHub，以及按影响范围同步服务器；前端展示层改动默认热同步 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。
- 本地验证：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`。影响范围：仅聊天空主页与首页 Hero 展示，以及后续交付流程约束。回滚方式：恢复 `chatBase.vue`、`Workspace/Home.vue` 与记录文件到本次改动前版本即可。

## 0.0.46 (2026-04-14)
- 继续收掉空主页冗余标题：`chat/src/views/chat/chatBase.vue` 已移除空主页内容区里那行大字“你的项目”，保留顶部菜单标题，不再让空主页出现重复层级标题。
- 继续压缩首页 Hero：`chat/src/views/chat/components/Workspace/Home.vue` 已移除说明句“直接提问，或先导入资料。”，首屏只保留主标题和两个直接动作，减少无效解释。
- 本地验证：已重新执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`。影响范围：仅聊天空主页与首页 Hero 展示。回滚方式：恢复 `chatBase.vue` 与 `Workspace/Home.vue` 到本次改动前版本即可。

## 0.0.45 (2026-04-14)
- 已完成一次头部标题修正同步：`chat/src/views/chat/components/Header/index.vue` 已恢复顶部菜单区的“你的项目”标题，并再次同步到 GitHub 与线上静态资源，确保顶部菜单标题存在、聊天主区大字不回退。
- 本次发布仍采用前端静态零停机方式：仅更新 `chat/dist` 到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，保持“静态资源先传、`index.html` 最后覆盖、不删除旧哈希文件”的切换策略，不动学术服务目录。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅聊天工作区顶部头部与对应前端构建产物。回滚方式：恢复 `Header/index.vue` 与 `public/chat` 到上一版构建产物即可。

## 0.0.44 (2026-04-14)
- 修正工作区标题误删：`chat/src/views/chat/components/Header/index.vue` 已恢复顶部菜单区的“你的项目”标题，继续保留可拖拽头部区域和右侧操作按钮，不再把顶部菜单标题和聊天主区的大标题混为一处。
- 保持聊天主区收口不回退：本次没有恢复 `chat/src/views/chat/chatBase.vue` 里的大字展示调整，只修正了头部菜单被误删的问题，避免聊天界面重新出现重复的大标题。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 通过。影响范围：仅工作区顶部头部展示。回滚方式：恢复 `Header/index.vue` 到本次改动前版本即可。

## 0.0.43 (2026-04-14)
- 已完成一次代码与现网同步：当前工作树已提交为 `48afaab feat: refine workspace experience and service runtime` 并推送到 `origin/main`，GitHub 主线与本地当前代码状态已对齐。
- 已完成一次整套服务器同步：本地 `service/dist/`、`admin/dist/`、`chat/dist/` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`，其中前端仍采用“静态资源先传、`index.html` 最后覆盖”的方式；同时把 `academic-4.0/shared_utils/fastapi_stream_server.py` 同步到 `/www/wwwroot/Lens/academic-4.0/shared_utils/`。
- 已完成必要重载与回查：远端 `lens-academic` 已通过 PM2 重启为新进程 `4048524`，`9520` 主服务已重载为新进程 `4048630`；`https://lens.yutoai.net/` 当前返回 `HTTP 200`，`Last-Modified` 为 `2026-04-13 22:55:10 GMT`。影响范围：`AIWebQuickDeploy` 运行时代码、前后台静态资源与学术服务共享流式模块。回滚方式：回退 GitHub 到上一提交并把服务器 `AIWebQuickDeploy/dist`、`AIWebQuickDeploy/public` 与 `academic-4.0/shared_utils/fastapi_stream_server.py` 恢复到上一版产物后，再按相同方式重载服务。

## 0.0.42 (2026-04-14)
- 继续压缩首页首屏高度：`chat/src/views/chat/components/Header/index.vue` 已移除顶部重复显示的“你的项目”标题；`chat/src/views/chat/components/Workspace/Home.vue` 已把首页收紧为 4 个高频能力入口和 2 个精选案例，并同步缩小 Hero 标题、分区标题与列表留白，尽量避免用户进入首页后还要下滑才能看完主要入口。
- 保持目录式布局不回退：高频能力区继续保持无卡片的两列清单，编排区保持“能力编排”标题、一个“自己编排”入口和 2 个精选案例，仍然不回到卡片矩阵或多层容器。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅首页与工作区头部前端展示，不涉及服务端和现网进程。回滚方式：恢复 `Header/index.vue` 与 `Workspace/Home.vue` 到本次改动前版本即可。

## 0.0.41 (2026-04-14)
- 继续收口首页目录结构：`chat/src/views/chat/components/Workspace/Home.vue` 已把编排区标题从“科研流水线”改成更准确的“能力编排”，避免与第一条“自己编排”入口形成重复语义；主页当前保留“自己编排”入口和 3 个精选案例，不再扩成整组模板展示。
- 同步补齐列表式入口文案：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已补充 `starterAction` 并把编排区标题统一调整为“能力编排 / Capability Flows / 機能編成 / 能力編排 / 기능 조합”。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；并用 Playwright 打开本地 `vite preview` 进行真实页面核对，确认首页当前是目录式而非卡片式布局。影响范围：仅首页前端结构与多语言文案，不涉及服务端和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.40 (2026-04-13)
- 继续收口首页视觉语言：`chat/src/views/chat/components/Workspace/Home.vue` 已把高频能力区和编排区从圆角小容器/小卡片改成分隔线式线性清单，Hero 也去掉了容器感，首屏整体改成更接近研究目录页的结构。
- 编排区只保留一个“自己编排”入口和三个案例：主页不再同时铺一整组模板项，避免信息拥挤；对应 `chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增 `starterAction` 文案键，用于新的列表式高频能力入口。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅首页前端结构与多语言文案，不涉及服务端和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.39 (2026-04-13)
- 已完成主页简化版本的二次线上同步：把本地最新 `chat/dist` 再次同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`、不删除旧哈希文件”的零停机方式发布，不影响已打开页面和缓存中的旧哈希资源。
- 同步后线上核查通过：`https://lens.yutoai.net/` 继续返回 `HTTP 200`，响应头 `Last-Modified` 已更新为 `2026-04-12 20:36:09 GMT`（对应服务器东八区 `2026-04-13 04:36:09`），说明这轮首页简化版前端资源已经切到线上。
- 现网进程未受影响：服务器 `9520` 仍由原有进程 `2081187` 持续监听，`38000` 仍由原有进程 `81539` 持续监听，本轮未重启 Node 服务或学术服务。影响范围仅限 `AIWebQuickDeploy/public/chat` 下的前端静态资源。回滚方式：把 `public/chat` 恢复到上一版构建产物即可，因旧哈希文件仍保留，短期回滚风险较低。

## 0.0.38 (2026-04-13)
- 继续简化首页介绍密度：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 Hero 右侧状态/步骤说明区，并把首页保留为“主标题 + 极短说明 + 两个主动作 + 高频能力 + 科研流水线”的单层结构，避免首屏出现多段解释让用户抓不住重点。
- 同步压缩首页文案：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把 Hero 标题、简介、高频能力标题和科研流水线编排文案压短，只保留动作导向表达，不再做流程教学式描述。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅首页前端展示与多语言文案，不涉及服务端、数据库和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.37 (2026-04-13)
- 继续收口首页首屏：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 Hero 顶部的 `Lens Research Desk` 眉标，避免首屏在品牌层之外再出现一层多余标题。
- 重做“能力编排”模板区展示：原先两列小卡片已改为单列流水线清单，每条模板现在按“编号 + 标题 + 步骤链路 + 侧边动作/状态”展示，更接近研究操作列表而不是卡片拼贴；对应多语言文案 `chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增了“使用这条链路”动作文案，并移除了不再使用的 `heroEyebrow` 文案。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；并用现有 Playwright + 共享 Chromium 对首页进行了截图验收，确认首屏不再显示 `Lens Research Desk`，且科研流水线模板区已经从小卡片改为列表式展示。影响范围：仅 `Workspace/Home.vue` 与对应 locale 文案，不涉及服务端和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.36 (2026-04-13)
- 已完成一次线上零停机静态同步：把本地 `chat/dist` 同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，采用“先同步除 `index.html` 外的全部静态资源、最后覆盖 `index.html`、不删除旧哈希文件”的方式上线本轮前端改动，避免现有用户会话因旧资源丢失而中断。
- 同步前已做只读核查：`https://lens.yutoai.net/` 同步前返回 `HTTP 200`；服务器 `9520` 当前由原有 `node dist/main.js`（PID `2081187`）提供服务，`38000` 仍为原有 `lens-academic` Python 进程（PID `81539`）。本轮未重启任何现网进程，也未触碰学术服务目录。
- 同步后线上校验通过：`https://lens.yutoai.net/` 继续返回 `HTTP 200`，响应头 `Last-Modified` 已更新到本次前端构建时间；影响范围仅限 `AIWebQuickDeploy/public/chat` 下的前端静态资源。回滚方式：如需回退，可把服务器 `public/chat` 恢复为上一次前端构建产物；由于本轮未删除旧哈希文件，短期回滚与缓存兼容风险较低。

## 0.0.35 (2026-04-13)
- 继续收敛右侧学术控制面板空态与深色模式：`chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 现在在概览区补上动态引导句，把“单能力 / 能力编排”切换做成更均衡的双列按钮，并为“常用能力 / 常用工具”在无候选项时提供显式空态说明，避免深色模式下出现大片留白让人误判为面板异常。
- 同步补齐多语言空态文案：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增控制面板空态说明与“可直接开始 / 再展开更多设置”的引导文案，保持五种语言下的状态表达一致。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；并使用 `/Users/hkyutong/.codex/skills/playwright/scripts/playwright_cli.sh` 配合共享 Chromium 完成深色模式真实截图验收，确认右侧控制面板空态不再留白。影响范围：仅聊天前端右侧学术控制面板及多语言文案，不涉及服务端和部署。回滚方式：恢复 `AcademicPanel.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.34 (2026-04-13)
- 补强浏览器运行时禁令：`sop.md`、`memory.md`、`changelog.md` 已再次明确 `/Users/hkyutong/Library/Caches/ms-playwright/chromium-1217/...` 属于全局共享 Playwright Chromium 运行时，严禁清理、删除、移动或替换，也不能当作普通缓存处理。
- 继续收敛科研流水线反馈：`chat/src/views/chat/components/Message/Text/index.vue` 现在在折叠态增加进度条、已完成步数和当前/失败状态 chip，并补上步骤卡片的完成态/运行态/失败态样式，深色模式下也保持更稳定的对比度与状态辨识度；`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 同步新增对应文案。
- 本地验证通过：直接使用项目现有二进制执行 `./chat/node_modules/.bin/vue-tsc --noEmit && echo TYPECHECK_OK` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；期间未下载、安装或升级任何新依赖。影响范围：仅聊天消息区的科研流水线展示与多语言文案，不涉及服务端和部署链路。回滚方式：恢复 `Message/Text/index.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.33 (2026-04-13)
- 收敛空状态首页首屏焦点：`chat/src/views/chat/components/Workspace/Home.vue` 从“说明 + 平铺按钮”重构为“主动作 Hero + 高频能力区 + 科研流水线区”的三段结构，补上真正可点击的“直接开始”和“导入资料”入口，并加入当前能力状态卡与三步引导，减少首屏入口堆叠导致的焦点分散。
- 同步补齐首页文案多语言：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增首屏 Hero、三步引导和科研流水线说明文案，保持多语言界面完整。
- 本地验证通过：直接使用项目现有二进制执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；期间未下载、安装或升级任何新依赖。
- 浏览器验收未完成但已受控停止：尝试用现有 Playwright 包装脚本做本地可视化验收时，包装层报“shared Playwright Chromium is missing”，但共享 Chromium 目录仍在本机缓存中；本轮仅做只读确认，没有下载新浏览器，也没有继续展开排障。影响范围：仅前端空状态首页和对应文案，不涉及接口、服务端或部署链路。风险：主要是尚未完成浏览器级目测验收。回滚方式：恢复 `Workspace/Home.vue` 与上述多语言文件到本次改动前版本即可。

## 0.0.32 (2026-04-13)
- 仅更新项目记录文件，不改业务代码：`sop.md`、`memory.md`、`changelog.md` 已同步补充长期工程约束，明确后续代码必须保持结构清楚、分层明确、命名准确、抽象克制、职责单一、可读可测可维护可扩展，禁止为了图快堆砌屎山代码或主动留下隐性技术债。
- 安全规则进一步收紧：补充“敏感信息、隐私文件和内部资产默认只在本地安全环境处理，遵循最小暴露、最小权限、最小留痕；未经用户明确批准，禁止上传到服务器、GitHub、公开站点或第三方平台”的长期约束，并继续保留 `服务器.txt` 仅限本地使用的禁令。
- 文档维护规则改为强制执行：以后每次任务完成后都要同步更新 `memory.md`、`sop.md`、`changelog.md`，其中 `memory.md` 负责当前状态快照，`changelog.md` 负责已发生事实，`sop.md` 负责稳定流程与长期规范。
- 工具与清理规则补齐：确认可直接使用已安装的插件、skill、Playwright 与现有共享 Chromium；测试结束后主动关闭 Chromium；同时把“清理本地垃圾前必须先评估是否影响业务、调试、审计、回滚和维护”写入长期规则。影响范围仅限记录与流程约束，无运行时行为变化；风险较低。回滚方式：若未来确认这些规则描述需要调整，仅回退本次对 `sop.md`、`memory.md`、`changelog.md` 的文档修改即可。

## 0.0.31 (2026-04-12)
- 完成长会话抗卡死与上线验证收尾：`service/src/modules/chatLog/chatLog.service.ts` 正式固定 `/chatlog/chatList` 为分页接口，`chat/src/store/modules/chat/index.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/index.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 同步完成历史记录分页加载、顶部加载旧消息、可视区窗口化渲染与正文缓存，配合 `service/scripts/prod_gate_suite.mjs`、`service/scripts/full_smoke_test.mjs` 与 `service/playwright/long_chat_pressure.spec.cjs` 完成 500/1000 条长会话压测与发布闸门验证。
- 完成学术上传架构收口：`service/src/modules/academic/academic.service.ts`、`academic-4.0/shared_utils/lens_storage.py`、`academic-4.0/shared_utils/fastapi_stream_server.py`、`academic-4.0/shared_utils/path_safety.py` 与 `academic-4.0/toolbox.py` 将当前“双存原件”改为“共享唯一原件 + academic 按需临时副本”，唯一原件继续保留在 `service/public/file/userFiles`；`private_upload` 只承载远程文件、压缩包和必须改写的学术工作目录，并新增 `24h` 临时副本、`6h` 解压目录、`7d` Lens 专用结果目录清理策略。
- 完成科研流水线 v1：`service/src/modules/academic/academic.service.ts` 新增 `/academic/workflow-process`，支持最多 `1-3` 步的基础能力/研究工具串联执行；`chat/src/views/chat/components/Workspace/Home.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/components/Footer/components/AcademicPanel.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 同步增加模板入口、自定义编排、步骤进度和最终结果展示，保持“单条用户消息 + 单条助手结果”的对话结构。
- 前端交互继续从“工作台”收敛到“研究工具”：`chat/src/views/chat/components/Workspace/Home.vue`、`chat/src/views/chat/components/Message/Text/index.vue`、`chat/src/views/chat/components/Footer/index.vue` 与 `chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 进一步简化首页引导、前置高频能力、弱化右侧辅助面板、压缩用户附件为短标签，并补齐多语言与深色模式细节，目标是保持 Lens 品牌视觉的同时恢复学术 GPT 式的高效交互。
- 完成一次完整发布链路：代码已推送到 `origin/main`（提交 `32420b0 feat: add academic workflows and shared file runtime`），并同步部署到 `/www/wwwroot/Lens/AIWebQuickDeploy` 与 `/www/wwwroot/Lens/academic-4.0`；上线后完成登录、上传、学术调用、支付、科研流水线主链路 smoke，线上 `9520` 与 `38000` 核心接口返回正常。
- 补齐服务器学术运行依赖：服务器 `academic-4.0/venv` 已补装 `openpyxl`、`scipy`、`rarfile`、`py7zr`、`python-pptx`、`pdfminer.six`、`markdownify`，解决 Excel、音频、压缩包、PPT、部分 PDF 与 Markdown 转换类功能的缺包风险。
- 浏览器验收策略更新：Playwright 默认浏览器实测入口改为 `/Users/hkyutong/.codex/skills/playwright/scripts/playwright_cli.sh` 配合 `/Users/hkyutong/.codex/skills/playwright/.playwright/cli.config.json`，默认使用 Playwright 缓存中的 Chromium/Google Chrome for Testing，不再默认依赖本机 `Google Chrome.app`。
- 已知风险：学术服务仍受第三方模型源稳定性影响，单个模型端点超时可能导致个别能力偶发失败；前端深色模式与科研流水线观感仍在持续打磨中。回滚方式：恢复 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat` 与 `/www/wwwroot/Lens/AIWebQuickDeploy/dist` 到上一版发布包、恢复 `/www/wwwroot/Lens/academic-4.0` 到上一版同步内容，并重启 `Lens` 与 `lens-academic`。

## 0.0.30 (2026-03-19)
- 将 `chat` 前端从“通用聊天页 + 学术按钮”重构为“学术工作台”：`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Workspace/Home.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/components/Footer/components/AcademicPanel.vue`、`chat/src/views/chat/components/sider/index.vue`、`chat/src/views/chat/components/sider/List.vue` 与 `chat/src/views/chat/components/sider/ListItem.vue` 现在改为左侧研究导航、中间研究会话区、右侧常驻研究控制栏的布局；空状态首页改成 Research Desk，输入区改成更偏论文/研究工作流的 composer，学术模式在 UI 上提升为“研究模式”主流程。
- 统一学术工作台视觉系统：`chat/src/styles/global.less`、`chat/src/styles/themes/light.css` 与 `chat/src/styles/themes/dark.css` 新增 paper/surface/accent 等设计 token，整体改成更偏专业学术产品的浅色主视觉，同时保留暗色模式兼容。
- 补强站点 SEO 与 AI SEO：`chat/index.html` 与 `chat/src/App.vue` 现在会输出并动态同步 `title`、`description`、`keywords`、`robots`、Open Graph、Twitter Card、canonical 与 JSON-LD 结构化数据；SPA 入口新增可供搜索引擎和 AI 抓取器理解的静态语义首屏。
- 新增 AI 检索与爬虫入口：`chat/public/robots.txt` 增加对 `GPTBot`、`OAI-SearchBot`、`ClaudeBot`、`PerplexityBot` 等爬虫的规则；新增 `chat/public/llms.txt` 与 `chat/public/llms-full.txt` 描述 Lens 的学术产品定位；`chat/public/icon/manifest.webmanifest` 同步补齐名称、描述、启动路径并修复图标路径错误。
- 增加 AI SEO 内容层专题页：新增 `chat/public/seo/research-workspace.html`、`chat/public/seo/paper-summary.html`、`chat/public/seo/arxiv-summary.html`、`chat/public/seo/latex-translation.html`、`chat/public/seo/academic-polishing.html`、`chat/public/seo/faq.html` 与 `chat/public/seo/styles.css`，把 “AI 学术工作台 / 论文速读 / Arxiv / LaTeX / 学术润色 / FAQ” 做成可被搜索引擎和 AI 检索器直接抓取的静态落地页，并接入 `index.html` 静态语义首页、`llms.txt`、`llms-full.txt`、`robots.txt` 与动态 `sitemap.xml` 的发现链路。
- 新增动态站点地图：`service/src/modules/spa/spa.controller.ts` 增加 `/sitemap.xml` 输出，优先跟随后台 `siteUrl` 配置生成公开页面与 AI 文档入口的 sitemap，避免把域名写死在静态文件中。
- 消除前端构建警告：`chat/src/main.ts` 改为只注册实际使用的 Iconify 图标子集，新增 `chat/src/constants/iconCollections.ts` 承载本地图标集合，避免把整套 `@iconify-json/material-symbols` 与 `@iconify-json/ri` 全量打进主包；`chat/vite.config.ts` 调整 Rollup `manualChunks` 粒度，拆分 `markdown/highlight/katex/codemirror` 等 vendor；`chat/src/App.vue`、`chat/src/views/chat/chat.vue`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/index.vue`、`chat/src/views/chat/components/Message/Text/index.vue`、`chat/src/components/SettingsDialog.vue`、`chat/src/components/MobileSettingsDialog.vue` 与 `chat/src/components/Login/Login.vue` 进一步改为按需异步加载重组件和 `mermaid`，最终消除了 `vite build` 的 chunk size 警告，并通过更新 `chat/pnpm-lock.yaml` 中的 `caniuse-lite` 数据消除了 `Browserslist` 过期警告。
- 增加图标兜底：`chat/src/components/common/SvgIcon/index.vue` 现在会对未预注册的字符串图标自动回退到本地 `ri:question-line`，配合 `chat/src/constants/iconCollections.ts` 的已打包图标白名单，避免未来新增图标名但未同步到本地图标集时出现生产环境空白图标。
- 完成验证：`pnpm -C chat type-check`、`pnpm -C chat exec vite build --mode=production`、`pnpm -C service exec tsc -p tsconfig.json --noEmit` 与 `pnpm -C service run build:test` 均通过；当前前端生产构建输出已消除 `chunk size` 与 `Browserslist` 警告。

## 0.0.29 (2026-03-12)
- 修复手机端学术插件面板交互：`chat/src/views/chat/components/Footer/components/AcademicPanel.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/chatBase.vue` 与 `chat/src/store/modules/chat/index.ts` 现在将“学术模式是否启用”和“手机端面板是否展开”拆分为两个状态；右上角 `x` 只会收起手机端学术面板，不会取消当前学术能力选择，底部“学术”按钮在手机端可重新展开面板。
- 收敛生产环境内部错误暴露：`chat/src/main.ts`、`chat/src/views/chat/chatBase.vue` 与 `service/src/modules/academic/academic.service.ts` 现在仅在 `dev/test` 显示调试红条和详细请求标识，生产环境改为通用用户文案，不再直接暴露内部错误状态与请求 ID。
- 修复生产环境学术插件列表异常导致前端崩溃：`chat/src/store/modules/chat/index.ts` 对 `/academic/core-function-list` 与 `/academic/plugin-list` 返回值统一做数组兜底，避免异常返回体触发 `undefined.map`。
- 修复生产环境动态图标回源外网：`chat/src/main.ts` 与 `chat/package.json` 预注册本地图标集，避免生产部署时再请求 `api.simplesvg.com` 导致图标加载失败。
- 优化部署包清理与 macOS 元数据处理：`build.sh` 新增 `sanitize_macos_metadata`，`AIWebQuickDeploy` 打包前会自动移除 `._*` 与 `.DS_Store`，降低上传服务器后出现脏文件的概率。

## 0.0.28 (2026-03-10)
- 修复中英文润色“刷新页面后表格重新挤在一起”：`service/src/modules/academic/academic.service.ts` 现在将流式阶段形成的稳定三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释` 作为只增不减的快照保存，并在正常结束、超时、上游中断与异常分支统一优先用该快照回包和落库，避免后续汇总文本再次污染历史记录。

## 0.0.27 (2026-03-09)
- 修复中英文润色“生成过程是稳定三列表、结束后又跳成拥挤布局”：`chat/src/views/chat/chatBase.vue` 与 `service/src/modules/academic/academic.service.ts` 现在只锁定连续且完整的三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释`，完成态优先保留该稳定表格，不再用后端汇总大段文本覆盖流式结果。
- 修复重新生成与编辑未跟随当前前端选模：`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 与 `service/src/modules/chat/chat.service.ts` 统一显式携带当前 `model/modelName/modelType/modelAvatar`，后端在用户已选模型但配置不可用时直接报错，不再静默回退到默认模型。
- 修复重新生成与编辑误覆盖后续消息链：`chat/src/views/chat/chatBase.vue` 与 `chat/src/views/chat/components/Message/Text/index.vue` 现在只在前端可见列表中裁剪被编辑/重生回复之后的消息，不再误把整段历史回复覆盖到当前气泡里；后端历史记录不删除，只重写当前用户消息对应的第一条 assistant 回复。

## 0.0.26 (2026-03-08)
- 修复中英文润色“刷新页面后表格重新挤成一团”：`service/src/modules/academic/academic.service.ts` 在学术流式阶段检测到稳定的三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释` 后，会优先把该稳定版本持久化到聊天记录，避免刷新后又回退成学术后端最终汇总的大段文本。
- 修复重新生成/编辑后后续聊天记录仍然残留：`chat/src/views/chat/chatBase.vue` 与 `chat/src/views/chat/components/Message/Text/index.vue` 在触发编辑或重生前，先删除当前回复之后的持久化分支消息并同步裁剪本地列表，只保留被编辑用户消息及其即将重写的回复，不再让后续旧对话继续显示。
- 修复中英文润色“生成时表格正常、生成完成后跳一下变拥挤”：`chat/src/views/chat/chatBase.vue` 为润色任务新增稳定三列表快照，一旦流式阶段已经出现正确的 `修改前原文片段 | 修改后片段 | 修改原因与解释` 表格，完成态将直接沿用该快照，不再被学术后端最终汇总文本覆盖，避免第三列解释内容在结束时重新挤成大段。
- 修复重新生成/编辑覆盖错误回复的问题：`chat/src/views/chat/chatBase.vue` 与 `chat/src/views/chat/components/Message/Text/index.vue` 统一改为只覆盖“被编辑用户消息后的第一条 assistant 回复”，不再误选后续回复导致下面聊天记录整体消失。
- 修复重新生成/编辑未跟随当前模型：`chat/src/views/chat/chatBase.vue` 通过 `provide` 暴露当前会话选中模型信息，`chat/src/views/chat/components/Message/Text/index.vue` 在点击重新生成/编辑时显式携带当前模型、模型名、模型类型与头像，确保前端切换模型后后端即时同步使用。

## 0.0.25 (2026-03-08)
- 回退中英文润色结果展示为稳定三列表现：`service/src/modules/academic/academic.service.ts` 移除展示层把 `修改原因与解释` 强拆成 `修改原因 | 修改解释` 的后处理，恢复为学术后端原生三列表格输出，避免生成完成后最终表格列宽失衡、解释内容挤成大段难以阅读。

## 0.0.24 (2026-03-08)
- 修复学术模型切换不同步：`service/src/modules/academic/academic.service.ts` 取消学术链路对 `deepseek-v3.2` 的硬编码静默回退，显式选模时优先按 `model` 与 `modelName` 解析已启用模型；当前端已选择模型但后端无法解析时，直接返回清晰错误而不是偷偷改用默认模型。
- 增加模型切换本地即时生效：`chat/src/views/chat/components/Header/index.vue` 在用户切换模型时先本地更新当前会话 `modelInfo` 并持久化，再异步回写服务端，避免“刚切换模型马上发送学术请求仍带旧模型”的竞态。
- 恢复中英文润色四列表头展示但不再冒险修改学术提示词主体：`service/src/modules/academic/academic.service.ts` 新增润色 Markdown 表格后处理，把稳定输出的三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释` 自动拆成四列表 `修改前原文片段 | 修改后片段 | 修改原因 | 修改解释`，并对原因列做短标签提炼、对解释列做单项说明，降低整段说明挤进同一列的问题。
- 收紧聊天端类型检查范围：`chat/tsconfig.json` 显式限定 `include` 到真实源码文件，并为 `vue-tsc` 打开 `allowJs` 兼容虚拟 `*.vue.js` 伴生文件，避免类型检查误报不存在的 JavaScript 文件。

## 0.0.23 (2026-03-08)
- 修复 `中文润色` 与 `英文润色` 点击后返回“学术后端未返回可展示内容”：`academic-4.0/core_functional.py` 回退这两个按钮的表格提示词到已验证可用的三列表头 `修改前原文片段 | 修改后片段 | 修改原因与解释`，保留“小句/短片段、一行一个局部修改”的粒度约束，避免四列表头提示词导致学术后端产出被打空。

## 0.0.22 (2026-03-08)
- 调整中英文润色表格结构：`academic-4.0/core_functional.py` 将润色结果表头从 `修改前原文片段 | 修改后片段 | 修改原因与解释` 改为 `修改前原文片段 | 修改后片段 | 修改原因 | 修改解释`，并要求“原因”只写简短标签、“解释”只解释单一改动，避免两者混写在同一单元格。
- 移除 `AIWebQuickDeploy/start.sh`：轻量部署包不再内置自动部署脚本，统一改为“人工宝塔 Node 项目部署”模型，避免部署包误导出额外 PM2/用户归属逻辑。
- 修正轻量部署包启动命令：`build.sh` 生成的 `AIWebQuickDeploy/package.json` 现在将 `pnpm start` 与 `pnpm start:daemon` 统一改为 `node ./dist/main.js`，删除对 `bash ./start.sh` 的隐式依赖，解决宝塔环境中删除 `start.sh` 后 `pnpm start` 直接失败的问题。
- 更新宝塔部署说明：`AIWebQuickDeploy/README.md` 与 `docs/DEPLOYMENT.md` 删除 `start.sh` 相关文案，只保留 `dist/main.js` 的人工部署路径。

## 0.0.21 (2026-03-07)
- 调整轻量部署说明为宝塔优先：`AIWebQuickDeploy/README.md` 与 `docs/DEPLOYMENT.md` 现在以“宝塔 Node 项目部署”作为主路径，明确 `AIWebQuickDeploy` 的启动文件应为 `dist/main.js`、运行目录为部署包根目录，`start.sh` 仅保留为命令行兜底方式，不再作为文档中的默认部署入口。
- 优化中英文润色表格粒度：`academic-4.0/core_functional.py` 中的 `中文润色` 与 `英文润色` 提示词改为强制按“小句/短片段”输出 Markdown 表格，列名统一为 `修改前原文片段 | 修改后片段 | 修改原因与解释`，并明确要求“一行只描述一个局部修改、单元格尽量简短”，减少一整段文本被塞进单个表格单元格的情况。
- 调整部署文档为用户无关写法：`docs/DEPLOYMENT.md` 不再绑定 `root/www` 这类特定系统用户，改为要求部署者自行选择并始终使用同一个业务用户，避免文档层误导出交叉启动。
- 修复轻量部署包复用旧 PM2 进程导致环境变量不刷新的问题：`build.sh` 在生成 `AIWebQuickDeploy/package.json` 时将 `pnpm start` 与 `pnpm start:daemon` 统一改为调用 `bash ./start.sh`，确保每次部署都先删除旧的 `Lens` 进程，再基于最新 `.env` 与 `pm2.conf.json` 重新创建进程，不再因为 `restartProcessId` 沿用旧的 `ADMIN_SERVE_ROOT`。
- 清理聊天前端高频调试噪声：移除 `chat/src/App.vue`、`chat/src/utils/request/index.ts`、`chat/src/store/modules/global/index.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/components/Message/Text/index.vue`、`chat/src/components/common/ImageViewer/index.vue` 中的生产路径 `console.log` 调试输出，减少前端控制台垃圾和运行时噪声。
- 修复后台自定义入口与后台前端打包基路径脱节的问题：`admin/vite.config.ts` 生产构建改为相对资源路径，`admin/src/router/index.ts` 生产环境按当前访问路径自适应 `hash` 路由基座，避免后台入口改为 `/alice3306` 后 HTML 仍引用 `/admin/*` 资源、路由仍回跳旧前缀。
- 修复旧 `/admin` 地址在自定义后台入口启用后被聊天前台 SPA 误吞的问题：`service/src/modules/spa/spa.controller.ts` 现在会同时保留对当前后台入口和遗留 `/admin` 的排除，避免旧后台地址误返回前台页面。

## 0.0.20 (2026-03-07)
- 修复后台自定义路径在生产部署中不生效：新增 `service/src/preload-env.ts`，并在 `service/src/main.ts` 中先加载 `.env` 再导入 `AppModule`，确保 `ADMIN_SERVE_ROOT` 等在模块初始化阶段就能读取到，避免后台路径始终回退到 `/admin`。
- 加固 PM2 运行时环境注入：`service/pm2.conf.json` 与 `AIWebQuickDeploy/pm2.conf.json` 新增 `env_file: ".env"`，确保通过 `pm2 start pm2.conf.json`、`AIWebQuickDeploy/start.sh`、宝塔 PM2 等方式启动时都能稳定读取部署目录下的 `.env`。

## 0.0.19 (2026-03-07)
- 修复前台初始化配置请求的域名参数问题：`chat/src/main.ts`、`chat/src/store/modules/auth/index.ts`、`chat/src/api/config.ts` 不再默认把站点域名拼进 `/config/queryFront` 查询串，避免生产站点层因 `domain=https://...` 或空 `domain` 触发额外拦截；前端默认改为直接请求 `/config/queryFront`。
- 加固前台域名同步逻辑：`service/src/modules/globalConfig/globalConfig.service.ts` 现在会规范化 `domain`，仅在拿到有效的 `scheme://host` 后才更新站点域名配置；空值或非法值会自动回退到反向代理请求头，不再把空域名写回数据库配置。

## 0.0.18 (2026-03-07)
- 新增学术服务 PM2 配置文件 `academic-4.0/ecosystem.config.cjs`，可直接供宝塔 PM2「配置文件」模式使用，统一以 `./venv/bin/python` 启动 `shared_utils/fastapi_stream_server.py`，降低学术服务长期运行配置门槛，避免在宝塔界面手工拼接 Python 启动参数。

## 0.0.17 (2026-03-07)
- 修复本地与服务器轻量部署脚本的 `pnpm` 可用性问题：`build.sh` 与 `AIWebQuickDeploy/start.sh` 不再假设 `corepack prepare` 后 `pnpm` 会自动出现在当前 shell 中，统一改为显式走 `corepack pnpm` 兜底，避免 `QUICK_DEPLOY_ONLY=1 ./build.sh` 和部署包 `./start.sh` 在未全局安装 `pnpm` 的环境下直接报 `pnpm: command not found`。
- 保持轻量部署链路可直接复用：当机器未全局安装 `pnpm` 时，部署脚本现在会在不污染现有环境的前提下继续完成依赖安装与启动，降低 `AIWebQuickDeploy` 上传后的一次部署失败概率。

## 0.0.16 (2026-03-06)
- 修复 Linux 服务器部署时 `admin` 的 Vite 配置崩溃：`admin/vite/plugins/compression.ts` 对空的 `VITE_BUILD_COMPRESS` 改为安全兜底，不再对 `undefined` 执行 `split()`，未配置压缩时直接跳过压缩插件，避免一键部署在 `vite build` 阶段报错。
- 修复 Linux 服务器部署时工作区被污染：`build.sh` 的 `admin` 构建改为直接执行 `vue-tsc + vite build`，不再调用 `admin/package.json` 中包含 `pnpm format` 的 `build` 脚本，避免部署后服务器源码被自动改写、`git pull` 被本地改动阻塞。
- 修复 Linux 部署时 `admin` 构建失败：补齐 `admin/src/views/users/index.vue` 与 `admin/src/views/users/accountLog.vue` 缺失的 `getAvatarText`，并为 `admin/src/views/sensitive/violation.vue` 的 `getAvatarText` 增加明确类型声明，消除 `TS2339` 与 `TS7006` 构建错误。
- 清理 `admin/src/views/users/index.vue` 模板中的残留脏字符 `expirationTime`，避免后续模板异常和构建隐患。
- 新增根目录 `test.sql`：写入首发商业化套餐方案，包含 `轻用版 / 专业版 / 旗舰版 / 高级模型加油包 / 特殊模型加油包` 五个正式套餐，并同步将积分公开名称切换为 `基础模型额度 / 高级模型额度 / 特殊模型额度`。
- 将本地数据库 `yuto3996` 的 `crami_package` 与 `config` 实际更新为上述首发套餐结构，清理旧的 `E2E会员包-*` 测试套餐，便于直接在后台与前台上线使用。

## 0.0.15 (2026-03-06)
- 将根目录 `build.sh` 从“本地打包拷贝脚本”重构为“Linux 服务器一键部署启动脚本”：自动检查 `node/npm/pnpm/pm2/python3`、安装 `admin/chat/service` 依赖、构建全部前后端、同步静态资源到 `service/public`、创建 `academic-4.0/venv` 并安装依赖、通过 PM2 启动 `lens-service` 与 `lens-academic`，并在启动后做 `9520/38000` 端口健康检查。
- 新增部署脚本可选能力：支持 `START_DOCKER_DEPS=1` 一键拉起本地 `mysql/redis` 容器依赖，支持 `INSTALL_ACADEMIC=0` 跳过学术引擎依赖安装，方便在不同 Linux 服务器环境复用。
- 同步更新部署文档 `docs/DEPLOYMENT.md`：改为以 `./build.sh` 为主入口，明确当前生产部署方式是由 `service` 统一托管前台 `/` 与后台 `/admin` 静态资源，不再要求单独起 `9000/9002` 开发服务器。
- 补充学术部署约束：`build.sh` 现在默认优先使用 `python3.12` 创建 `academic-4.0/venv`，并强制校验学术解释器精确版本为 `3.12.12`；同时补上 PM2 开机自启配置逻辑，使 `lens-academic` 在异常退出和系统重启后都能继续常驻运行。
- 重写官网产品文案 `docs/PRODUCT_PAGE_COPY.md`：调整为更接近 Prism 风格的用户价值表达，聚焦首屏、价值主张、使用流程、场景与 CTA，不暴露内部实现细节。

## 0.0.14 (2026-03-05)
- 清理仓库敏感信息：`academic-4.0/config.py` 与 `academic-4.0/docs/use_audio.md` 中的真实/高风险密钥示例全部替换为安全占位符，避免触发 GitHub Push Protection。
- 发布链路安全加固：准备重新整理提交历史后推送至 `git@github.com:hkyutong/Lens.git`，确保远程仓库不包含历史密钥痕迹。

## 0.0.13 (2026-03-05)
- 新增项目首页文档：`README.md`，统一 Lens 昱镜产品定位、能力、场景与项目结构说明，作为 GitHub 展示入口。
- 新增产品页文案：`docs/PRODUCT_PAGE_COPY.md`，提供可直接用于官网/发布页的 OpenAI 风格结构化介绍（Hero/价值/能力/CTA）。
- 重写部署文档：`docs/DEPLOYMENT.md` 升级为当前架构的全链路部署指南（service/chat/admin/academic + MySQL/Redis + PM2 + 发布闸门）。
- 新增根目录 `.gitignore`，按标准忽略 `node_modules`、`venv`、日志、运行时上传数据与 `.env`，仅保留源码与必要文档，便于安全推送 GitHub。

## 0.0.12 (2026-03-05)
- 修复服务端退出登录能力：`service/src/modules/auth/auth.controller.ts` 新增 `POST /auth/logout`，`service/src/modules/auth/auth.service.ts` 新增退出逻辑并使当前 JWT 立即失效。
- 强化登录态失效机制：`service/src/modules/redisCache/redisCache.service.ts` 新增 token 黑名单校验，`logout` 后即使是 `super/admin` 角色也会被正确拦截；同时避免 token 池为空时自动回填导致“退出后仍可访问”。
- 修复单模型配置兼容：`service/src/modules/academic/academic.service.ts` 新增学术模型选择兜底策略，优先使用请求模型，不可用时回退到 `deepseek-v3.2` / baseConfig / 首个启用模型，解决“仅配置 deepseek-v3.2 时学术调用报模型不存在”。
- 修复重复登录 token 冲突：`service/src/modules/auth/auth.service.ts` 的登录 JWT 增加 `sessionId`，避免“退出后立即重登拿到同 token 被黑名单误杀”。
- 更新生产闸门脚本：`service/scripts/prod_gate_suite.mjs` 去掉硬编码 `gpt-5-nano`，改为动态解析可用模型（优先 `deepseek-v3.2`），并加入真实 `logout` 校验和用户 token 续期逻辑，避免后台重置/解锁后旧 token 干扰积分与学术测试。
- 生产闸门复测通过：`prod_gate_suite` 最新结果 `totalChecks=24, passChecks=24, failChecks=0, blockers=0, canRelease=true`。

## 0.0.11 (2026-03-03)
- 修复上传文件卡片地址泄露：`chat/src/views/chat/components/Message/Text/index.vue` 将用户上传文件卡由 `<a href>` 直链改为受控按钮下载，不再在浏览器地址栏暴露真实文件地址。
- 新增上传下载代理接口：`service/src/modules/upload/upload.controller.ts` 增加 `POST /upload/file/download`（登录态），前端统一通过该接口下载上传文件。
- 增强下载安全与兼容：`service/src/modules/upload/upload.service.ts` 新增本地文件安全路径解析与流式下载能力，仅允许 `public/file` 目录内文件；同时兼容远程对象存储 URL 的后端转发下载，保证原有用户功能不受影响。

## 0.0.10 (2026-03-03)
- 学术流“覆盖回写”前端落地修复：`chat/src/views/chat/chatBase.vue` 现在消费 `resetContent` 信号并先清空旧流式内容，再追加新内容，修复“中间态+最终态混写”导致的编程分组表格裂行、半渲染与样式错乱。
- 代码解析表格一次性稳定化：`service/src/modules/academic/academic.service.ts` 与 `chat/src/views/chat/components/Message/Text/index.vue` 新增“拆行行对折叠 + 表格内部空行折叠”兜底规则，专门修复“路径行/描述行被拆开并夹分隔线”导致的丑表格。
- 代码解析汇总文本去污染：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 强化摘要清洗，移除汇总句中的表格残片（`| 文件路径 | 功能描述 |`、分隔线、孤立竖线）与“正在开始汇总/程序整体功能概括”噪声，避免再次把表格语法混入正文。
- 发布链路同步：重新构建 `chat` 与 `service` 并同步 `chat/dist -> service/public/chat`，确保线上 9520 实际加载到本次表格修复资源。

## 0.0.9 (2026-03-02)
- 代码解析表格“拆头”渲染修复：`service/src/modules/academic/academic.service.ts` 与 `chat/src/views/chat/components/Message/Text/index.vue` 增加“拆分表头自动合并”规则，支持 `| 文件路径` + `| 功能描述 |` + 分隔线的损坏形态，统一重组成标准 Markdown 表格，修复仍显示竖线文本的问题。
- 代码解析汇总质量回归修复：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 调整摘要压缩策略为“保留反引号内关键标识（如 `main.py`/`__init__.py`）+ 最多两句关键信息”，避免输出被过度裁剪成空括号或过短描述；同时统一表格路径展示为简洁相对路径（去掉 `.zip.extract` 噪声）并使用安全竖线字符，减少表格再次裂行。
- 学术请求链路稳定性增强：`academic-4.0/crazy_functions/crazy_utils.py` 增加并发硬上限（默认 8，可环境变量覆盖）、指数退避重试、空响应判定、失败分片自动补跑（默认 2 轮）与更长看门狗耐心时间，显著降低长任务中断与“只剩警告无结果”的概率。
- 收敛多线程状态刷屏：同文件默认启用紧凑进度模式，并移除逐秒倒计时式重试文案，避免 LaTeX 润色/翻译等任务输出数百行“处理中/重试中”。
- 默认并发配置修正：`academic-4.0/config.py` 将 `DEFAULT_WORKER_NUM` 从 `10000` 调整为 `8`，避免高并发打爆上游导致 `BrokenPipe/ConnectionError`。
- 压缩包上传解析兼容增强：`academic-4.0/shared_utils/handle_upload.py` 支持大小写后缀与更多压缩格式识别（如 `.ZIP/.TGZ/.TAR.GZ/.TXZ`），并保持安全解压校验。
- 代码解析插件上传路径修复：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 新增“文件/目录统一解析 + `.extract` 自动识别”逻辑，修复上传压缩包后误报“找不到文件”。
- 代码解析自定义文件类型增强：同文件支持 `.py/.go/.rs` 这类简写自动转 `*.py/*.go/*.rs`，修复“解析项目源代码（自定义文件类型）”输入扩展名不生效的问题。
- 代码解析汇总表格渲染修复：同文件新增表格输出后处理，自动补齐句子与表头换行、缺失分隔行，避免“| 文件路径 | 功能描述 |”不按 Markdown 表格渲染。
- 代码解析汇总表格回写修复：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 将规范化后的表格 Markdown 回写到当前聊天消息（而非仅内部变量），并补充“粘连行拆分”与分隔行识别，修复界面仍显示未渲染表格的问题。
- 代码解析汇总输出收敛：同文件的汇总提示词改为固定模板（单份表格 + 单句概括），并在后处理中仅保留最后一份有效表格，减少重复表格与脏文本。
- 代码解析汇总彻底稳定化：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 改为“后端固定组装 Markdown 表格 + 模型仅生成一句总体概括”，不再依赖模型直接产出表格，解决行拆裂、重复分隔线、半渲染等问题。
- 前端表格渲染兼容增强：`chat/src/views/chat/components/Message/Text/index.vue` 的 `normalizeMarkdownTables` 新增“前置文案+表头同一行（如 `。 | 文件路径 |`）”拆分逻辑，并放宽两列表格识别，修复该场景下 Markdown 表格无法渲染的问题。
- 代码解析表格“拆行”兜底修复：`service/src/modules/academic/academic.service.ts` 新增 Markdown 表格重组器，自动合并“路径一行 + 描述一行”损坏数据、去除重复分隔行，并在输出净化阶段统一生效，避免流式拼接后表格畸形。
- 前端表格最终态重构：`chat/src/views/chat/components/Message/Text/index.vue` 新增表格行级合并逻辑，对历史脏消息与实时消息统一修复，确保两列表格稳定渲染不再出现竖线散落。
- 代码解析表格后处理重写：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 重构 `_normalize_summary_table_markdown`，去除“每行插入分隔线”的错误逻辑，统一输出单一表头分隔线，并自动合并“路径行/描述行”拆裂数据。
- 学术流覆盖消息改为“替换”语义：`academic-4.0/shared_utils/fastapi_stream_server.py` 在检测到 assistant 文本被覆盖时发送 `resetContent`，`service/src/modules/academic/academic.service.ts` 接收后先清空旧内容再写入，修复“正在开始汇总”等旧进度文案串入最终结果。
- 代码解析汇总中间态降噪：`SourceCode_Analyse.py` 去除“正在开始汇总”文案回写，避免中间进度文本参与后续渲染合并。
- 注释 Python 项目进度体验优化：`academic-4.0/crazy_functions/SourceCode_Comment.py` 改为紧凑进度输出（已完成/处理中），不再反复打印大量“当前任务：正在处理xxx”行。
- 修复 Rust 误报文案：同文件将 Rust 插件“未找到文件”错误从错误的 `golang` 提示改为 Rust 正确提示。
- 路径泄露收敛：`SourceCode_Analyse.py`、`SourceCode_Comment.py`、`Latex_Function.py`、`Latex_Project_Polish.py`、`Latex_Project_Translate_Legacy.py` 的报错与状态提示改为业务文案，不再向用户回显本机真实路径。
- 上传确认展示脱敏：`academic-4.0/toolbox.py` 的上传文件列表展示改为相对路径/文件名，避免前端消息带出绝对路径。
- 核心功能顺序调整：`academic-4.0/core_functional.py` 与 `service/src/modules/academic/academic.service.ts` 将“学术型代码解释（解释代码）”固定到“参考文献转Bib”之后，前后端顺序一致。

## 0.0.8 (2026-03-01)
- 修复学术下载 500：`service/src/modules/academic/academic.service.ts` 的 `proxyFile` 增加下载参数解析与状态映射（400/403/404 -> 明确业务错误），并补齐 `Content-Disposition` 回传，避免前端统一收到 `Internal server error`。
- 修复下载文件元数据被清洗破坏：`service/src/modules/academic/academic.service.ts` 对 `fileVectorResult` 改为结构化保留（路径字段不再被通用文本脱敏破坏），仅规范显示名，避免按钮出现 `{_files__[_` 并导致下载失败。
- 增加前端下载兜底：`chat/src/views/chat/components/Message/Text/index.vue` 新增下载路径解析/合法性校验，自动过滤坏数据并在无效链接时直接提示用户，避免刷新后历史消息触发错误下载请求。
- 修复 LaTeX 内部提示清洗“误删正文”问题：`academic-4.0/toolbox.py` 的运行时文案清洗改为“按句子粒度”移除内部提示，不再因整行匹配导致有效结果被一起删掉。
- 收敛 LaTeX 中间态文案：`academic-4.0/crazy_functions/latex_fns/latex_actions.py` 去除“完成了吗/GPT结果已输出即将编译PDF/当前工作路径”等内部流程与路径提示，仅保留业务状态文案。
- 强化 LaTeX 纯排版片段跳过策略：`academic-4.0/crazy_functions/Latex_Project_Polish.py` 与 `academic-4.0/crazy_functions/latex_fns/latex_actions.py` 优化片段判定，命令密度高、可读正文低的片段直接透传，减少无意义模型调用与异常长输出。
- 修复 LaTeX 摘要兜底稳定性与路径外显：`academic-4.0/crazy_functions/Paper_Abstract_Writer.py` 增强本地兜底摘要清洗（去 Token 警告/重试噪声）、全文兜底来源改为提取后的正文片段，并将提示中的文件标识统一为文件名（不含路径）。
- 收紧上传/下载链路路径展示：`academic-4.0/toolbox.py` 调整上传确认与下载链接展示文案，前端显示仅保留文件名；同时对消息左列也执行路径脱敏，避免 `解析项目: /path/...` 外显。
- 修复 LaTeX 多线程进度刷屏：学术链路新增“任务处理中，请稍候（...）”内联进度噪声清洗（`academic-4.0/toolbox.py`、`service/src/modules/academic/academic.service.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/Text/index.vue`），避免一条回复堆积数百次处理中状态。
- 修复 LaTeX 摘要“只显示 Token 截断警告后停止”问题：`academic-4.0/crazy_functions/Paper_Abstract_Writer.py` 新增摘要前文本净化（过滤 `\put`/坐标排版噪声）与强制兜底摘要路径，确保任务可产出可读结果。
- 优化 LaTeX 润色/翻译性能：`academic-4.0/crazy_functions/Latex_Project_Polish.py`、`academic-4.0/crazy_functions/latex_fns/latex_actions.py` 新增“排版指令片段直通”策略，跳过无语义代码片段的 LLM 调用，显著减少任务分片数量与卡顿概率。
- 收敛 LaTeX 内部流程文案：`latex_actions.py`、`toolbox.py`、`service/src/modules/academic/academic.service.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 统一清理“主文件分析/精细切分”等内部提示，前端仅展示业务状态文案。
- 补齐相对路径脱敏：新增对 `academic-4.0/...`、`gpt_log/...`、`downloadzone/...` 的统一净化规则，修复 LaTeX 润色回执中路径外显问题（含聊天流与报告写盘两条链路）。
- 降低 LaTeX 长任务误中断：`academic-4.0/crazy_functions/crazy_utils.py` 将看门狗耐心时间从 `5s` 提升至 `60s`，并将重试提示改为业务文案，减少网络抖动导致的提前失败。
- 修复 LaTeX 长任务被 5 分钟超时中断：`service/src/modules/academic/academic.service.ts` 本地学术流默认超时从 `300000ms` 提升到 `1800000ms`，减少 `fetch failed` 与中途停止。
- 优化 LaTeX 精准翻译/高亮纠错降级：`academic-4.0/crazy_functions/Latex_Function.py` 在无 `pdflatex` 环境时不再直接终止，改为继续产出可下载的 Tex 结果压缩包。
- 增强 LaTeX 摘要兜底完成率：`academic-4.0/crazy_functions/Paper_Abstract_Writer.py` 增加弱响应判定与本地兜底摘要，避免只返回截断警告后停止。
- 截断提示文案更新：`LaTeX 摘要` 等学术链路的 Token 超限提示统一为 `警告，文本过长将进行截断，Token溢出数：N，现继续运行。`，并同步兼容旧文案去重规则。
- 修复 LaTeX 摘要异常外泄：`academic-4.0/crazy_functions/crazy_utils.py` 不再把 requests/urllib3 traceback 回显到用户消息，改为记录服务端日志并统一提示“学术服务连接异常，请稍后重试”。
- 增加 traceback 二次净化：`academic-4.0/toolbox.py` 新增 `strip_traceback_runtime_noise`，在聊天刷新与报告写盘前剔除 Traceback/urllib3/requests/BrokenPipeError 残留，避免前端与下载报告暴露内部堆栈。
- 收敛 Token 溢出警告刷屏：`service/src/modules/academic/academic.service.ts` 与 `academic-4.0/toolbox.py` 将重复“文本过长截断”警告压缩为单条（保留最大溢出值），并在流式拼接阶段实时去重。
- 修复 `service` 构建阻断：`service/src/modules/userBalance/userBalance.service.ts` 调整动态字段写入类型，消除 `TS2322 (number -> never)`，恢复 `nest build` 可通过，确保学术链路改动可发布。
- 学术插件命名调整：将 `Arxiv 精准翻译` 统一更名为 `Arxiv 英文摘要`（仅改展示名，功能与后端路由保持不变，并兼容旧名称映射）。
- 修复 Arxiv 英文摘要断句异常：`service/src/modules/academic/academic.service.ts` 的摘要切句规则改为“仅在真实句边界切分”，避免 `e.g.` / `i.e.` / `github.com` 被错误拆成换行（如 `e.`、`g.` 或 `github.`、`com`）。
- 脑图一键下载增强：`chat/src/views/chat/components/Message/Text/index.vue` 为 Mermaid 渲染结果新增“点击图下载 + 悬浮下载按钮”，默认导出 PNG，异常时自动回退 SVG；仅在现有渲染层增量实现，不改后端接口与消息结构。
- 修复下载报告路径泄露：`academic-4.0/toolbox.py` 新增统一路径脱敏（`redact_sensitive_path_text`），`write_history_to_file` 写盘前会清理绝对路径/内部目录路径并标准化“找不到文件”文案，避免报告出现真实服务器路径。
- 增加下载区兜底净化：`promote_file_to_downloadzone` 现在会对 `.md/.txt/.log` 报告执行二次内容净化，防止插件链路差异导致路径再次落盘。
- 优化 PDF/Word 批量总结可读性：`academic-4.0/crazy_functions/PDF_Summary.py` 与 `Word_Summary.py` 强化为结构化 Markdown 输出（禁用表格、分点换行），并新增长段落自动拆分，降低“回复挤在一起”问题。
- 收敛历史消息路径占位词：`service/src/modules/chatLog/chatLog.service.ts` 改为直接移除敏感路径，不再返回 `[路径已隐藏]` / `【文件路径已隐藏】` 等内部文案。
- 历史可下载报告补清洗：批量净化 `academic-4.0/gpt_log` 下既有 `.md/.txt/.log` 文件，移除已落盘的绝对路径与内部目录路径，避免旧报告继续泄露路径信息。
- 修复 Arxiv 摘要“收尾被英文覆盖”问题：`service/src/modules/academic/academic.service.ts` 在 `ensureArxivSummary` 增加中文内容保留策略（优先保留流式阶段已生成的中文摘要），仅在内容缺失时才回退 Arxiv 元数据；并优化回退摘要分段，避免结束后挤成一段。
- 补齐相对路径脱敏：`academic-4.0/toolbox.py` 的报告清洗规则新增对 `gpt_log/...` / `downloadzone/...` 等内部相对路径识别（含带空格文件名），报告中仅保留文件名，不再暴露内部目录结构。
- 修复 Arxiv 摘要源头提示：`academic-4.0/crazy_functions/Arxiv_Downloader.py` 的用户展示文案改为仅显示论文文件名，避免把内部存储路径写入历史与下载报告。

## 0.0.7 (2026-03-01)
- 修复路径脱敏外显文案：学术与聊天链路不再向用户展示 `【文件路径已隐藏】` / `[路径已隐藏]` 占位词；找不到文件类报错统一改为业务可读文案（如“找不到任何.tex或.pdf文件。”）。
- 会话列表交互优化：`chat/src/views/chat/components/sider/ListItem.vue` 的三点菜单从“仅当前激活会话可见”调整为“悬浮会话项显示，激活或菜单展开时常显”，提升会话管理操作可发现性。
- 修复 LaTeX 插件首条回复泄露内部说明：`academic-4.0/crazy_functions/Latex_Project_Polish.py` 与 `academic-4.0/crazy_functions/Latex_Function.py` 将开场文案统一为简洁任务状态提示，不再展示“函数插件贡献者/注意事项/平台限制/README”等内部信息。
- 修复 LaTeX 英文润色/中文润色进度刷屏：`academic-4.0/crazy_functions/crazy_utils.py` 为多线程请求新增 `compact_progress` 模式，并在 LaTeX 润色调用侧启用，仅输出聚合进度，避免大量“执行中/已成功”滚动噪声。
- 强化后端流式清洗：`service/src/modules/academic/academic.service.ts` 扩展学术文本去噪规则，新增对“多线程状态矩阵、执行中行、LaTeX 内部说明行、注意事项行”的过滤，防止进入最终消息与落库内容。
- 强化前端实时兜底：`chat/src/views/chat/chatBase.vue` 同步增加噪声识别与行级清洗，确保流式阶段也不会回显 `[Local Message]` 前缀、内部实现说明和多线程状态行。
- 强化学术源头净化：`academic-4.0/toolbox.py` 新增 `strip_plugin_runtime_notice_text` 与 `strip_multithread_status_noise`，对插件输出做统一安全化/简洁化处理。

## 0.0.6 (2026-03-01)
- 修复学术输出刷新后 Markdown 结构丢失问题：`service/src/modules/academic/academic.service.ts` 在流式拼接时保留“仅空白/换行”的结构性 chunk，避免把表格、列表、段落换行误判为噪音丢弃。
- 修复学术流分片去重误删结构字符：保留仅符号分片（如 `**`、`|`、`\n`）避免在 `pickPrimaryAcademicText` 阶段丢失 Markdown 标题和表格语法。
- 修复表格分隔行被错误断行：移除 `getAcademicChunkJoiner` 对 `|` 分片的强制换行逻辑，避免把同一行内的表格 token 拆成多行导致“生成时挤在一起/刷新后丑表格”。
- 修复“句号+换行”误删：学术心跳噪声过滤保留包含结构换行的分片，避免表格前的断句/空行被吞掉。
- 修复前端流式展示与最终落库不一致：`chat/src/views/chat/chatBase.vue` 保留学术流中的结构换行分片，并在学术模式下优先采用后端 `finalContent` 作为最终渲染内容，避免“生成时挤一起、刷新后又变样”。
- 新增前端历史消息表格修复：`chat/src/views/chat/components/Message/Text/index.vue` 自动修复学术输出中的损坏表格语法（表格前换行丢失、分隔行被拆分），提升刷新后展示质量。
- 优化脑图/流程图流式体验：`chat/src/views/chat/components/Message/Text/index.vue` 在流式生成阶段不再实时渲染 Mermaid 图，仅展示稳定源码；消息完成后再一次性渲染图形，减少“源码与图来回跳动”。
- 该修复确保落库 `content` 维持与流式展示一致的换行结构，页面刷新后不再出现“内容挤成一段”。
- 品牌文案统一：将学术导出链路中用户可见的 `GPT-Academic` 报告标题/前缀改为 `Lens Report｜昱镜报告`（含 `toolbox.py` 报告头与默认文件名前缀）。
- 同步替换导出模板中的品牌文案：`shared_utils/advanced_markdown_format.py`、`crazy_functions/pdf_fns/report_template_v2.html`、`Conversation_To_File.py`、`doc_fns/review_fns` 的 Word/TXT/BibTeX 标题统一改为 `Lens ｜昱镜`。
- 同步替换运行期可见提示文案：欢迎语与 AutoGen 等待提示（`themes/welcome.js`、`waifu-tips.js`、`agent_fns/pipe.py`）不再显示 `GPT-Academic`。
- 新增统一聊天输出清洗：`academic-4.0/toolbox.py` 在 `update_ui` 前自动移除 `函数插件作者/贡献者` 文案与 `[Local Message]` 前缀，并去重重复的 Token 截断警告。
- 修复部署包纯打包模式依赖错误：`build.sh` 在 `QUICK_DEPLOY_ONLY=1` 下不再强制要求 `pm2`，本地/构建机可直接生成 `AIWebQuickDeploy` 包，无需预装进程守护工具。
- 修复学术服务日志权限崩溃：`academic-4.0/shared_utils/fastapi_stream_server.py` 的学术日志初始化改为自动尝试 `ACADEMIC_LOG_FILE -> PM2_HOME/logs -> /tmp/lens-academic/academic.log`，即使项目目录日志文件不可写也不会导致 `lens-academic` 启动失败。
- 增强轻量部署防误用提示：`AIWebQuickDeploy/start.sh` 现在会在 root 运行时显式警告 PM2 用户分裂风险，部署文档同步要求统一使用同一业务用户启动。
- 恢复 AIWebQuickDeploy 轻量部署包链路：`build.sh` 现在会自动把 `service dist` 与 `admin/chat dist` 同步到 `AIWebQuickDeploy/`，并新增 `QUICK_DEPLOY_ONLY=1` 只打包不启动模式。
- 新增 `AIWebQuickDeploy/start.sh` 与配套说明文档，目标服务器可直接安装运行时依赖并用 PM2 启动 `Lens`。
- 修复 Linux 部署学术服务缺依赖问题：`academic-4.0/requirements.txt` 补充 `markdown`、`pymdown-extensions`、`python-markdown-math`、`pygments`，避免 `lens-academic` 因 `ModuleNotFoundError: markdown` 启动失败。
- 修复截断提示格式：`crazy_functions/crazy_utils.py` 的超长文本提示改为 `警告，文本过长将进行截断，Token溢出数：N。`，不再输出 `[Local Message]`。
- 修复指定学术插件开场脏文案：`PDF_Summary.py`、`PDF_QA.py`、`Word_Summary.py`、`Arxiv_Downloader.py`、`PDF_Translate.py`、`PDF_Translate_Nougat.py` 去除“函数插件贡献者”展示，并增强 Markdown 结构化输出提示。
- 下载区文件名品牌兜底：`promote_file_to_downloadzone` 与 `write_history_to_file` 会自动把 `GPT-Academic` 前缀替换为 Lens 品牌命名，避免继续出现旧品牌文件名。
- 强化实时流品牌净化链路：`service/src/modules/academic/academic.service.ts` 的 `sanitizeAcademicDelta` / `sanitizeAcademicStreamLine` 现在对流式 chunk 也执行 `[Local Message]` 去前缀、`函数插件作者/贡献者` 清洗、`Lens Report｜昱镜报告` 标题规范化与 Token 截断警告去重，避免“生成时脏、刷新后才干净”。
- 插件列表品牌清洗补齐：`academic-4.0/shared_utils/fastapi_stream_server.py` 与 `service/src/modules/academic/academic.service.ts` 在插件 `info/description` 统一剔除“函数插件作者/贡献者”文案，确保侧栏只展示 Lens 品牌信息。
- 学术流源头补净化：`academic-4.0/shared_utils/fastapi_stream_server.py` 的 `_iter_ndjson_from_updates` 在输出 delta 前统一执行 `sanitize_chatbot_text`，从源头去掉品牌噪声和重复截断提示。
- 表格与脑图渲染稳定性增强：`chat/src/views/chat/components/Message/Text/index.vue` 新增“文内 Mermaid 片段自动围栏化”与更稳健的 Markdown 表格边界/分隔行修复逻辑，减少“生成时挤在一起、刷新后表格畸形”。
- 优化表格视觉样式：`chat/src/views/chat/components/Message/Text/index.vue` 新增表头、单元格、暗色模式等样式，修复刷新后“丑表格”显示体验。
- 下载区既有文件重命名兜底：`academic-4.0/toolbox.py` 新增 `sanitize_download_filename`，当文件已在 downloadzone 时也会自动品牌化重命名，不再保留 `GPT-Academic` 命名。
- 历史报告品牌迁移：一次性批量处理 `academic-4.0/gpt_log/**/*.md`，将历史文件名中的 `GPT-Academic` 迁移为 `Lens-Report`，并把文件内 `# GPT-Academic Report` 标题替换为 `# Lens Report｜昱镜报告`。
- 学术欢迎文案去旧品牌：`academic-4.0/themes/welcome.js.min.d84e650b.js` 的 `欢迎使用GPT-Academic` 已替换为 `欢迎使用Lens｜昱镜`。
- 补强指定插件输出格式约束：`academic-4.0/crazy_functions/PDF_QA.py` 与 `PDF_Summary.py` 增加强制 Markdown 小节+列表提示，降低长段落挤压显示概率。

## 0.0.5 (2026-02-28)
- 修复学术后端动态模型拦截问题：`academic-4.0/request_llms/bridge_all.py` 新增运行时模型自动注册机制，`predict`、`predict_no_ui_long_connection`、`ModelOverride` 全部接入同一校验逻辑。
- 现在 `admin` 新增但未写入 `AVAIL_LLM_MODELS` 的 OpenAI 兼容模型（如 `deepseek-v3.2`）可在请求时自动注册，不再直接报“模型暂不支持”。
- 保留原有前缀策略：`api2d-/azure-/one-api-/vllm-/ollama-/openrouter-/volcengine-` 仍按既有专用路由处理，避免兜底策略误覆盖。
- 修复动态模型 key 识别：`academic-4.0/shared_utils/key_pattern_manager.py` 中未知模型名默认按 OpenAI 兼容 key 选择，避免 `deepseek-v3.2` 被误判为“无可用 key”。

## 0.0.4 (2026-02-28)
- 强制 Playwright Edge-only 策略：新增 `service/playwright.config.mjs`，统一 `use.channel = "msedge"`，并在 `globalSetup` 启动阶段校验策略。
- 新增双保险守卫：`service/scripts/guard_playwright_policy.mjs` 会扫描 `scripts/package.json/CI`，发现 `playwright install` 立即失败；运行时若未检测到 Edge，会直接报“缺少 Edge”并停止，不会自动回退下载 Chromium。
- 新增 Edge 启动器：`service/scripts/run_playwright_edge.mjs`，固定用本机 Edge 执行 Playwright 回归。
- 新增 Mermaid 回归用例：`service/playwright/mermaid_bomb.spec.cjs`，覆盖“语法错误降级 + 不泄漏炸弹错误图”。
- CI 增加策略检查：`electron-build.yml` 在安装依赖前执行 `guard_playwright_policy --scan-only`。

## 0.0.3 (2026-02-28)
- 修复聊天区 Mermaid 语法错误常驻显示问题：启用 `suppressErrorRendering`，并清理 Mermaid 渲染失败时遗留在 `body` 的临时节点（`dmermaid-*` / `imermaid-*`），避免底部持续出现“Syntax error in text”炸弹图。
- 优化 Mermaid 渲染容器绑定：`render` 显式传入当前消息节点并执行 `bindFunctions`，确保错误回退与事件绑定行为一致。

## 0.0.2 (2026-02-28)
- 修复积分并发扣费一致性问题：`deductFromBalance` 改为事务+行级锁，避免并发请求下重复成功或余额更新丢失。
- 修复分享模块安全与冗余逻辑：新增基础 HTML 清洗（拦截 `script`、事件属性、`javascript:` URL），并移除重复数据库查询。
- 修复验收脚本默认账号与环境兼容性：`admin_write_smoke_test`、`full_smoke_test`、`e2e_acceptance` 默认改为 `super/123456`，支持在不同工作目录正确定位 `.env` 与样例文件。
- 修复 `e2e_acceptance` 退出码问题：当步骤失败/校验失败/插件失败时返回非 0，避免“失败却显示通过”。
- 新增生产验收脚本 `service/scripts/prod_gate_suite.mjs`：覆盖登录、后台、积分、安全、性能及数据库落库核验，输出可上线判定与阻断项。
- 为长耗时脚本补充可控参数：`full_smoke_test` 与 `e2e_acceptance` 支持 `*_CORE_ONLY` / `*_PLUGIN_LIMIT`，用于稳定复测与回归。

## 0.0.1 (2026-02-04)
- 初始化版本

- 2026-03-11: 修复刷新后普通聊天消息被误隐藏；收紧学术润色表格快照提取，避免刷新后第三列内容挤在一起。
